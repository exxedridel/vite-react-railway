import {
  canChooseStarter,
  isStarterSpecies,
  MOVE_VERSION_GROUP,
} from "@/lib/starterPokemon";
import type { PokemonMove } from "@/types/moves";
import type { BattleOpponent } from "@/lib/battleOpponent";
import {
  clampStage,
  isBattleStageName,
  normalizeStages,
} from "@/lib/battleModifiers";
import type { BattleStageName } from "@/types/pokemon";
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
  neutralBattleStages,
} from "@/lib/pokemonStats";

type PartyState = {
  pokemons: CapturedPokemon[];
  starterClaimed?: boolean;
  opponent: BattleOpponent | null;
};
const initialState: PartyState = {
  pokemons: [],
  opponent: null,
  starterClaimed: false,
};
const primaryStatuses = new Set<PokemonStatus>(
  STATUS_OPTIONS.filter((s) => s.group === "primary").map((s) => s.id),
);

const partySlice = createSlice({
  name: "party",
  initialState,
  reducers: {
    setBattleOpponent(state, action: PayloadAction<BattleOpponent | null>) {
      state.opponent = action.payload;
    },
    captureWildOpponent: {
      prepare(encounterId: string) {
        return { payload: { encounterId, captureId: nanoid() } };
      },
      reducer(
        state,
        action: PayloadAction<{ encounterId: string; captureId: string }>,
      ) {
        const opponent = state.opponent;
        if (
          !opponent ||
          opponent.kind !== "wild" ||
          !opponent.encounterId ||
          opponent.encounterId !== action.payload.encounterId
        )
          return;
        if (state.pokemons.length >= 6 || canChooseStarter(state)) return;
        if (!isLeveled(opponent.pokemon)) return;
        const moves = opponent.moves ?? [];
        if (moves.length !== 3 || new Set(moves.map((m) => m.id)).size !== 3)
          return;
        if (
          !moves.every((move) =>
            opponent.pokemon.learnset?.moves.some((m) => m.id === move.id),
          )
        )
          return;
        state.pokemons.push({
          captureId: action.payload.captureId,
          origin: "wild",
          // Conserva nivel y HP. Solo se limpian los modificadores temporales.
          pokemon: { ...opponent.pokemon, battleStages: neutralBattleStages() },
          statuses: [],
          moves: moves.map((move) => ({ ...move, source: "wild" })),
          initialMovesChosen: 0,
        });
        state.starterClaimed = true;
        // Captura y retirada del rival ocurren en la misma acción: evita duplicados.
        state.opponent = null;
      },
    },
    addPokemon: {
      reducer(state, action: PayloadAction<CapturedPokemon>) {
        const { pokemon } = action.payload;
        if (!canChooseStarter(state) || !isStarterSpecies(pokemon.id)) return;
        if (
          pokemon.learnset?.versionGroup !== MOVE_VERSION_GROUP ||
          !pokemon.learnset.moves.length
        )
          return;
        state.pokemons.push(action.payload);
        state.starterClaimed = true;
      },
      prepare(pokemon: Pokemon) {
        return {
          payload: {
            captureId: nanoid(),
            pokemon: createLeveledPokemon(pokemon),
            statuses: [],
            origin: "starter",
            moves: [],
            initialMovesChosen: 0,
          } satisfies CapturedPokemon,
        };
      },
    },
    learnInitialMove(
      state,
      action: PayloadAction<{ captureId: string; move: PokemonMove }>,
    ) {
      const { captureId, move } = action.payload;
      const capture = state.pokemons.find((p) => p.captureId === captureId);
      if (!capture || capture.origin !== "starter") return;
      const moves = capture.moves ?? [];
      const used = Math.max(
        capture.initialMovesChosen ?? 0,
        moves.filter((m) => m.source === "starter").length,
      );
      if (used >= 2 || moves.length >= 4 || moves.some((m) => m.id === move.id))
        return;
      if (
        !capture.pokemon.learnset?.moves.some(
          (m) => m.id === move.id && m.name === move.name,
        )
      )
        return;
      if (!["physical", "special", "status"].includes(move.damageClass)) return;
      capture.moves = [...moves, { ...move, source: "starter" }];
      capture.initialMovesChosen = used + 1;
    },
    resetGame() {
      return { pokemons: [], opponent: null, starterClaimed: false };
    },
    removePokemon(state, action: PayloadAction<string>) {
      const capture = state.pokemons.find(
        (p) => p.captureId === action.payload,
      );
      // El inicial solo se elimina cuando se reinicia toda la partida.
      if (!capture || capture.origin === "starter") return;
      state.starterClaimed = true;
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
    changePokemonBattleStage(
      state,
      action: PayloadAction<{
        captureId: string;
        stat: BattleStageName;
        amount: number;
      }>,
    ) {
      const { captureId, stat, amount } = action.payload;
      const pokemon = state.pokemons.find(
        (p) => p.captureId === captureId,
      )?.pokemon;
      if (
        !pokemon ||
        !isLeveled(pokemon) ||
        !isBattleStageName(stat) ||
        !Number.isSafeInteger(amount)
      )
        return;
      const stages = normalizeStages(pokemon.battleStages);
      stages[stat] = clampStage(stages[stat] + amount);
      pokemon.battleStages = stages;
    },
    resetPokemonBattleStages(state, action: PayloadAction<string>) {
      const pokemon = state.pokemons.find(
        (p) => p.captureId === action.payload,
      )?.pokemon;
      if (pokemon && isLeveled(pokemon))
        pokemon.battleStages = neutralBattleStages();
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
  captureWildOpponent,
  resetGame,
  setBattleOpponent,
  addPokemon,
  learnInitialMove,
  removePokemon,
  migratePokemonSpecies,
  changePokemonHp,
  setPokemonLevel,
  updatePokemonStats,
  togglePokemonStatus,
  clearPokemonStatuses,
  changePokemonBattleStage,
  resetPokemonBattleStages,
} = partySlice.actions;
export default partySlice.reducer;
