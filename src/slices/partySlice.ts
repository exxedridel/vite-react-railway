import {
  createSlice,
  nanoid,
  type PayloadAction,
} from "@reduxjs/toolkit";

import type { CapturedPokemon, Pokemon } from "@/types/pokemon";

type PartyState = {
  pokemons: CapturedPokemon[];
};

type UpdatePokemonStatsPayload = {
  captureId: string;
  values: Record<string, number>;
};

const initialState: PartyState = {
  pokemons: [],
};

const partySlice = createSlice({
  name: "party",
  initialState,
  reducers: {
    addPokemon: {
      reducer(state, action: PayloadAction<CapturedPokemon>) {
        state.pokemons.push(action.payload);
      },
      prepare(pokemon: Pokemon) {
        return {
          payload: {
            captureId: nanoid(),
            pokemon,
          },
        };
      },
    },

    removePokemon(state, action: PayloadAction<string>) {
      state.pokemons = state.pokemons.filter(
        (item) => item.captureId !== action.payload
      );
    },

    updatePokemonStats(
      state,
      action: PayloadAction<UpdatePokemonStatsPayload>
    ) {
      const { captureId, values } = action.payload;

      const capturedPokemon = state.pokemons.find(
        (item) => item.captureId === captureId
      );

      if (!capturedPokemon) return;

      // Validamos todos los valores antes de modificar el equipo.
      const valid = capturedPokemon.pokemon.stats.every(({ name }) => {
        const value = values[name];
        return Number.isSafeInteger(value) && value >= 0;
      });

      if (!valid) return;

      capturedPokemon.pokemon.stats.forEach((stat) => {
        stat.value = values[stat.name];
      });
    },
  },
});

export const {
  addPokemon,
  removePokemon,
  updatePokemonStats,
} = partySlice.actions;

export default partySlice.reducer;