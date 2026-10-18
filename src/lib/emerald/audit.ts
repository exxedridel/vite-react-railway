import type { Battle } from "@pkmn/sim";
/** Observe actual engine RNG without drawing additional random values or changing
 * its results. All overrides are removed before serializing the battle. */
export function installRollAudit(b: Battle): () => void {
  let context = "";
  let effects: {
    chance?: number;
    status?: string;
    volatileStatus?: string;
    boosts?: unknown;
    self?: unknown;
  }[] = [];
  let effectIndex = 0;
  const random = b.random,
    chance = b.randomChance;
  const accuracy = b.actions.hitStepAccuracy,
    damage = b.actions.getDamage,
    secondary = b.actions.secondaries;
  const randomDescriptor = Object.getOwnPropertyDescriptor(b, "random");
  const chanceDescriptor = Object.getOwnPropertyDescriptor(b, "randomChance");
  b.randomChance = function (n, d) {
    const roll = this.prng.clone().random(d);
    const passed = chance.call(this, n, d);
    const label =
      context === "accuracy"
        ? "Accuracy"
        : context === "damage" && n === 1
          ? "Critical hit"
          : this.effect?.name || "Comprobación";
    if (
      context ||
      this.activeMove ||
      ["par", "frz", "confusion", "attract"].includes(this.effect?.id)
    )
      this.add(
        "boardchance",
        label,
        n,
        d,
        roll,
        passed ? "favorable" : "fallida",
      );
    return passed;
  };
  b.random = function (m, n) {
    const roll = random.call(this, m, n);
    if (
      context === "secondary" &&
      m === 100 &&
      n === undefined &&
      effectIndex < effects.length
    ) {
      const e = effects[effectIndex++];
      const label =
        e.status ||
        e.volatileStatus ||
        (e.boosts || e.self ? "Modificador de stats" : "Efecto adicional");
      this.add(
        "boardchance",
        label,
        e.chance ?? 100,
        100,
        roll,
        roll < (e.chance ?? 100) ? "favorable" : "fallida",
      );
    }
    return roll;
  };
  b.actions.hitStepAccuracy = function (...args) {
    const prev = context;
    context = "accuracy";
    try {
      return accuracy.apply(this, args);
    } finally {
      context = prev;
    }
  };
  b.actions.getDamage = function (...args) {
    const prev = context;
    context = "damage";
    try {
      return damage.apply(this, args);
    } finally {
      context = prev;
    }
  };
  b.actions.secondaries = function (...args) {
    const prev = context,
      oldEffects = effects,
      oldIndex = effectIndex;
    context = "secondary";
    effects = args[3].secondaries ?? [];
    effectIndex = 0;
    try {
      return secondary.apply(this, args);
    } finally {
      context = prev;
      effects = oldEffects;
      effectIndex = oldIndex;
    }
  };
  return () => {
    if (randomDescriptor) Object.defineProperty(b, "random", randomDescriptor);
    else Reflect.deleteProperty(b, "random");
    if (chanceDescriptor)
      Object.defineProperty(b, "randomChance", chanceDescriptor);
    else Reflect.deleteProperty(b, "randomChance");
    b.actions.hitStepAccuracy = accuracy;
    b.actions.getDamage = damage;
    b.actions.secondaries = secondary;
  };
}
