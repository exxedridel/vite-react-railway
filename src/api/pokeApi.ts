import { isGenerationThreeMove } from "@/lib/gameVersion";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { Pokemon } from "@/types/pokemon";
import type { PokemonMove } from "@/types/moves";
import { MOVE_VERSION_GROUP } from "@/lib/starterPokemon";

type NamedResource = { name: string; url: string };
type PokemonResponse = {
  id: number;
  name: string;
  sprites: {
    front_default: string | null;
    other?: { "official-artwork"?: { front_default: string | null } };
  };
  types: { slot: number; type: NamedResource }[];
  stats: { base_stat: number; stat: NamedResource }[];
  moves: {
    move: NamedResource;
    version_group_details: {
      version_group: NamedResource;
      move_learn_method: NamedResource;
      level_learned_at: number;
    }[];
  }[];
};
export type MoveResponse = {
  generation: NamedResource;
  id: number;
  name: string;
  names: { name: string; language: NamedResource }[];
  type: NamedResource;
  damage_class: { name: PokemonMove["damageClass"] };
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  priority: number;
  effect_chance: number | null;
  effect_entries: { short_effect: string; language: NamedResource }[];
  flavor_text_entries: {
    flavor_text: string;
    language: NamedResource;
    version_group: NamedResource;
  }[];
};

export const pokeApi = createApi({
  reducerPath: "pokeApiEmeraldV1_1",
  baseQuery: fetchBaseQuery({
    baseUrl: "https://pokeapi.co/api/v2/",
    timeout: 15000,
  }),
  keepUnusedDataFor: 3600,
  endpoints: (builder) => ({
    getPokemon: builder.query<Pokemon, string>({
      query: (nameOrId) => `pokemon/${encodeURIComponent(nameOrId)}`,
      transformResponse: (response: PokemonResponse): Pokemon => ({
        id: response.id,
        name: response.name,
        image:
          response.sprites.other?.["official-artwork"]?.front_default ??
          response.sprites.front_default,
        types: [...response.types]
          .sort((a, b) => a.slot - b.slot)
          .map(({ type }) => type.name),
        stats: response.stats.map(({ stat, base_stat }) => ({
          name: stat.name,
          value: base_stat,
        })),
        // La elección gratuita permite cualquier método de aprendizaje compatible
        // en esta versión; no queda limitada al nivel actual. Es una regla del tablero.
        learnset: {
          versionGroup: MOVE_VERSION_GROUP,
          moves: response.moves
            .filter((item) =>
              item.version_group_details.some(
                (detail) => detail.version_group.name === MOVE_VERSION_GROUP,
              ),
            )
            .map(({ move }) => ({
              id: Number(move.url.match(/\/(\d+)\/?$/)?.[1]),
              name: move.name,
            }))
            .filter((move) => isGenerationThreeMove(move.id))
            .sort((a, b) => a.name.localeCompare(b.name)),
        },
      }),
    }),
    getMove: builder.query<PokemonMove, number>({
      query: (id) => `move/${id}`,
      transformResponse: (response: MoveResponse): PokemonMove => {
        if (
          !isGenerationThreeMove(response.id) ||
          !["generation-i", "generation-ii", "generation-iii"].includes(
            response.generation.name,
          )
        ) {
          throw new Error(
            "Movimiento no permitido: el catálogo llega hasta la generación III.",
          );
        }
        const englishText = response.flavor_text_entries.filter(
          (e) => e.language.name === "en",
        );
        const flavor =
          englishText.find((e) => e.version_group.name === MOVE_VERSION_GROUP)
            ?.flavor_text ?? englishText[englishText.length - 1]?.flavor_text;
        const effect = response.effect_entries.find(
          (e) => e.language.name === "en",
        )?.short_effect;
        const description = (flavor ?? effect ?? "Description not available.")
          .replace(/\$effect_chance/g, String(response.effect_chance ?? "?"))
          .replace(/\s+/g, " ");
        return {
          id: response.id,
          name: response.name,
          displayName:
            response.names.find((n) => n.language.name === "en")?.name ??
            response.name.replace(/-/g, " "),
          type: response.type.name,
          damageClass: response.damage_class.name,
          power: response.power,
          accuracy: response.accuracy,
          pp: response.pp,
          priority: response.priority,
          description,
        };
      },
    }),
  }),
});
export const { useLazyGetPokemonQuery, useGetMoveQuery } = pokeApi;
