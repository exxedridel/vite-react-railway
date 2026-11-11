import { Dex } from "@pkmn/sim";
import { getEffectiveBattleStats } from "@/lib/battleModifiers";
import { getCurrentHp, getMaxHp } from "@/lib/pokemonStats";
import type {
  TrainerBattleSession,
  TrainerChoice,
  TrainerPokemon,
} from "./types";

const dex = Dex.forGen(3);
const moves = new Map(
  dex.moves
    .all()
    .filter((move) => move.num >= 1 && move.num <= 354 && !move.realMove)
    .map((move) => [move.num, move]),
);
const primary = new Set([
  "burned",
  "frozen",
  "paralyzed",
  "asleep",
  "poisoned",
  "badly-poisoned",
]);
const toType = (type: string) =>
  type[0].toUpperCase() + type.slice(1).toLowerCase();
const delayedMoveIds = new Set([248, 353]); // Future Sight / Doom Desire

/** Delayed hits belong to a battle position, not the current capture. Reading
 * the persisted native condition also works after either Pokemon switches or
 * the administrator reloads, without restoring or advancing the simulator.
 */
function targetHasDelayedAttack(engine: string): boolean {
  try {
    const snapshot = JSON.parse(engine) as {
      sides?: {
        id?: string;
        slotConditions?: {
          futuremove?: { move?: string; duration?: number };
        }[];
      }[];
    };
    const pending = snapshot.sides?.find((side) => side.id === "p1")
      ?.slotConditions?.[0]?.futuremove;
    return (
      !!pending &&
      (pending.move === "futuresight" || pending.move === "doomdesire") &&
      (pending.duration === undefined || pending.duration > 0)
    );
  } catch {
    // Invalid checkpoints are rejected by the battle panel. The policy itself
    // must not throw or invent a new effect when used with incomplete fixtures.
    return false;
  }
}

/** A small deterministic NPC policy, based on the visible active Pokémon.
 * It never reads pending A or advances a simulator/PRNG to inspect its choice.
 * All legality (PP, forced moves, trapping) comes from the native B request.
 */
