// src/api/creditsApi.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const baseUrl = import.meta.env.VITE_BASE_SERVICES;
const path = "/api/v2/";

export const creditsApi = createApi({
  reducerPath: 'creditsApi',
  baseQuery: fetchBaseQuery({
  baseUrl: baseUrl + path, 
  prepareHeaders: (headers) => {
    return headers;
  },
}),
  endpoints: (builder) => ({

     getPokemons: builder.query<any, void>({
      query: () => `pokemon`,
    }),
   
  }),
})

export const {
  useGetPokemonsQuery,
} = creditsApi
