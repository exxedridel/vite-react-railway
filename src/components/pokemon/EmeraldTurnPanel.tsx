import { useState } from "react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { submitEmeraldAction } from "@/lib/emerald/commands";
import type { BattleSide, EmeraldChoice } from "@/lib/emerald/types";
import { getCurrentHp } from "@/lib/pokemonStats";
import { Button } from "@/components/ui/button";
export default function EmeraldTurnPanel({ captureId }: { captureId: string }) {
  const dispatch = useAppDispatch();
  const party = useAppSelector((s) => s.party);
  const runtime = party.emerald;
  const [busy, setBusy] = useState(false);
  async function act(side: BattleSide, choice: EmeraldChoice | "cancel") {
    setBusy(true);
    try {
      await dispatch(submitEmeraldAction(captureId, side, choice));
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "No se pudo resolver la acción.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!party.opponent) return null;
  return (
    <div className="space-y-3">
      <p className="text-sm">
        El turno avanza cuando ambos lados eligen. Puedes cerrar este panel para
        seleccionar los movimientos en cada vista.
      </p>
      {runtime?.ended ? (
        <p className="font-semibold">Combate terminado.</p>
      ) : (
        (["player", "opponent"] as const).map((side) => {
          const req = runtime?.requests[side],
            pending = runtime?.pending[side];
          const name =
            side === "player"
              ? party.pokemons.find((p) => p.captureId === captureId)?.pokemon
                  .name
              : party.opponent!.pokemon.name;
          return (
            <section key={side} className="space-y-2 rounded-xl border p-3">
              <h3 className="font-semibold capitalize">
                {name} · {side === "player" ? "Tu Pokémon" : "Rival"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {pending
                  ? "Acción elegida"
                  : req?.forceSwitch
                    ? "Debes escoger un reemplazo"
                    : req?.waiting
                      ? "Esperando al otro lado"
                      : req?.locked
                        ? "Continuación obligatoria"
                        : "Falta elegir acción"}
                {req ? ` · Sexo: ${req.gender}` : ""}
              </p>
              {req?.semiInvulnerable && (
                <div
                  className="rounded-lg border border-brand bg-muted p-2 text-xs"
                  role="status"
                >
                  <p className="font-semibold">
                    {req.semiInvulnerable === "dig"
                      ? "Bajo tierra · Dig"
                      : req.semiInvulnerable === "dive"
                        ? "Bajo el agua · Dive"
                        : "En el aire · Fly / Bounce"}
                  </p>
                  <p className="mt-1">
                    Evita ataques normales mientras permanece en esta fase.
                    Puede recibir daño antes de esconderse o después de salir a
                    atacar, según el orden de actuación.
                  </p>
                  <p className="mt-1">
                    {req.semiInvulnerable === "dig"
                      ? "Earthquake y Magnitude pueden alcanzarlo y causan daño ×2."
                      : req.semiInvulnerable === "dive"
                        ? "Surf y Whirlpool pueden alcanzarlo y causan daño ×2."
                        : "Gust y Twister: daño ×2. Thunder y Sky Uppercut también pueden alcanzarlo."}
                  </p>
                </div>
              )}
              {pending ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void act(side, "cancel")}
                >
                  Cancelar elección
                </Button>
              ) : (
                <>
                  {!req?.waiting && !req?.forceSwitch && (
                    <>
                      {req?.moves.map((m) => (
                        <Button
                          key={m.id}
                          className="mr-1 mb-1 h-auto whitespace-normal"
                          size="sm"
                          variant="outline"
                          disabled={busy || m.disabled}
                          onClick={() =>
                            void act(side, { kind: "move", moveId: m.id })
                          }
                        >
                          {m.name} · {m.pp}/{m.maxpp} PP
                        </Button>
                      ))}
                      {!req?.locked && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void act(side, { kind: "wait" })}
                        >
                          Usar acción de tablero / pasar
                        </Button>
                      )}
                    </>
                  )}
                  {side === "player" && !req?.waiting && !req?.trapped && (
                    <div className="flex flex-wrap gap-1">
                      {party.pokemons
                        .filter(
                          (p) =>
                            p.captureId !== captureId &&
                            getCurrentHp(p.pokemon) > 0,
                        )
                        .map((p) => (
                          <Button
                            key={p.captureId}
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void act(side, {
                                kind: "switch",
                                captureId: p.captureId,
                              })
                            }
                          >
                            Cambiar a {p.pokemon.name}
                          </Button>
                        ))}
                    </div>
                  )}
                </>
              )}
            </section>
          );
        })
      )}
      <p className="text-xs text-muted-foreground">
        Una acción de tablero no ejecuta ataques: úsala para objetos o intentos
        de captura físicos. Esta automatización solo se aplica al encuentro
        salvaje. Los combates de entrenadores siguen siendo manuales.
      </p>
      {!!runtime?.events.length && (
        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm">
            Última resolución
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {runtime.events.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
