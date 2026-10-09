import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

import type { Pokemon } from "@/types/pokemon";

type PokemonResponse = {
  id: number;
  name: string;
  sprites: {
    front_default: string | null;
    other?: {
      "official-artwork"?: {
        front_default: string | null;
      };
    };
  };
  types: {
    slot: number;
    type: {
      name: string;
    };
  }[];
  stats: {
    base_stat: number;
    stat: {
      name: string;
    };
  }[];
};

export const pokeApi = createApi({
  reducerPath: "pokeApi",

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
      }),
    }),
  }),
});

export const { useLazyGetPokemonQuery } = pokeApi;