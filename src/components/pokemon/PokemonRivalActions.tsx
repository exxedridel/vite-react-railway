import { useState, type Dispatch, type SetStateAction } from "react";
import type { BattleOpponent } from "@/lib/battleOpponent";
import { getCurrentHp, getMaxHp } from "@/lib/pokemonStats";
import { clampStage, normalizeStages } from "@/lib/battleModifiers";
import { hasLivingHp } from "@/lib/pokemonCondition";
import { useAppSelector } from "@/store/hooks";
import { Button } from "@/components/ui/button";
import PokemonHpControls from "./PokemonHpControls";
import PokemonHpBar from "./PokemonHpBar";
import PokemonTypeBadges from "./PokemonTypeBadges";
import PokemonBattleStatsControls from "./PokemonBattleStatsControls";
import PokemonMoveExecutionDialog from "./PokemonMoveExecutionDialog";

export default function PokemonRivalActions({
  opponent,
  captureId,
  onChange,
  section,
}: {
  opponent: BattleOpponent;
  captureId: string;
  onChange: Dispatch<SetStateAction<BattleOpponent | null>>;
  section: "hp" | "moves" | "stats";
}) {
  const [moveId, setMoveId] = useState<number | null>(null);
  const capture = useAppSelector((state) =>
    state.party.pokemons.find((p) => p.captureId === captureId),
  );
  const update: typeof onChange = (value) =>
    onChange((current) => {
      if (
        !current ||
        current.pokemon.id !== opponent.pokemon.id ||
        current.encounterId !== opponent.encounterId
      )
        return current;
      return typeof value === "function" ? value(current) : value;
    });
  return (
    <section className="shrink-0 space-y-3 rounded-2xl border bg-card p-4 text-card-foreground">
      {section === "hp" && (
        <>
          <h2 className="font-semibold capitalize">
            HP · {opponent.pokemon.name}
          </h2>
          {opponent.kind === "wild" ? (
            <PokemonHpControls
              currentHp={getCurrentHp(opponent.pokemon)}
              maxHp={getMaxHp(opponent.pokemon)}
              onChangeHp={(amount) => {
                if (!Number.isSafeInteger(amount)) return;
                update((current) => {
                  if (!current) return current;
                  const max = getMaxHp(current.pokemon);
                  if (max === undefined) return current;
                  return {
                    ...current,
                    pokemon: {
                      ...current.pokemon,
                      stats: current.pokemon.stats.map((s) =>
                        s.name === "hp"
                          ? {
                              ...s,
                              value: Math.max(
                                0,
                                Math.min(max, s.value + amount),
                              ),
                            }
                          : s,
                      ),
                    },
                  };
                });
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              El entrenador rival controla su HP en su celular. Máximo:{" "}
              {getMaxHp(opponent.pokemon) ?? "—"}.
            </p>
          )}
          {opponent.kind === "wild" && (
            <PokemonHpBar pokemon={opponent.pokemon} />
          )}
        </>
      )}
      {section === "moves" && (
        <>
          <h2 className="font-semibold">Movimientos del rival</h2>
          {opponent.kind === "wild" ? (
            <>
              <p className="text-xs text-muted-foreground capitalize">
                Frente a {capture?.pokemon.name ?? "tu Pokémon"}. El daño
                directo recibido se descuenta automáticamente.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(opponent.moves ?? []).map((move) => (
                  <article
                    key={move.id}
                    className="flex flex-col gap-2 rounded-xl border p-3"
                  >
                    <h3 className="text-sm font-semibold">
                      {move.displayName}
                    </h3>
                    <PokemonTypeBadges types={[move.type]} />
                    <p className="text-xs text-muted-foreground">
                      {move.damageClass} · Power {move.power ?? "—"} · Accuracy{" "}
                      {move.accuracy ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {move.description}
                    </p>
                    <Button
                      className="mt-auto"
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        !hasLivingHp(opponent.pokemon) ||
                        !hasLivingHp(capture?.pokemon)
                      }
                      onClick={() => setMoveId(move.id)}
                    >
                      Usar movimiento
                    </Button>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              El otro entrenador ejecuta sus movimientos en su celular.
            </p>
          )}
          {moveId !== null && opponent.kind === "wild" && (
            <PokemonMoveExecutionDialog
              key={`${captureId}:${opponent.encounterId}:${moveId}`}
              actorSide="opponent"
              captureId={captureId}
              moveId={moveId}
              onClose={() => setMoveId(null)}
            />
          )}
        </>
      )}
      {section === "stats" && (
        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Stats y cambios durante el combate
          </summary>
          <div className="mt-3">
            <PokemonBattleStatsControls
              pokemon={opponent.pokemon}
              stages={normalizeStages(opponent.stages)}
              ownerLabel={`rival ${opponent.pokemon.name}`}
              onChangeStage={(stat, amount) =>
                update((current) =>
                  current
                    ? {
                        ...current,
                        stages: {
                          ...normalizeStages(current.stages),
                          [stat]: clampStage(
                            (current.stages[stat] ?? 0) + amount,
                          ),
                        },
                      }
                    : current,
                )
              }
              onReset={() =>
                update((current) =>
                  current ? { ...current, stages: normalizeStages() } : current,
                )
              }
            />
          </div>
        </details>
      )}
    </section>
  );
}
