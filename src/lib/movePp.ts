import gen3Pp from "./movePpData.json";
import type { LearnedMove, PokemonMove } from "@/types/moves";
import type { PartyState } from "@/slices/partySlice";

type PpMove = Pick<LearnedMove, "id" | "pp"> & { currentPp?: number };
const fallbackPp = gen3Pp as Record<string, number>;

/** No PP Ups: preserve the move's displayed catalog maximum, with a Gen III
 * fallback for old catalog entries that did not carry PP. */
export function getMaxMovePp(move: Pick<PpMove, "id" | "pp">): number {
  const max = move.pp;
  return Number.isSafeInteger(max) && Number(max) >= 0 && Number(max) <= 100
    ? Number(max)
    : (fallbackPp[String(move.id)] ?? 0);
}

export function getCurrentMovePp(move: PpMove): number {
  const max = getMaxMovePp(move);
  if (move.currentPp === undefined) return max;
  return Number.isFinite(move.currentPp)
    ? Math.max(0, Math.min(max, Math.floor(move.currentPp)))
    : 0;
}

export function normalizeMovePp<T extends PpMove>(
  move: T,
): T & { currentPp: number } {
  const currentPp = getCurrentMovePp(move);
  return move.currentPp === currentPp
    ? (move as T & { currentPp: number })
    : { ...move, currentPp };
}

export function restoreMovePp<T extends PpMove>(
  move: T,
): T & { currentPp: number } {
  return { ...move, currentPp: getMaxMovePp(move) };
}

export const maxMovePp = getMaxMovePp;
export const currentMovePp = getCurrentMovePp;
export const initializeMovePp = normalizeMovePp;

/** Synthetic action only: never add Struggle to a learned move slot. */
export function getStruggleMove(): PokemonMove {
  return {
    id: 165,
    name: "struggle",
    displayName: "Struggle",
    type: "normal",
    damageClass: "physical",
    power: 50,
    accuracy: null,
    pp: 1,
    priority: 0,
    description:
      "Sólo disponible cuando todos los movimientos están agotados. Causa daño de retroceso.",
  };
}

const nativeId = (name: string) => {
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string> = {
    vicegrip: "visegrip",
    faintattack: "feintattack",
    hijumpkick: "highjumpkick",
    smellingsalt: "smellingsalts",
  };
  return aliases[id] ?? id;
};

/** Recover PP from an existing native snapshot before removing an old encounter.
 * Do not use this on reserved party snapshots: their original hash is immutable.
 * A broken native snapshot is left untouched instead of replenishing its PP. */
export function hydratePartyMovePp<T extends PartyState>(input: T): T {
  let native: Record<string, unknown> | undefined;
  if (input.emerald) {
    try {
      const parsed: unknown = JSON.parse(input.emerald.engine);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray((parsed as { sides?: unknown }).sides)
      )
        return input;
      native = parsed as Record<string, unknown>;
    } catch {
      return input;
    }
  }
  const nativeSides = native?.sides as
    | {
        id?: string;
        pokemon?: {
          set?: { name?: string; moves?: string[] };
          moveSlots?: { id?: string; pp?: number }[];
          baseMoveSlots?: { id?: string; pp?: number }[];
          boardOriginalPp?: Record<string, { pp?: number }>;
        }[];
      }[]
    | undefined;
  const hydrate = <TMove extends LearnedMove>(
    moves: TMove[] | undefined,
    captureId: string,
    side: "p1" | "p2",
  ) => {
    const pokemon = nativeSides
      ?.find((entry) => entry.id === side)
      ?.pokemon?.find((entry) => entry.set?.name === captureId);
    const slots = pokemon?.baseMoveSlots ?? pokemon?.moveSlots;
    return moves?.map((move) => {
      if (move.currentPp !== undefined) return normalizeMovePp(move);
      if (!native) return normalizeMovePp(move);
      const id = nativeId(move.name);
      const slot =
        slots?.find((entry) => entry.id === id) ??
        pokemon?.boardOriginalPp?.[id];
      if (!slot && pokemon?.set?.moves?.some((name) => nativeId(name) === id))
        return normalizeMovePp({ ...move, currentPp: 0 });
      return Number.isSafeInteger(slot?.pp)
        ? normalizeMovePp({ ...move, currentPp: slot!.pp })
        : move;
    });
  };
  try {
    return {
      ...input,
      pokemons: input.pokemons.map((capture) => ({
        ...capture,
        moves: hydrate(capture.moves, capture.captureId, "p1"),
      })),
      ...(input.opponent
        ? {
            opponent: {
              ...input.opponent,
              moves: hydrate(input.opponent.moves, "opponent", "p2"),
            },
          }
        : {}),
    };
  } catch {
    // Leave malformed engine data available for the existing recovery UI.
    return input;
  }
}
