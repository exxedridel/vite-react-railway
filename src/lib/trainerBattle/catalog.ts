import { Dex } from "@pkmn/sim";
import type { LearnedMove } from "@/types/moves";
import type { PokemonStat } from "@/types/pokemon";
import { STAT_NAMES } from "@/lib/pokemonStats";

const dex = Dex.forGen(3);
export const trainerSpecies: {
  id: number;
  name: string;
  types: string[];
  baseStats: PokemonStat[];
  gender: "M" | "F" | "N" | null;
}[] = dex.species
  .all()
  .filter((species) => species.num >= 1 && species.num <= 386 && !species.forme)
  .map((species) => ({
    id: species.num,
    name: species.name,
    gender:
      species.gender === "M" || species.gender === "F" || species.gender === "N"
        ? species.gender
        : null,
    types: species.types.map((type) => type.toLowerCase()),
    baseStats: Object.values(species.baseStats).map((value, index) => ({
      name: STAT_NAMES[index],
      value,
    })),
  }))
  .sort((a, b) => a.id - b.id);

export const trainerMoves: LearnedMove[] = dex.moves
  .all()
  .filter((move) => move.num >= 1 && move.num <= 354 && !move.realMove)
  .map((move) => ({
    id: move.num,
    name: move.id,
    displayName: move.name,
    type: move.type.toLowerCase(),
    damageClass: move.category.toLowerCase() as LearnedMove["damageClass"],
    power: move.basePower || null,
    accuracy: typeof move.accuracy === "number" ? move.accuracy : null,
    pp: move.pp,
    priority: move.priority,
    description: move.desc,
    source: "tm" as const,
  }))
  .sort((a, b) => a.id - b.id);
