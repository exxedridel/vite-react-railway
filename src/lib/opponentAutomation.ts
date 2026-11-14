import { runEmeraldAction } from "@/lib/emerald/engine";
import type {
  CombatState,
  EmeraldChoice,
  EmeraldUpdate,
} from "@/lib/emerald/types";
import { chooseNpcTrainerAction } from "@/lib/trainerBattle/npcAi";
import type { TrainerBattleSession } from "@/lib/trainerBattle/types";

/** Reuse the Trainer Battle policy with the native local encounter's legal
 * request. No simulation, RNG draw or player-choice inspection happens here. */
function opponentResponse(
  update: EmeraldUpdate,
  captureId: string,
  id: string,
) {
  const runtime = update.emerald;
  const opponent = update.opponent;
  if (!runtime || !opponent) return null;
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
        activeCaptureId: update.battleField?.activeCaptureId ?? captureId,
      },
      b: {
        name: opponent.kind === "wild" ? "Salvaje" : "Entrenador",
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
  return chooseNpcTrainerAction(policy);
}

/** Submit one player action, then at most one missing opponent choice. Forced
 * continuations and preselected actions are already handled by the engine.
 * This never advances a later turn, or acts while a KO needs a replacement.
 * Callers persist the complete result atomically (including paid item plans).
 * Capture misses deliberately use this even for manual wild encounters. */
export function runPlayerActionWithAutomaticOpponent(
  input: CombatState,
  captureId: string,
  choice: EmeraldChoice,
  seed: [number, number, number, number],
  id: string,
): EmeraldUpdate {
  const update = runEmeraldAction(input, captureId, "player", choice, seed, id);
  const runtime = update.emerald;
  if (
    !update.opponent ||
    !runtime ||
    runtime.ended ||
    !runtime.pending.player ||
    runtime.pending.opponent ||
    runtime.requests.player.forceSwitch ||
    runtime.requests.opponent.waiting ||
    runtime.requests.opponent.forceSwitch
  )
    return update;
  const response = opponentResponse(update, captureId, id);
  if (!response || response.kind !== "move")
    throw new Error("El rival no tiene una respuesta legal disponible.");
  return runEmeraldAction(update, captureId, "opponent", response, seed, id);
}
