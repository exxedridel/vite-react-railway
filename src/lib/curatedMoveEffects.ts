import { CURATED_MOVE_CATALOG } from "@/lib/curatedMoveCatalog";
import { getCurrentHp, getMaxHp } from "@/lib/pokemonStats";
import type { Pokemon } from "@/types/pokemon";
import type { BattleResult } from "@/types/battle";

/** Called inside the Redux transaction, only after an audited hit. */
export function applyCuratedMoveEffects(
  result: BattleResult,
  attacker: Pokemon,
  target: Pokemon,
): void {
  const entry = CURATED_MOVE_CATALOG[result.moveId];
  if (!entry || result.outcome !== "hit") return;
  const targetHp = target.stats.find((stat) => stat.name === "hp");
  const attackerHp = attacker.stats.find((stat) => stat.name === "hp");
  const maxHp = getMaxHp(attacker);
  if (!targetHp || !attackerHp || maxHp === undefined)
    throw new Error("Faltan HP calculados para resolver el movimiento.");
  const before = getCurrentHp(target);
  result.appliedDamage = Math.min(before, result.damage);
  targetHp.value = Math.max(0, before - result.appliedDamage);
  result.hpChanges = [
    { role: "target", name: target.name, before, after: targetHp.value },
  ];
  for (const effect of entry.afterDamage) {
    if (effect.kind === "drain") {
      const requested =
        result.appliedDamage > 0
          ? Math.max(
              1,
              Math.floor(
                (result.appliedDamage * effect.numerator) / effect.denominator,
              ),
            )
          : 0;
      const beforeHeal = attackerHp.value;
      const restored = Math.min(Math.max(0, maxHp - beforeHeal), requested);
      attackerHp.value += restored;
      result.hpChanges.push({
        role: "attacker",
        name: attacker.name,
        before: beforeHeal,
        after: attackerHp.value,
      });
      result.requestedHealing = requested;
      result.appliedHealing = restored;
    }
  }
}
