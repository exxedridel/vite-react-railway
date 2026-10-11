import { createSlice, nanoid, type PayloadAction } from "@reduxjs/toolkit";
import {
  STATUS_OPTIONS,
  type CapturedPokemon,
  type Pokemon,
  type PokemonStatus,
} from "@/types/pokemon";
import {
  changeLevel,
  createLeveledPokemon,
  getCurrentHp,
  getMaxHp,
  isLeveled,
  preserveHpRatio,
  validBaseStats,
} from "@/lib/pokemonStats";

type PartyState = { pokemons: CapturedPokemon[] };
const initialState: PartyState = { pokemons: [] };
const primaryStatuses = new Set<PokemonStatus>(
  STATUS_OPTIONS.filter((s) => s.group === "primary").map((s) => s.id),
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
            pokemon: createLeveledPokemon(pokemon),
            statuses: [],
          } satisfies CapturedPokemon,
        };
      },
    },
    removePokemon(state, action: PayloadAction<string>) {
      state.pokemons = state.pokemons.filter(
        (p) => p.captureId !== action.payload,
      );
    },
    // Solo migra capturas antiguas. La consulta obtiene las bases auténticas de PokéAPI.
    migratePokemonSpecies(state, action: PayloadAction<Pokemon>) {
      const source = action.payload;
      const bases = source.baseStats ?? source.stats;
      if (!validBaseStats(bases)) return;
      const oldMax = bases.find((s) => s.name === "hp")!.value;
      for (const capture of state.pokemons) {
        if (capture.pokemon.id !== source.id || isLeveled(capture.pokemon))
          continue;
        const old = capture.pokemon;
        const next = createLeveledPokemon(old, bases);
        const hp = next.stats.find((s) => s.name === "hp")!;
        hp.value = preserveHpRatio(getCurrentHp(old), oldMax, hp.value);
        capture.legacyStats = old.stats.map((s) => ({ ...s }));
        capture.pokemon = next;
      }
    },
    changePokemonHp(
      state,
      action: PayloadAction<{ captureId: string; amount: number }>,
    ) {
      const { captureId, amount } = action.payload;
      const pokemon = state.pokemons.find(
        (p) => p.captureId === captureId,
      )?.pokemon;
      if (!pokemon || !isLeveled(pokemon) || !Number.isSafeInteger(amount))
        return;
      const hp = pokemon.stats.find((s) => s.name === "hp");
      if (hp)
        hp.value = Math.max(0, Math.min(getMaxHp(pokemon)!, hp.value + amount));
    },
    setPokemonLevel(
      state,
      action: PayloadAction<{ captureId: string; level: number }>,
    ) {
      const capture = state.pokemons.find(
        (p) => p.captureId === action.payload.captureId,
      );
      if (!capture || !isLeveled(capture.pokemon)) return;
      if (
        !Number.isSafeInteger(action.payload.level) ||
        action.payload.level < 1
      )
        return;
      try {
        capture.pokemon = changeLevel(capture.pokemon, action.payload.level);
      } catch {
        /* Un nivel fuera del rango numérico no modifica la captura. */
      }
    },
    // Compatibilidad con llamadas anteriores: ya no permite sobrescribir los otros stats.
    updatePokemonStats(
      state,
      action: PayloadAction<{
        captureId: string;
        values: Record<string, number>;
      }>,
    ) {
      const pokemon = state.pokemons.find(
        (p) => p.captureId === action.payload.captureId,
      )?.pokemon;
      if (!pokemon || !isLeveled(pokemon)) return;
      const values = action.payload.values;
      if (
        !pokemon.stats.every(
          (s) =>
            Number.isSafeInteger(values[s.name]) &&
            values[s.name] >= 0 &&
            (s.name === "hp" || values[s.name] === s.value),
        )
      )
        return;
      const hp = pokemon.stats.find((s) => s.name === "hp");
      if (hp) hp.value = Math.min(getMaxHp(pokemon)!, values.hp);
    },
    togglePokemonStatus(
      state,
      action: PayloadAction<{ captureId: string; status: PokemonStatus }>,
    ) {
      const { captureId, status } = action.payload;
      const capture = state.pokemons.find((p) => p.captureId === captureId);
      if (!capture || !STATUS_OPTIONS.some((s) => s.id === status)) return;
      const current = capture.statuses ?? [];
      if (current.includes(status)) {
        capture.statuses = current.filter((s) => s !== status);
        return;
      }
      capture.statuses = [
        ...(primaryStatuses.has(status)
          ? current.filter((s) => !primaryStatuses.has(s))
          : current),
        status,
      ];
    },
    clearPokemonStatuses(state, action: PayloadAction<string>) {
      const capture = state.pokemons.find(
        (p) => p.captureId === action.payload,
      );
      if (capture) capture.statuses = [];
    },
  },
});
export const {
  addPokemon,
  removePokemon,
  migratePokemonSpecies,
  changePokemonHp,
  setPokemonLevel,
  updatePokemonStats,
  togglePokemonStatus,
  clearPokemonStatuses,
} = partySlice.actions;
export default partySlice.reducer;
