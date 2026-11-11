import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LockKeyhole, LogOut, RefreshCw, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/store/hooks";
import { getPvpLock } from "@/lib/pvpParty";
import { usePvpContext } from "@/context/PvpContext";
import { getCurrentHp, getMaxHp } from "@/lib/pokemonStats";
import { STATUS_OPTIONS } from "@/types/pokemon";
import { isTrainerBattle, pvpPlayersOnline } from "@/lib/pvp/types";

export default function PvpPartyGate({ children }: { children: ReactNode }) {
  const pvp = usePvpContext();
  const lock = useAppSelector((state) => getPvpLock(state.party));
  const party = useAppSelector((state) => state.party.pokemons);
  const [retrying, setRetrying] = useState(false);
  const [localError, setLocalError] = useState("");
  if (pvp.user?.role !== "player") return <>{children}</>;
  const battle = pvp.state;
  const active = !!battle && !["finalized", "cancelled"].includes(battle.phase);
  if (pvp.synced && !lock && !active) return <>{children}</>;
  const waitingConnection = !pvp.connected || !pvp.synced;
  const side =
    battle?.side ?? (battle?.players.a.user.id === pvp.user.id ? "a" : "b");
  const trainerBattle = isTrainerBattle(battle);
  const trainerName =
    battle?.trainer?.name ?? battle?.trainer?.team?.name ?? "Trainer";
  const opponent = battle?.players[side === "a" ? "b" : "a"]?.user;
  const team = battle?.team?.pokemons ?? lock?.snapshot?.pokemons ?? party;
  const finished =
    battle?.phase === "finished" ||
    battle?.phase === "finalizing" ||
    battle?.phase === "finalized";
  const saved = lock?.phase === "saved";
  const paused = !!battle && (!battle.host.online || !pvpPlayersOnline(battle));
  const title =
    !lock && !battle
      ? "Verificando tu Party"
      : saved
        ? "Resultado guardado"
        : finished
          ? "Batalla finalizada"
          : paused || waitingConnection
            ? "Batalla en pausa"
            : battle?.phase === "collecting" || battle?.phase === "ready"
              ? "Preparando batalla"
              : "Batalla en curso";
  async function retry() {
    if (retrying) return;
    setRetrying(true);
    setLocalError("");
    try {
      await pvp.sync();
    } catch (reason) {
      setLocalError(
        reason instanceof Error
          ? reason.message
          : "No se pudo recuperar la conexión.",
      );
    } finally {
      setRetrying(false);
    }
  }
  return (
    <main
      className="mx-auto flex min-h-[80dvh] w-full max-w-3xl flex-col gap-5 px-4 py-6"
      data-testid="pvp-party-lock"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-3">
          <Swords className="h-7 w-7 text-brand" />
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <Link to="/logout">
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </Link>
        </Button>
      </header>
      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <p className="flex items-center gap-2 font-semibold">
          <LockKeyhole className="h-5 w-5" /> Tu equipo está protegido
        </p>
        <p className="text-sm text-muted-foreground">
          {!lock && !battle
            ? "Comprobamos si tu equipo tiene una batalla pendiente antes de permitir cambios."
            : saved
              ? trainerBattle
                ? "Tu Party ya recibió el resultado. Esperamos la confirmación del servidor para liberar tu equipo."
                : "Tu Party ya recibió el resultado. Esperamos a que el otro jugador confirme su guardado para liberar los dos equipos."
              : finished
                ? trainerBattle
                  ? "El administrador debe salir de la batalla y confirmar la actualización de tu Party."
                  : "El administrador debe salir de la batalla y confirmar la actualización de ambos Partys."
                : trainerBattle
                  ? "El administrador maneja tu equipo y el Trainer elige sus acciones automáticamente. Mientras termina la batalla no puedes editar, curar, evolucionar o reemplazar tus Pokémon ni modificar tu mochila."
                  : "El administrador maneja ambos equipos. Mientras termina la batalla no puedes editar, curar, evolucionar o reemplazar tus Pokémon ni modificar tu mochila."}
        </p>
        {trainerBattle && (
          <p className="text-sm">
            Trainer Battle · Rival: <strong>{trainerName}</strong>
          </p>
        )}
        {opponent && (
          <p className="text-sm">
            Rival:{" "}
            <strong>
              {opponent.first_name} {opponent.last_name}
            </strong>{" "}
            · {opponent.email}
          </p>
        )}
        {(waitingConnection || paused) && (
          <p role="status" className="text-sm">
            Reconecta los dispositivos participantes para continuar. Recargar o
            cerrar sesión conserva la reserva del equipo.
          </p>
        )}
        {battle?.result && (
          <p className="font-semibold">
            {battle.result.outcome === "win"
              ? "¡Ganaste la batalla!"
              : battle.result.outcome === "lose"
                ? "Esta batalla la ganó tu rival."
                : "La batalla terminó en empate."}
          </p>
        )}
        {(localError || lock?.conflict || pvp.error) && (
          <p role="alert" className="break-words text-sm text-destructive">
            {localError || lock?.conflict || pvp.error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={retrying}
            onClick={() => void retry()}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {retrying ? "Conectando…" : "Reintentar conexión"}
          </Button>
          <Button asChild variant="ghost">
            <Link to="/mensajes-prueba">Mensajes</Link>
          </Button>
        </div>
      </section>
      {team.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Tu equipo · {team.length}/6 Pokémon</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {team.map((capture) => {
              const hp = getCurrentHp(capture.pokemon),
                max = getMaxHp(capture.pokemon) ?? Math.max(1, hp);
              return (
                <article
                  key={capture.captureId}
                  className="space-y-2 rounded-xl border bg-card p-4"
                  data-capture-id={capture.captureId}
                >
                  <div className="flex items-center gap-3">
                    {capture.pokemon.image && (
                      <img
                        src={capture.pokemon.image}
                        alt=""
                        className="h-12 w-12 object-contain [image-rendering:pixelated]"
                      />
                    )}
                    <div>
                      <h3 className="font-bold capitalize">
                        {capture.pokemon.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Nivel {capture.pokemon.level ?? "—"}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm">
                    HP{" "}
                    <strong>
                      {hp}/{max}
                    </strong>
                    {hp <= 0 ? " · Debilitado" : ""}
                  </p>
                  <progress
                    className="h-2 w-full"
                    value={hp}
                    max={max}
                    aria-label={`HP de ${capture.pokemon.name}`}
                  />
                  <p className="text-xs text-muted-foreground">
                    {STATUS_OPTIONS.filter((status) =>
                      capture.statuses?.includes(status.id),
                    )
                      .map((status) => `${status.icon} ${status.label}`)
                      .join(" · ") || "Sin estados negativos"}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
