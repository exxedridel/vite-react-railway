import data from "./moveData.json";
import type { PokemonMove } from "@/types/moves";
/** Display data generated from the same Gen III rules as the automatic engine.
 * Trainer battles keep the legacy catalog and manual resolution. */
export function getWildMove(move: PokemonMove, short = false): PokemonMove {
  const wildDescriptions: Record<number, string> = {
    100: "Termina el encuentro salvaje por huida. Falla si el usuario está atrapado, ligado o bajo Ingrain. No captura al rival.",
    18: "Si acierta, termina el encuentro salvaje. Ingrain lo impide; si el usuario tiene menos nivel existe una probabilidad adicional de fallo de Gen III. No captura al rival.",
    46: "Si acierta, termina el encuentro salvaje. Ingrain lo impide; si el usuario tiene menos nivel existe una probabilidad adicional de fallo de Gen III. No captura al rival.",
    237: "En esta adaptación sin IVs: Fighting, potencia 30. El tipo y potencia se calculan con IVs neutrales de 0; no alteran tus stats del tablero.",
    216: "Daño basado en amistad. Esta versión usa amistad 255: potencia 102.",
    218: "Daño basado en poca amistad. Esta versión usa amistad 255: potencia mínima 1.",
  };
  const catalog: Record<
    string,
    {
      name: string;
      description: string;
      shortDescription: string;
      type: string;
      damageClass: string;
      power: number | null;
      accuracy: number | null;
      pp: number;
      priority: number;
    }
  > = data;
  const entry = catalog[move.id];
  return entry
    ? {
        ...move,
        displayName: entry.name,
        type: entry.type,
        damageClass: entry.damageClass as PokemonMove["damageClass"],
        power: entry.power,
        accuracy: entry.accuracy,
        pp: entry.pp,
        priority: entry.priority,
        description:
          wildDescriptions[move.id] ??
          (short ? entry.shortDescription : entry.description),
      }
    : move;
}
