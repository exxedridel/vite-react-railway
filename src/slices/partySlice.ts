import {
  createSlice,
  nanoid,
  type PayloadAction,
} from "@reduxjs/toolkit";

import type { CapturedPokemon, Pokemon } from "@/types/pokemon";

type PartyState = {
  pokemons: CapturedPokemon[];
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
  },
});

export const { addPokemon, removePokemon } = partySlice.actions;

export default partySlice.reducer;