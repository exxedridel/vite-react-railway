import { CURATED_MOVE_CATALOG } from "@/lib/curatedMoveCatalog";
import { applyCuratedMoveEffects } from "@/lib/curatedMoveEffects";
import {
  GAME_DATA_VERSION,
  RULESET_ID,
  isGenerationThreeMove,
} from "@/lib/gameVersion";
import {
  pokemonAllowed,
  validRegions,
  REGION_OPTIONS,
  type GameSettings,
  type RegionId,
} from "@/lib/gameSettings";
import { hasLivingHp } from "@/lib/pokemonCondition";
import { describePartyActivity } from "@/lib/partyActivity";
import type { ActivityEntry, ActivityMeta } from "@/types/activity";
import {
  battleContextKey,
  resolveBattleMove,
  battleParticipants,
} from "@/lib/battleEngine";
import type { BattleResult, BattleRolls } from "@/types/battle";
import {
  canChooseStarter,
  isStarterSpecies,
  MOVE_VERSION_GROUP,
} from "@/lib/starterPokemon";
import type { PokemonMove, PokemonLearnset } from "@/types/moves";
import type { BattleOpponent } from "@/lib/battleOpponent";
import {
  clampStage,
  isBattleStageName,
  normalizeStages,
} from "@/lib/battleModifiers";
import type { BattleStageName } from "@/types/pokemon";
import {
  createSlice,
  nanoid,
  type PayloadAction,
  type UnknownAction,
} from "@reduxjs/toolkit";
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
type ExecuteMoveInput = {
  actorSide?: "player" | "opponent";
  captureId: string;
  moveId: number;
  commandId: string;
  expectedContext: string;
  conditionsConfirmed: boolean;
};
export type PartyState = {
  dataVersion?: string;
  gameSettings?: GameSettings | null;
  activityHistory?: ActivityEntry[];
  activitySequence?: number;
  lastBattleResult?: BattleResult | null;
  resolvedBattleIds?: string[];
  pokemons: CapturedPokemon[];
  starterClaimed?: boolean;
  opponent: BattleOpponent | null;
};
const initialState: PartyState = {
  dataVersion: GAME_DATA_VERSION,
  gameSettings: null,
  activityHistory: [],
  activitySequence: 0,
  pokemons: [],
  opponent: null,
  starterClaimed: false,
  lastBattleResult: null,
  resolvedBattleIds: [],
};
const primaryStatuses = new Set<PokemonStatus>(
  STATUS_OPTIONS.filter((s) => s.group === "primary").map((s) => s.id),
);
const partySlice = createSlice({
  name: "party",
  initialState,
  reducers: {
    configureGame(state, action: PayloadAction<RegionId[]>) {
      if (!canChooseStarter(state) || !validRegions(action.payload)) return;
      state.gameSettings = {
        version: 1,
        regions: REGION_OPTIONS.map((r) => r.id).filter((id) =>
          action.payload.includes(id),
        ),
        ruleset: RULESET_ID,
      };
      state.opponent = null;
    },
    executePokemonMove: {
      // Las tiradas pertenecen a la acción, nunca al render ni al reducer.
      prepare(input: ExecuteMoveInput) {
        return {
          payload: {
            ...input,
            rolls: { accuracy: Math.random(), critical: Math.random() },
          },
        };
      },
      reducer(
        state,
        action: PayloadAction<ExecuteMoveInput & { rolls: BattleRolls }>,
      ) {
        const {
          captureId,
          moveId,
          commandId,
          expectedContext,
          conditionsConfirmed,
          actorSide = "player",
          rolls,
        } = action.payload;
        if (!commandId || state.resolvedBattleIds?.includes(commandId)) return;
        const capture = state.pokemons.find((p) => p.captureId === captureId);
        const opponent = state.opponent;
        if (actorSide !== "player" && actorSide !== "opponent") return;
        if (actorSide === "opponent" && opponent?.kind !== "wild") return;
        const move = (
          actorSide === "opponent" ? opponent?.moves : capture?.moves
        )?.find((m) => m.id === moveId);
        if (!capture || !opponent || !move || !isGenerationThreeMove(move.id))
          return;
        if (battleContextKey(capture, opponent) !== expectedContext) return;
        if (
          getCurrentHp(capture.pokemon) <= 0 ||
          (opponent.kind === "wild" && !hasLivingHp(opponent.pokemon))
        )
          return;
        const { attacker, defender } = battleParticipants(
          capture,
          opponent,
          actorSide,
        );
        const result = resolveBattleMove(
          attacker,
          defender,
          move,
          rolls,
          commandId,
          conditionsConfirmed,
        );
        result.actorSide = actorSide;
        if (result.outcome === "hit" && CURATED_MOVE_CATALOG[move.id]) {
          applyCuratedMoveEffects(
            result,
            actorSide === "player" ? capture.pokemon : opponent.pokemon,
            actorSide === "player" ? opponent.pokemon : capture.pokemon,
          );
        } else {
          if (
            actorSide === "player" &&
            result.outcome === "hit" &&
            opponent.kind === "wild"
          ) {
            const hp = opponent.pokemon.stats.find((s) => s.name === "hp");
            if (hp) {
              result.wildHpBefore = hp.value;
              result.appliedDamage = Math.min(hp.value, result.damage);
              hp.value = Math.max(0, hp.value - result.damage);
              result.wildHpAfter = hp.value;
            }
          }
          if (actorSide === "opponent" && result.outcome === "hit") {
            const hp = capture.pokemon.stats.find((stat) => stat.name === "hp");
            if (hp) {
              result.targetHpBefore = hp.value;
              result.appliedDamage = Math.min(hp.value, result.damage);
              hp.value = Math.max(0, hp.value - result.damage);
              result.targetHpAfter = hp.value;
            }
          }
        }
        state.lastBattleResult = result;
        state.resolvedBattleIds = [
          ...(state.resolvedBattleIds ?? []),
          commandId,
        ];
      },
    },
    setBattleOpponent(state, action: PayloadAction<BattleOpponent | null>) {
      const next = action.payload;
      const sameEncounter =
        next &&
        state.opponent &&
        next.pokemon.id === state.opponent.pokemon.id &&
        next.encounterId === state.opponent.encounterId &&
        next.kind === state.opponent.kind;
      if (
        next?.kind === "wild" &&
        !sameEncounter &&
        !pokemonAllowed(state, next.pokemon.id)
      )
        return;
      state.opponent = next;
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
        if (!isLeveled(opponent.pokemon) || !hasLivingHp(opponent.pokemon))
          return;
        if (!pokemonAllowed(state, opponent.pokemon.id)) return;
        if (opponent.pokemon.learnset?.versionGroup !== MOVE_VERSION_GROUP)
          return;
        const moves = opponent.moves ?? [];
        if (!moves.every((move) => isGenerationThreeMove(move.id))) return;
        if (
          moves.length < 1 ||
          moves.length > 3 ||
          new Set(moves.map((m) => m.id)).size !== moves.length
        )
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
        if (
          !canChooseStarter(state) ||
          !isStarterSpecies(pokemon.id) ||
          !state.gameSettings ||
          !pokemonAllowed(state, pokemon.id)
        )
          return;
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
    setPokemonLearnset(
      state,
      action: PayloadAction<{
        captureId: string;
        pokemonId: number;
        learnset: PokemonLearnset;
      }>,
    ) {
      const capture = state.pokemons.find(
        (p) => p.captureId === action.payload.captureId,
      );
      if (!capture || capture.pokemon.id !== action.payload.pokemonId) return;
      if (
        action.payload.learnset.versionGroup !== MOVE_VERSION_GROUP ||
        !action.payload.learnset.moves.every((move) =>
          isGenerationThreeMove(move.id),
        )
      )
        return;
      // Solo actualiza el catálogo de compatibilidad, nunca nivel, HP ni movimientos.
      capture.pokemon.learnset = action.payload.learnset;
    },
    learnPokemonMoveWithTm(
      state,
      action: PayloadAction<{
        captureId: string;
        move: PokemonMove;
        replaceMoveId?: number;
      }>,
    ) {
      const { captureId, move, replaceMoveId } = action.payload;
      if (!isGenerationThreeMove(move.id)) return;
      const capture = state.pokemons.find((p) => p.captureId === captureId);
      if (
        !capture ||
        capture.pokemon.learnset?.versionGroup !== MOVE_VERSION_GROUP
      )
        return;
      const moves = capture.moves ?? [];
      if (moves.some((m) => m.id === move.id)) return;
      if (
        !capture.pokemon.learnset?.moves.some(
          (m) => m.id === move.id && m.name === move.name,
        )
      )
        return;
      if (!["physical", "special", "status"].includes(move.damageClass)) return;
      const replacementIndex =
        replaceMoveId === undefined
          ? -1
          : moves.findIndex((m) => m.id === replaceMoveId);
      if (replaceMoveId === undefined && moves.length >= 4) return;
      if (replaceMoveId !== undefined && replacementIndex < 0) return;
      // Mantiene las elecciones gratuitas ya utilizadas, incluso al sustituirlas.
      if (capture.origin === "starter") {
        capture.initialMovesChosen = Math.max(
          capture.initialMovesChosen ?? 0,
          moves.filter((m) => m.source === "starter").length,
        );
      }
      const learned = { ...move, source: "tm" as const };
      if (replaceMoveId === undefined) {
        capture.moves = [...moves, learned];
      } else {
        capture.moves = moves.map((m, index) =>
          index === replacementIndex ? learned : m,
        );
      }
    },
    learnInitialMove(
      state,
      action: PayloadAction<{ captureId: string; move: PokemonMove }>,
    ) {
      const { captureId, move } = action.payload;
      if (!isGenerationThreeMove(move.id)) return;
      const capture = state.pokemons.find((p) => p.captureId === captureId);
      if (
        !capture ||
        capture.origin !== "starter" ||
        capture.pokemon.learnset?.versionGroup !== MOVE_VERSION_GROUP
      )
        return;
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
      return {
        dataVersion: GAME_DATA_VERSION,
        gameSettings: null,
        pokemons: [],
        opponent: null,
        starterClaimed: false,
        lastBattleResult: null,
        resolvedBattleIds: [],
      };
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
// El reloj se consulta al crear la acción. El reducer permanece determinista.
// Mantiene los nombres, argumentos, .type y .match que ya utilizan los componentes.
function withActivityMeta<T extends (...args: never[]) => { type: string }>(
  creator: T,
): T {
  const wrapped = (...args: Parameters<T>) => {
    const action = creator(...args);
    return {
      ...action,
      meta: {
        activity: {
          id: nanoid(),
          occurredAt: new Date().toISOString(),
        } satisfies ActivityMeta,
      },
    };
  };
  return Object.assign(wrapped, creator) as T;
}
export const configureGame = partySlice.actions.configureGame;

export const executePokemonMove = withActivityMeta(
  partySlice.actions.executePokemonMove,
);
export const learnPokemonMoveWithTm = withActivityMeta(
  partySlice.actions.learnPokemonMoveWithTm,
);
export const setPokemonLearnset = withActivityMeta(
  partySlice.actions.setPokemonLearnset,
);
export const captureWildOpponent = withActivityMeta(
  partySlice.actions.captureWildOpponent,
);
export const resetGame = withActivityMeta(partySlice.actions.resetGame);
export const setBattleOpponent = withActivityMeta(
  partySlice.actions.setBattleOpponent,
);
export const addPokemon = withActivityMeta(partySlice.actions.addPokemon);
export const learnInitialMove = withActivityMeta(
  partySlice.actions.learnInitialMove,
);
export const removePokemon = withActivityMeta(partySlice.actions.removePokemon);
export const migratePokemonSpecies = withActivityMeta(
  partySlice.actions.migratePokemonSpecies,
);
export const changePokemonHp = withActivityMeta(
  partySlice.actions.changePokemonHp,
);
export const setPokemonLevel = withActivityMeta(
  partySlice.actions.setPokemonLevel,
);
export const updatePokemonStats = withActivityMeta(
  partySlice.actions.updatePokemonStats,
);
export const togglePokemonStatus = withActivityMeta(
  partySlice.actions.togglePokemonStatus,
);
export const clearPokemonStatuses = withActivityMeta(
  partySlice.actions.clearPokemonStatuses,
);
export const changePokemonBattleStage = withActivityMeta(
  partySlice.actions.changePokemonBattleStage,
);
export const resetPokemonBattleStages = withActivityMeta(
  partySlice.actions.resetPokemonBattleStages,
);
function activityMeta(action: UnknownAction): ActivityMeta | null {
  if (
    !action.meta ||
    typeof action.meta !== "object" ||
    !("activity" in action.meta)
  )
    return null;
  const value = action.meta.activity;
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    !("occurredAt" in value)
  )
    return null;
  if (
    typeof value.id !== "string" ||
    typeof value.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(value.occurredAt))
  )
    return null;
  return { id: value.id, occurredAt: value.occurredAt };
}
export default function partyReducer(
  state: PartyState | undefined,
  action: UnknownAction,
): PartyState {
  // redux-persist autoMergeLevel1 conserva un slice si cambió durante REHYDRATE.
  // Reiniciamos solo party: no tokens, nickname, colores ni datos de otras apps.
  if (action.type === "persist/REHYDRATE" && action.key === "root") {
    const payload = action.payload;
    if (payload && typeof payload === "object" && "party" in payload) {
      const saved = payload.party;
      if (
        !saved ||
        typeof saved !== "object" ||
        !("dataVersion" in saved) ||
        saved.dataVersion !== GAME_DATA_VERSION
      ) {
        return {
          ...initialState,
          pokemons: [],
          opponent: null,
          activityHistory: [],
          resolvedBattleIds: [],
        };
      }
    }
  }
  const before = state ?? initialState;
  let next = partySlice.reducer(state, action);
  // Reiniciar la partida conserva las últimas acciones, incluso si se usa una acción sin meta.
  if (action.type === partySlice.actions.resetGame.type) {
    next = {
      ...next,
      activityHistory: before.activityHistory ?? [],
      activitySequence: before.activitySequence ?? 0,
    };
  }
  if (next === before) return next;
  const meta = activityMeta(action);
  if (!meta) return next;
  const draft = describePartyActivity(action.type, before, next);
  if (!draft) return next;
  const sequence = (before.activitySequence ?? 0) + 1;
  const entry: ActivityEntry = {
    ...draft,
    id: `${meta.id}:${sequence}`,
    sequence,
    occurredAt: meta.occurredAt,
  };
  return {
    ...next,
    activitySequence: sequence,
    activityHistory: [entry, ...(before.activityHistory ?? [])].slice(0, 10),
  };
}
