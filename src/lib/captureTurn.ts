import {
  assertEmeraldCaptureTurnAvailable,
  runEmeraldAction,
} from "@/lib/emerald/engine";
import type { CombatState, EmeraldUpdate } from "@/lib/emerald/types";
import { chooseNpcTrainerAction } from "@/lib/trainerBattle/npcAi";
import type { TrainerBattleSession } from "@/lib/trainerBattle/types";

export const assertCaptureTurnAvailable = assertEmeraldCaptureTurnAvailable;

/** One paid failed throw uses the player's action, without player move PP.
 * Reusing the persisted seed/runtime makes storage retries deterministic. */
export function runFailedCaptureTurn(
  input: CombatState,
  captureId: string,
  seed: [number, number, number, number],
  id: string,
): EmeraldUpdate {
  assertCaptureTurnAvailable(input, captureId, seed);
  let update = runEmeraldAction(
    input,
    captureId,
    "player",
    { kind: "wait" },
    seed,
    id,
  );
  if (update.emerald?.pending.player) {
    const runtime = update.emerald;
    const opponent = update.opponent;
    if (!runtime || !opponent)
      throw new Error("No se pudo recuperar la acción del Pokémon salvaje.");
    const policy: TrainerBattleSession = {
      version: 1,
      id,
      phase: "battle",
      hpMultiplier: 1.3,
      history: [],
      teams: {
        a: {
          name: "Tu equipo",
          pokemons: update.pokemons,
          activeCaptureId: captureId,
        },
        b: {
          name: "Salvaje",
          activeCaptureId: "opponent",
          pokemons: [
            {
              captureId: "opponent",
              pokemon: { ...opponent.pokemon, battleStages: opponent.stages },
              moves: opponent.moves,
              statuses: opponent.statuses,
              statusTurns: opponent.statusTurns,
            },
          ],
        },
      },
      weather: update.battleField?.weather ?? null,
      runtime: {
        engine: runtime.engine,
        serial: runtime.serial,
        turn: update.battleField?.turn ?? 1,
        pending: { a: runtime.pending.player, b: runtime.pending.opponent },
        requests: { a: runtime.requests.player, b: runtime.requests.opponent },
        ended: runtime.ended,
        winner: null,
      },
    };
    const response = chooseNpcTrainerAction(policy);
    if (!response || response.kind !== "move")
      throw new Error("El salvaje no tiene una respuesta legal disponible.");
    update = runEmeraldAction(
      update,
      captureId,
      "opponent",
      response,
      seed,
      id,
    );
  }
  const needsReplacement = !!update.emerald?.requests.player.forceSwitch;
  if (!update.completed && !needsReplacement)
    throw new Error("No se pudo completar el turno de la captura fallida.");
  return {
    ...update,
    // Native play pauses a KO turn for replacement. The thrown ball and wild
    // response are already resolved; replacement must not replay that response.
    completed: true,
    events: [
      "La pokebola falló. Tu lanzamiento consumió la acción del turno.",
      ...update.events,
    ],
  };
}
