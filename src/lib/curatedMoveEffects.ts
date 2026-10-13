import { CURATED_MOVE_CATALOG } from "@/lib/curatedMoveCatalog";
import {
  getCurrentHp,
  getMaxHp,
  neutralBattleStages,
} from "@/lib/pokemonStats";
import { clampStage } from "@/lib/battleModifiers";
import {
  STATUS_OPTIONS,
  type Pokemon,
  type PokemonStatus,
  type BattleStages,
  type BattleStageName,
} from "@/types/pokemon";
import type { BattleResult, BattleRolls } from "@/types/battle";
export type EffectCombatant = {
  pokemon: Pokemon;
  statuses: PokemonStatus[];
  stages: BattleStages;
};
const primary = new Set<PokemonStatus>(
  STATUS_OPTIONS.filter((s) => s.group === "primary").map((s) => s.id),
);
export function applyCuratedMoveEffects(
  r: BattleResult,
  own: EffectCombatant,
  foe: EffectCombatant,
  rolls: BattleRolls,
): void {
  const id = r.resolvedMoveId ?? r.moveId,
    e = CURATED_MOVE_CATALOG[id];
  if (
    !e ||
    e.automation === "manual" ||
    !["hit", "status", "miss", "immune"].includes(r.outcome)
  )
    return;
  const p = own.pokemon,
    q = foe.pokemon;
  const options = r.executionOptions ?? {};
  r.hpChanges = [];
  r.statusChanges = [];
  r.effectRolls = [];
  const statusesBefore = {
    attacker: [...own.statuses],
    target: [...foe.statuses],
  };
  r.effectMessages ??= [];
  const beforeP = getCurrentHp(p),
    beforeQ = getCurrentHp(q);
  function hp(c: EffectCombatant, value: number) {
    const stat = c.pokemon.stats.find((s) => s.name === "hp")!;
    stat.value = Math.max(0, Math.min(getMaxHp(c.pokemon)!, Math.floor(value)));
  }
  function heal(c: EffectCombatant, amount: number) {
    const requested = Math.max(0, Math.floor(amount)),
      before = getCurrentHp(c.pokemon);
    hp(c, before + requested);
    if (c === own) {
      r.requestedHealing = requested;
      r.appliedHealing = getCurrentHp(c.pokemon) - before;
    }
  }
  function status(c: EffectCombatant, s: PokemonStatus): void {
    if (getCurrentHp(c.pokemon) <= 0) {
      r.effectMessages!.push(
        `${c.pokemon.name}: no se aplica ${s} porque está debilitado.`,
      );
      return;
    }
    if (s === "flinched" && options.targetHasActed !== false) {
      r.effectMessages!.push(
        "Flinch no aplicado: el objetivo ya actuó o no se confirmó su turno.",
      );
      return;
    }
    if (c.statuses.includes(s)) {
      r.effectMessages!.push(`${c.pokemon.name} ya tiene ${s}.`);
      return;
    }
    if (primary.has(s) && c.statuses.some((x) => primary.has(x))) {
      r.effectMessages!.push(
        `${c.pokemon.name}: ya tiene un estado principal; no se sustituye.`,
      );
      return;
    }
    const types = c.pokemon.types;
    // Gen 3: Electric no es inmune a paralysis; Grass no es inmune a polvos.
    if (
      (["poisoned", "badly-poisoned"].includes(s) &&
        (types.includes("poison") || types.includes("steel"))) ||
      (s === "burned" && types.includes("fire")) ||
      (s === "frozen" && (types.includes("ice") || options.weather === "sun"))
    ) {
      r.effectMessages!.push(`${c.pokemon.name}: inmune a ${s}.`);
      return;
    }
    c.statuses.push(s);
  }
  if ([172, 221].includes(id) && own.statuses.includes("frozen")) {
    own.statuses = own.statuses.filter((s) => s !== "frozen");
    r.effectMessages.push("El movimiento descongeló al usuario.");
  }
  if (r.outcome === "hit") {
    const leave = e.handler === "falseSwipe" ? 1 : 0;
    r.appliedDamage = Math.min(Math.max(0, getCurrentHp(q) - leave), r.damage);
    hp(foe, getCurrentHp(q) - r.appliedDamage);
    if (
      r.damageType === "fire" &&
      r.appliedDamage > 0 &&
      foe.statuses.includes("frozen")
    ) {
      foe.statuses = foe.statuses.filter((s) => s !== "frozen");
      r.effectMessages.push("El ataque de Fire descongeló al objetivo.");
    }
    if (e.drain)
      heal(
        own,
        r.appliedDamage > 0
          ? Math.max(1, Math.floor((r.appliedDamage * e.drain[0]) / e.drain[1]))
          : 0,
      );
    if (e.recoil) {
      const recoil =
        r.appliedDamage > 0
          ? Math.max(
              1,
              Math.floor((r.appliedDamage * e.recoil[0]) / e.recoil[1]),
            )
          : 0;
      hp(own, getCurrentHp(p) - recoil);
      r.effectMessages.push(
        `Retroceso: ${recoil} HP (limitado al HP restante).`,
      );
    }
    if (e.handler === "smellingSalts") {
      foe.statuses = foe.statuses.filter((s) => s !== "paralyzed");
      r.effectMessages.push("Smelling Salts elimina Paralyzed del objetivo.");
    }
    if (e.handler === "rapidSpin") {
      own.statuses = own.statuses.filter(
        (s) => !["bound", "leech-seed"].includes(s),
      );
      r.effectMessages.push(
        "Rapid Spin retira Bound y Leech Seed. Retira también las Spikes del tablero.",
      );
    }
  }
  if (r.outcome === "hit" || r.outcome === "status") {
    if (e.heal) heal(own, (getMaxHp(p)! * e.heal[0]) / e.heal[1]);
    if (e.handler === "weatherHeal")
      heal(
        own,
        getMaxHp(p)! *
          (options.weather === "sun"
            ? 2 / 3
            : options.weather && options.weather !== "none"
              ? 1 / 4
              : 1 / 2),
      );
    if (e.handler === "swallow")
      heal(own, getMaxHp(p)! * ([0, 0.25, 0.5, 1][options.numericValue!] ?? 0));
    if (e.handler === "rest") {
      heal(own, getMaxHp(p)!);
      own.statuses = own.statuses.filter((s) => !primary.has(s));
      own.statuses.push("asleep");
      r.effectMessages.push(
        "Rest: HP restaurado y Asleep durante dos turnos (contador manual).",
      );
    }
    if (e.handler === "bellyDrum") {
      hp(own, getCurrentHp(p) - Math.floor(getMaxHp(p)! / 2));
      own.stages.attack = 6;
      r.effectMessages.push("Belly Drum: Attack +6.");
    }
    if (e.handler === "haze") {
      Object.assign(own.stages, neutralBattleStages());
      Object.assign(foe.stages, neutralBattleStages());
      r.effectMessages.push("Haze: etapas de ambos Pokémon reiniciadas.");
    }
    if (e.handler === "psychUp") {
      Object.assign(own.stages, foe.stages);
      r.effectMessages.push("Psych Up: etapas copiadas del objetivo.");
    }
    if (e.handler === "healParty") {
      own.statuses = own.statuses.filter((s) => !primary.has(s));
      r.effectMessages.push("Estados principales curados.");
    }
    if (e.handler === "refresh") {
      own.statuses = own.statuses.filter(
        (s) =>
          !["burned", "poisoned", "badly-poisoned", "paralyzed"].includes(s),
      );
      r.effectMessages.push(
        "Refresh elimina quemadura, veneno y parálisis del usuario.",
      );
    }
    if (e.handler === "painSplit") {
      const average = Math.floor((beforeP + beforeQ) / 2);
      hp(own, average);
      hp(foe, average);
      r.effectMessages.push(
        `Pain Split: promedio ${average} HP, limitado por el máximo de cada Pokémon.`,
      );
    }
    if (r.presentHealing) heal(foe, getMaxHp(q)! / 4);
    let offset = r.resolvedMoveId ? 1 : 0;
    const random = (i: number) => rolls.extra?.[30 + offset + i] ?? 0.5;
    // Twineedle aplica su oportunidad por golpe; los demás por ejecución.
    const repetitions = id === 41 ? (r.hits?.length ?? 1) : 1;
    for (let hit = 0; hit < repetitions; hit++)
      for (let i = 0; i < e.effects.length; i++) {
        const effect = e.effects[i],
          c = effect.recipient === "attacker" ? own : foe;
        if (getCurrentHp(c.pokemon) <= 0) continue;
        const roll = random(hit * 8 + i * 2) * 100;
        const record: NonNullable<BattleResult["effectRolls"]>[number] = {
          recipient: effect.recipient,
          name: c.pokemon.name,
          chance: effect.chance,
          roll,
          statuses: effect.status ? [effect.status] : effect.randomStatus,
          stages: effect.stages,
          hit: hit + 1,
          passed: roll < effect.chance,
          applied: false,
        };
        // No tirada artificial para efectos garantizados. Se conserva el efecto real.
        if (effect.chance < 100) r.effectRolls.push(record);
        if (!record.passed) continue;
        const beforeStatus = [...c.statuses];
        const beforeStages = { ...c.stages };
        if (effect.status) status(c, effect.status);
        if (effect.randomStatus) {
          record.selectedStatus =
            effect.randomStatus[
              Math.floor(
                random(hit * 8 + i * 2 + 1) * effect.randomStatus.length,
              )
            ];
          status(c, record.selectedStatus);
        }
        for (const [stat, delta] of Object.entries(effect.stages ?? {})) {
          const key = stat as BattleStageName,
            before = c.stages[key];
          c.stages[key] = clampStage(before + delta);
          r.effectMessages.push(
            `${c.pokemon.name}: ${key} ${before} → ${c.stages[key]}.`,
          );
        }
        record.applied =
          c.statuses.some((s) => !beforeStatus.includes(s)) ||
          Object.entries(c.stages).some(
            ([key, value]) => value !== beforeStages[key as BattleStageName],
          );
      }
  }
  if (r.crashDamage) {
    const loss = Math.min(getCurrentHp(p), r.crashDamage);
    hp(own, getCurrentHp(p) - loss);
    r.effectMessages.push(`Caída: −${loss} HP al usuario.`);
  }
  if (
    e.selfDestruct === "always" ||
    (e.selfDestruct === "ifHit" && ["hit", "status"].includes(r.outcome))
  ) {
    hp(own, 0);
    r.effectMessages.push("El usuario se debilita por autodestrucción.");
  }
  for (const [role, combatant] of [
    ["attacker", own],
    ["target", foe],
  ] as const) {
    for (const status of combatant.statuses)
      if (!statusesBefore[role].includes(status))
        r.statusChanges.push({ role, name: combatant.pokemon.name, status });
  }
  r.hpChanges.push(
    { role: "target", name: q.name, before: beforeQ, after: getCurrentHp(q) },
    { role: "attacker", name: p.name, before: beforeP, after: getCurrentHp(p) },
  );
}
