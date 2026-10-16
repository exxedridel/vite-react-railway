import {
  GEN3_CAPTURE_SPECIES,
  type CaptureSpecies,
} from "./gen3CaptureSpecies";
import type { PokemonStatus, Pokemon } from "@/types/pokemon";
import { getCurrentHp, getMaxHp } from "./pokemonStats";
import { encounterSpeciesIds } from "./gameSettings";
export type CatchTierColor =
  | "pink"
  | "green"
  | "blue"
  | "yellow"
  | "red"
  | "gold";
export type CatchTier = {
  color: CatchTierColor;
  name: string;
  hexColor: string;
  targetD20: number;
  description: string;
};
export const CATCH_TIERS: Record<CatchTierColor, CatchTier> = {
  pink: {
    color: "pink",
    name: "Rosa",
    hexColor: "#FFB6C1",
    targetD20: 6,
    description: "Muy común · tasa 200–255",
  },
  green: {
    color: "green",
    name: "Verde",
    hexColor: "#90EE90",
    targetD20: 9,
    description: "Común · tasa 150–199",
  },
  blue: {
    color: "blue",
    name: "Azul",
    hexColor: "#87CEFA",
    targetD20: 12,
    description: "Poco común · tasa 100–149",
  },
  yellow: {
    color: "yellow",
    name: "Amarillo",
    hexColor: "#FFD700",
    targetD20: 15,
    description: "Raro · tasa 60–99 y excepciones",
  },
  red: {
    color: "red",
    name: "Rojo",
    hexColor: "#FF6347",
    targetD20: 17,
    description:
      "Muy raro · tasa menor a 60 y excepciones; excluye legendarios",
  },
  gold: {
    color: "gold",
    name: "Dorado",
    hexColor: "#DAA520",
    targetD20: 19,
    description: "Solo legendarios y singulares",
  },
};
export const CUSTOM_TIER_OVERRIDES: Readonly<Record<string, CatchTierColor>> = {
  beldum: "yellow",
  metang: "red",
  metagross: "red",
  snorlax: "red",
  mantine: "yellow",
  skarmory: "red",
  miltank: "yellow",
  chimecho: "blue",
};
export function tierForSpecies(species: CaptureSpecies): CatchTier {
  if (species.legendary || species.mythical) return CATCH_TIERS.gold;
  const override = CUSTOM_TIER_OVERRIDES[species.name];
  if (override && override !== "gold") return CATCH_TIERS[override];
  const r = species.captureRate;
  return CATCH_TIERS[
    r >= 200
      ? "pink"
      : r >= 150
        ? "green"
        : r >= 100
          ? "blue"
          : r >= 60
            ? "yellow"
            : "red"
  ];
}
export function captureSpecies(id: number) {
  return GEN3_CAPTURE_SPECIES.find((s) => s.id === id);
}
export function encounterPool(
  party: Parameters<typeof encounterSpeciesIds>[0],
  color: CatchTierColor,
) {
  const allowed = new Set(encounterSpeciesIds(party));
  return GEN3_CAPTURE_SPECIES.filter(
    (s) => allowed.has(s.id) && tierForSpecies(s).color === color,
  );
}
export function pickEncounter(
  pool: readonly CaptureSpecies[],
  random: () => number = Math.random,
): CaptureSpecies {
  if (!pool.length)
    throw new Error(
      "No hay especies de este color en las regiones seleccionadas.",
    );
  const roll = random();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1)
    throw new Error("Sorteo inválido.");
  return pool[Math.floor(roll * pool.length)];
}
export const BALL_OPTIONS = [
  { id: "poke", name: "Poké Ball", bonus: 0 },
  { id: "great", name: "Great Ball", bonus: 2 },
  { id: "ultra", name: "Ultra Ball", bonus: 4 },
  { id: "master", name: "Master Ball", bonus: 0 },
] as const;
export function captureRequirements(
  pokemon: Pokemon,
  statuses: readonly PokemonStatus[] = [],
) {
  const species = captureSpecies(pokemon.id),
    max = getMaxHp(pokemon),
    hp = getCurrentHp(pokemon);
  if (!species || !max || !Number.isFinite(hp) || hp <= 0) return null;
  const tier = tierForSpecies(species);
  const health = hp * 5 < max ? "critical" : hp * 2 < max ? "half" : "full";
  const hpBonus = health === "critical" ? 4 : health === "half" ? 2 : 0;
  const major = statuses.some((s) => s === "frozen" || s === "asleep");
  const minor = statuses.some((s) =>
    ["paralyzed", "burned", "poisoned", "badly-poisoned"].includes(s),
  );
  const statusBonus = major ? 4 : minor ? 2 : 0;
  return {
    species,
    tier,
    health,
    hpBonus,
    statusBonus,
    statusLabel: major
      ? "Frozen / Asleep (major)"
      : minor
        ? "Paralyzed / Burned / Poisoned (minor)"
        : "Sin bono por estado",
    balls: BALL_OPTIONS.map((ball) => ({
      ...ball,
      minimum:
        ball.id === "master"
          ? null
          : Math.max(1, tier.targetD20 - hpBonus - statusBonus - ball.bonus),
    })),
  };
}
