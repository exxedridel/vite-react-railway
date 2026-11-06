import { useState } from "react";
import { Link } from "react-router-dom";
import { LogOut, RotateCcw, Shield, Swords } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/ui/mode-toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import TrainerTeamEditor from "@/components/admin/TrainerTeamEditor";
import TrainerBattleView from "@/components/admin/TrainerBattleView";
import { startTrainerBattle } from "@/lib/trainerBattle/engine";
import {
  createTrainerBattleSession,
  readTrainerBattleSession,
  trainerSetupErrors,
  writeTrainerBattleSession,
} from "@/lib/trainerBattle/model";
import type {
  TrainerBattleSession,
  TrainerSide,
  TrainerTeam,
} from "@/lib/trainerBattle/types";
import {
  createLeveledPokemon,
  getCurrentHp,
  getMaxHp,
  preserveHpRatio,
} from "@/lib/pokemonStats";
import { clearBattleConditions } from "@/lib/pokemonCondition";
import { WEATHER_LABELS, type WeatherKind } from "@/lib/battleField";
import { GEN3_WEATHER } from "@/lib/gen3Weather";

function loadBattle() {
  try {
    return {
      session:
        readTrainerBattleSession(localStorage) ?? createTrainerBattleSession(),
      error: "",
    };
  } catch (error) {
    return {
      session: createTrainerBattleSession(),
      error:
        error instanceof Error
          ? error.message
          : "No se pudo recuperar la batalla guardada en este navegador.",
    };
  }
}

