import { assertEmeraldCaptureTurnAvailable } from "@/lib/emerald/engine";
import type { CombatState, EmeraldUpdate } from "@/lib/emerald/types";
import { runPlayerActionWithAutomaticOpponent } from "@/lib/opponentAutomation";

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
  const update = runPlayerActionWithAutomaticOpponent(
    input,
    captureId,
    { kind: "wait" },
    seed,
    id,
  );
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
