import data from "./kantoPresets.json";
import { createLeveledPokemon } from "@/lib/pokemonStats";
import type { TrainerTeam } from "./types";

export type NpcStarterType = "grass" | "fire" | "water";
export type NpcTrainerCategory = "gym" | "elite-four" | "rival";
export type NpcTrainerPreset = {
  id: string;
  region: "kanto";
  category: NpcTrainerCategory;
  name: string;
  location: string;
  /** The PLAYER's original starter type, not the rival's starter type. */
  starterType?: NpcStarterType;
  team: TrainerTeam;
};

// Deliberate board presets supplied by the game owner. Do not replace their
// moves with level-up learnsets or normalize them to another game's roster.
export const trainerPresets: readonly NpcTrainerPreset[] =
  data as NpcTrainerPreset[];

/** New, healthy NPC team for each battle; never reuse a damaged runtime team. */
export function buildNpcTrainerTeam(
  presetId: string,
  hpMultiplier = 1.3,
): TrainerTeam {
  const preset = trainerPresets.find((entry) => entry.id === presetId);
  if (!preset) throw new Error("No se encontró ese preset de entrenador.");
  const team = structuredClone(preset.team);
  for (const capture of team.pokemons) {
    capture.pokemon = createLeveledPokemon(
      capture.pokemon,
      capture.pokemon.baseStats,
      capture.pokemon.level,
      hpMultiplier,
    );
    capture.statuses = [];
    capture.statusTurns = {};
  }
  return team;
}