export default function AdminBattlePanel() {
  const [loaded] = useState(loadBattle);
  const [session, setSession] = useState(loaded.session);
  const [storageError, setStorageError] = useState(loaded.error);
  const [confirmation, setConfirmation] = useState<"new" | "edit" | null>(null);
  const errors = session.phase === "setup" ? trainerSetupErrors(session) : [];

  function commit(next: TrainerBattleSession) {
    try {
      writeTrainerBattleSession(localStorage, next);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo guardar la batalla. Revisa el almacenamiento del navegador.";
      setStorageError(message);
      throw new Error(message);
    }
    setStorageError("");
    setSession(next);
  }

  function changeTeam(side: TrainerSide, team: TrainerTeam) {
    commit({ ...session, teams: { ...session.teams, [side]: team } });
  }

  function changeMultiplier(multiplier: number) {
    try {
      const next = structuredClone(session);
      next.hpMultiplier = multiplier;
      for (const side of ["a", "b"] as const) {
        for (const member of next.teams[side].pokemons) {
          const currentHp = getCurrentHp(member.pokemon);
          const oldMax = getMaxHp(member.pokemon)!;
          member.pokemon = createLeveledPokemon(
            member.pokemon,
            member.pokemon.baseStats,
            member.pokemon.level,
            multiplier,
          );
          member.pokemon.stats.find((s) => s.name === "hp")!.value =
            preserveHpRatio(currentHp, oldMax, getMaxHp(member.pokemon)!);
        }
      }
      commit(next);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo cambiar el multiplicador de HP.",
      );
    }
  }

  function begin() {
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    try {
      const seed = Array.from(crypto.getRandomValues(new Uint16Array(4))) as [
        number,
        number,
        number,
        number,
      ];
      commit(startTrainerBattle(session, seed));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo iniciar la batalla.",
      );
    }
  }

  function confirmReset() {
    try {
      if (confirmation === "new") {
        commit(createTrainerBattleSession());
      } else {
        const next = structuredClone(session);
        next.phase = "setup";
        next.runtime = null;
        next.history = [];
        if (next.weather)
          next.weather = { kind: next.weather.kind, turnsLeft: 5 };
        for (const side of ["a", "b"] as const)
          for (const member of next.teams[side].pokemons)
            clearBattleConditions(member);
        commit(next);
      }
      setConfirmation(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la configuración.",
      );
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-3 pb-8 pt-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <Shield className="h-8 w-8 shrink-0 text-brand" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Administrador · Gimnasio / JcJ
            </p>
            <h1 className="text-2xl font-bold">Panel batalla</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-10 gap-2"
            onClick={() => setConfirmation("new")}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Nueva batalla
          </Button>
          <ModeToggle />
          <Button asChild variant="outline" size="icon">
            <Link to="/logout" aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {storageError && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          {storageError}
        </p>
      )}

      {session.phase === "setup" ? (
        <>
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-4">
            <div className="max-w-2xl space-y-1">
              <h2 className="font-semibold">Prepara los dos equipos</h2>
              <p className="text-sm text-muted-foreground">
                Agrega hasta seis Pokémon por lado y elige quién comienza. El
                nivel determina las estadísticas; puedes ajustar el HP actual,
                los movimientos y los estados de cada Pokémon.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="space-y-1 text-sm font-medium">
                <span className="block">Multiplicador de HP</span>
                <select
                  value={session.hpMultiplier}
                  onChange={(e) => changeMultiplier(Number(e.target.value))}
                  className="h-11 rounded-md border border-input bg-background px-3"
                >
                  {Array.from({ length: 11 }, (_, i) => (10 + i) / 10).map(
                    (value) => (
                      <option key={value} value={value}>
                        ×{value.toFixed(1)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium">
                <span className="block">Clima inicial</span>
                <select
                  value={session.weather?.kind ?? "none"}
                  onChange={(e) => {
                    try {
                      commit({
                        ...session,
                        weather:
                          e.target.value === "none"
                            ? null
                            : {
                                kind: e.target.value as WeatherKind,
                                turnsLeft: 5,
                              },
                      });
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "No se pudo guardar el clima.",
                      );
                    }
                  }}
                  className="h-11 rounded-md border border-input bg-background px-3"
                >
                  <option value="none">
                    {
                      GEN3_WEATHER.find((weather) => weather.id === "none")!
                        .icon
                    }{" "}
                    Sin clima
                  </option>
                  {Object.entries(WEATHER_LABELS).map(([id, label]) => (
                    <option key={id} value={id}>
                      {GEN3_WEATHER.find((weather) => weather.id === id)!.icon}{" "}
                      {label} · 5 turnos
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {(["a", "b"] as const).map((side) => (
              <TrainerTeamEditor
                key={side}
                side={side}
                team={session.teams[side]}
                hpMultiplier={session.hpMultiplier}
                onChange={(team) => changeTeam(side, team)}
              />
            ))}
          </div>
          <section className="space-y-3 rounded-2xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Cada lado elige una acción. Cambiar de Pokémon consume esa acción
              y conserva HP y estados principales; los modificadores y estados
              temporales se limpian al retirarlo. Los reemplazos por
              debilitamiento se resuelven cuando los solicita el combate.
            </p>
            {errors.length > 0 && (
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {errors.slice(0, 6).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
            <Button
              type="button"
              className="min-h-12 w-full gap-2 text-base sm:w-auto sm:px-8"
              disabled={errors.length > 0}
              onClick={begin}
            >
              <Swords className="h-5 w-5" aria-hidden="true" /> Iniciar batalla
            </Button>
          </section>
        </>
      ) : (
        <TrainerBattleView
          session={session}
          onChange={commit}
          onEditSetup={() => setConfirmation("edit")}
        />
      )}

      <p className="text-center text-xs text-muted-foreground">
        Los equipos y la batalla se guardan en este navegador después de cada
        cambio confirmado.
      </p>

      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              {confirmation === "new"
                ? "¿Preparar una nueva batalla?"
                : "¿Volver a configurar los equipos?"}
            </DialogTitle>
            <DialogDescription>
              {confirmation === "new"
                ? "Se descartarán los dos equipos y el combate guardado de este panel."
                : "Se conservarán los Pokémon, sus HP y estados principales. Se limpiarán los efectos temporales y se descartará el combate actual y su historial."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmation(null)}
            >
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={confirmReset}>
              {confirmation === "new" ? "Nueva batalla" : "Volver a configurar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