export function chooseNpcTrainerAction(
  session: TrainerBattleSession,
): TrainerChoice | null {
  const runtime = session.runtime;
  if (
    session.phase !== "battle" ||
    !runtime ||
    runtime.ended ||
    runtime.pending.b
  )
    return null;
  const request = runtime.requests.b;
  if (request.waiting) return null;
  const team = session.teams.b;
  const active = team.pokemons.find(
    (capture) => capture.captureId === team.activeCaptureId,
  );
  const target = session.teams.a.pokemons.find(
    (capture) => capture.captureId === session.teams.a.activeCaptureId,
  );
  const livingBench = team.pokemons.filter(
    (capture) =>
      capture.captureId !== team.activeCaptureId &&
      getCurrentHp(capture.pokemon) > 0,
  );

  function score(moveId: number, user: TrainerPokemon): number {
    const move = moves.get(moveId);
    if (!move) return 0;
    const accuracy =
      typeof move.accuracy === "number" ? move.accuracy / 100 : 1;
    const hpRatio = getCurrentHp(user.pokemon) / (getMaxHp(user.pokemon) ?? 1);
    if (move.category === "Status") {
      if (move.heal) return hpRatio < 0.6 ? 150 * (1 - hpRatio) : 0;
      if (move.status) {
        if (!target || target.statuses?.some((status) => primary.has(status)))
          return 0;
        if (!dex.getImmunity(move.type, target.pokemon.types.map(toType)))
          return 0;
        return (move.status === "slp" ? 65 : 45) * accuracy;
      }
      if (move.id === "attract") {
        return request.gender !== "N" &&
          request.gender !== "—" &&
          runtime!.requests.a.gender !== request.gender &&
          !["N", "—"].includes(runtime!.requests.a.gender) &&
          !target?.statuses?.includes("infatuated")
          ? 25 * accuracy
          : 0;
      }
      if (move.boosts) {
        const self = ["self", "allySide", "allyTeam"].includes(move.target);
        const carrier = self ? user : target;
        const names: Record<string, string> = {
          atk: "attack",
          def: "defense",
          spa: "special-attack",
          spd: "special-defense",
          spe: "speed",
          accuracy: "accuracy",
          evasion: "evasiveness",
        };
        const useful = Object.entries(move.boosts).some(([stat, change]) => {
          const stages = carrier?.pokemon.battleStages;
          const stage = stages?.[names[stat] as keyof typeof stages] ?? 0;
          return change > 0 ? stage < 4 : stage > -4;
        });
        return useful ? 24 * accuracy : 0;
      }
      if (move.weather) return session.weather ? 0 : 16;
      if (move.id === "batonpass") return livingBench.length ? 5 : 0;
      if (["roar", "whirlwind"].includes(move.id))
        return session.teams.a.pokemons.filter(
          (capture) => getCurrentHp(capture.pokemon) > 0,
        ).length > 1
          ? 8
          : 0;
      return 10 * accuracy;
    }
    if (!target) return 1;
    const types = target.pokemon.types.map(toType);
    if (!dex.getImmunity(move.type, types)) return 0;
    const effectiveness = 2 ** dex.getEffectiveness(move.type, types);
    if (typeof move.damage === "number") return move.damage * effectiveness;
    if (move.damage === "level") return user.pokemon.level! * effectiveness;
    const physical = move.category === "Physical";
    const attack = getEffectiveBattleStats(user.pokemon)[
      physical ? "attack" : "special-attack"
    ];
    const defense = getEffectiveBattleStats(target.pokemon)[
      physical ? "defense" : "special-defense"
    ];
    const stab = user.pokemon.types.includes(move.type.toLowerCase()) ? 1.5 : 1;
    const selfDestruct = move.selfdestruct && hpRatio > 0.35 ? 0.35 : 1;
    return (
      (((move.basePower || 40) * stab * effectiveness * accuracy * attack) /
        Math.max(1, defense)) *
      selfDestruct
    );
  }

  function replacement(): TrainerChoice | null {
    const candidate = livingBench
      .map((capture) => ({
        capture,
        score: Math.max(
          0,
          ...(capture.moves ?? []).map((move) => score(move.id, capture)),
        ),
      }))
      .sort((left, right) => right.score - left.score)[0];
    return candidate
      ? { kind: "switch", captureId: candidate.capture.captureId }
      : null;
  }

  if (request.forceSwitch) return replacement();
  // Recharge and multi-turn continuations can have zero PP. They must use the
  // native request's move (including Recharge id 0), never the manual wait action.
  if (request.locked) {
    const forced = request.moves.find((move) => !move.disabled);
    return forced ? { kind: "move", moveId: forced.id } : null;
  }
  const available = request.moves.filter(
    (move) => !move.disabled && (move.pp > 0 || move.maxpp === 0),
  );
  const useful = targetHasDelayedAttack(runtime.engine)
    ? available.filter((move) => !delayedMoveIds.has(move.id))
    : available;
  if (useful.length) {
    const ranked = useful
      .map((move) => ({
        move,
        score: active ? score(move.id, active) : 0,
      }))
      .sort((left, right) => right.score - left.score);
    return { kind: "move", moveId: ranked[0].move.id };
  }
  if (!request.trapped) {
    const substitute = replacement();
    if (substitute) return substitute;
  }
  // A native request can legally offer only a delayed move that would fail
  // while its previous hit is pending. If there is no legal replacement,
  // choose that offered move so the turn can advance to the scheduled hit.
  // Inventing Wait/Struggle or returning null would deadlock the battle.
  if (available.length) return { kind: "move", moveId: available[0].id };
  // An ordinary native move request with exhausted PP supplies Struggle as an
  // available move above. A missing legal request is not an excuse to invent it.
  return null;
}
