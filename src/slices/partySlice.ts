import {
  createSlice,
  nanoid,
  type PayloadAction,
} from "@reduxjs/toolkit";

import {
  STATUS_OPTIONS,
  type CapturedPokemon,
  type Pokemon,
  type PokemonStatus,
} from "@/types/pokemon";

type PartyState = {
  pokemons: CapturedPokemon[];
};

type UpdatePokemonStatsPayload = {
  captureId: string;
  values: Record<string, number>;
};

type TogglePokemonStatusPayload = {
  captureId: string;
  status: PokemonStatus;
};

const initialState: PartyState = {
  pokemons: [],
};

const primaryStatuses = new Set<PokemonStatus>(
  STATUS_OPTIONS
    .filter((option) => option.group === "primary")
    .map((option) => option.id)
);

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
            statuses: [],
          } satisfies CapturedPokemon,
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

      const valid = capturedPokemon.pokemon.stats.every(({ name }) => {
        const value = values[name];
        return Number.isSafeInteger(value) && value >= 0;
      });

      if (!valid) return;

      capturedPokemon.pokemon.stats.forEach((stat) => {
        stat.value = values[stat.name];
      });
    },

    togglePokemonStatus(
      state,
      action: PayloadAction<TogglePokemonStatusPayload>
    ) {
      const { captureId, status } = action.payload;

      const capturedPokemon = state.pokemons.find(
        (item) => item.captureId === captureId
      );

      if (!capturedPokemon) return;
      if (!STATUS_OPTIONS.some((option) => option.id === status)) return;

      const currentStatuses = capturedPokemon.statuses ?? [];

      // Pulsar un estado activo lo elimina.
      if (currentStatuses.includes(status)) {
        capturedPokemon.statuses = currentStatuses.filter(
          (current) => current !== status
        );
        return;
      }

      // Un nuevo estado principal sustituye al anterior.
      // Los estados adicionales permanecen.
      const remainingStatuses = primaryStatuses.has(status)
        ? currentStatuses.filter((current) => !primaryStatuses.has(current))
        : currentStatuses;

      capturedPokemon.statuses = [...remainingStatuses, status];
    },

    clearPokemonStatuses(state, action: PayloadAction<string>) {
      const capturedPokemon = state.pokemons.find(
        (item) => item.captureId === action.payload
      );

      if (capturedPokemon) {
        capturedPokemon.statuses = [];
      }
    },
  },
});

export const {
  addPokemon,
  removePokemon,
  updatePokemonStats,
  togglePokemonStatus,
  clearPokemonStatuses,
} = partySlice.actions;

export default partySlice.reducer;