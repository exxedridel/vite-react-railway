import { findEvolution } from "@/lib/gen3Evolutions";
import {
  evolutionBattleActive,
  evolutionLevelError,
  replaceEvolvedPokemon,
} from "@/lib/pokemonEvolution";
import {
  assignStatusTurns,
  clearSecondaryStatuses,
  tickStatusTurns,
  withCleanStatusTurns,
  isTimedStatus,
  validTurns,
} from "@/lib/statusTurns";
import {
  emptyBattleField,
  getBattleField,
  switchFieldPokemon,
  clearFieldSource,
  activateMoveField,
  weatherResidual,
  WEATHER_LABELS,
  weatherSummary,
  validWeatherSelection,
  type WeatherKind,
  type BattleField,
} from "@/lib/battleField";
import type { MoveExecutionOptions } from "@/lib/moveCatalogTypes";
import { applyCuratedMoveEffects } from "@/lib/curatedMoveEffects";
import {
  GAME_DATA_VERSION,
  RULESET_ID,
  isGenerationThreeMove,
} from "@/lib/gameVersion";
import {
  pokemonAllowed,
  gameBalance,
  validStartingLevel,
  validHpMultiplier,
  type GameConfiguration,
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
  options?: MoveExecutionOptions;
  actorSide?: "player" | "opponent";
  captureId: string;
  moveId: number;
  commandId: string;
  expectedContext: string;
  conditionsConfirmed: boolean;
};
export type PartyState = {
  battleField?: BattleField;
  lastFieldEvent?: { id: string; title: string; details: string[] };
  dataVersion?: string;
  gameSettings?: GameSettings | null;
  activityHistory?: ActivityEntry[];
  activitySequence?: number;
  lastBattleResult?: BattleResult | null;
  lastMovesByPlayer?: Record<string, BattleResult>;
  lastOpponentMove?: BattleResult | null;
  resolvedBattleIds?: string[];
  pokemons: CapturedPokemon[];
  starterClaimed?: boolean;
  opponent: BattleOpponent | null;
};
const initialState: PartyState = {
  battleField: emptyBattleField(),
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

function advanceBattleTurn(
  state: PartyState,
  captureId: string,
  id: string,
  title?: string,
  initialDetails: string[] = [],
): void {
  const c = state.pokemons.find((p) => p.captureId === captureId),
    o = state.opponent;
  if (!c || !o) return;
  const field = state.battleField ?? (state.battleField = emptyBattleField());
  const details: string[] = [...initialDetails];
  const currentWeather = field.weather;
  if (currentWeather) {
    for (const pokemon of [c.pokemon, o.pokemon]) {
      const amount = weatherResidual(pokemon, currentWeather.kind),
        hp = pokemon.stats.find((s) => s.name === "hp");
      if (amount && hp) {
        const before = hp.value;
        hp.value -= amount;
        details.push(
          `${pokemon.name}: HP ${before} → ${hp.value} (−${amount}, ${WEATHER_LABELS[currentWeather.kind]}).`,
        );
      }
    }
    if (!currentWeather.permanent) currentWeather.turnsLeft -= 1;
    if (!currentWeather.permanent && currentWeather.turnsLeft <= 0) {
      details.push(`${WEATHER_LABELS[currentWeather.kind]} terminó.`);
      field.weather = null;
    } else details.push(`${weatherSummary(currentWeather)}.`);
  }
  c.statuses = (c.statuses ?? []).filter((status) => status !== "flinched");
  o.statuses = (o.statuses ?? []).filter((status) => status !== "flinched");
  details.push(
    ...tickStatusTurns(c, c.pokemon.name),
    ...tickStatusTurns(o, o.pokemon.name),
  );
  if (getCurrentHp(c.pokemon) <= 0)
    clearFieldSource(field, { side: "player", captureId: c.captureId });
  if (getCurrentHp(o.pokemon) <= 0)
    clearFieldSource(field, { side: "opponent" });
  details.push(
    "Flinch retirado. Contadores configurados reducidos en 1; otros daños residuales siguen siendo manuales.",
  );
  state.lastFieldEvent = {
    id,
    title: title ?? `Fin del turno ${field.turn}`,
    details,
  };
  field.turn += 1;
  field.playerSwitchedThisTurn = false;
}
const partySlice = createSlice({
  name: "party",
  initialState,
  reducers: {
    configureGame(
      state,
      action: PayloadAction<GameConfiguration | RegionId[]>,
    ) {
      const config = Array.isArray(action.payload)
        ? { regions: action.payload, ...gameBalance(null) }
        : action.payload;
      if (
        !canChooseStarter(state) ||
        !validRegions(config.regions) ||
        !validStartingLevel(config.startingLevel) ||
        !validHpMultiplier(config.hpMultiplier)
      )
        return;
      state.gameSettings = {
        version: 1,
        regions: REGION_OPTIONS.map((r) => r.id).filter((id) =>
          config.regions.includes(id),
        ),
        ruleset: RULESET_ID,
        startingLevel: config.startingLevel,
        hpMultiplier: config.hpMultiplier,
      };
      state.opponent = null;
      state.lastMovesByPlayer = {};
      state.lastOpponentMove = null;
      state.battleField = emptyBattleField();
    },
    activateBattlePokemon(state, action: PayloadAction<string>) {
      if (!state.pokemons.some((p) => p.captureId === action.payload)) return;
      state.battleField ??= emptyBattleField();
      const active = state.battleField.activeCaptureId;
      if (
        active &&
        active !== action.payload &&
        state.opponent &&
        getCurrentHp(state.opponent.pokemon) > 0 &&
        state.pokemons.some((p) => p.captureId === active)
      )
        return;
      switchFieldPokemon(state.battleField, action.payload);
    },
    confirmBattleSwitch: {
      prepare(input: {
        fromId: string;
        toId: string;
        expectedContext: string;
      }) {
        return { payload: { ...input, id: nanoid() } };
      },
      reducer(
        state,
        action: PayloadAction<{
          fromId: string;
          toId: string;
          expectedContext: string;
          id: string;
        }>,
      ) {
        const { fromId, toId, expectedContext, id } = action.payload;
        const from = state.pokemons.find((p) => p.captureId === fromId),
          to = state.pokemons.find((p) => p.captureId === toId),
          opponent = state.opponent;
        if (
          !from ||
          !to ||
          fromId === toId ||
          !opponent ||
          getCurrentHp(opponent.pokemon) <= 0 ||
          state.battleField?.activeCaptureId !== fromId
        )
          return;
        if (
          JSON.stringify([
            from,
            to,
            opponent,
            getBattleField(state.battleField),
          ]) !== expectedContext
        )
          return;
        clearSecondaryStatuses(from);
        switchFieldPokemon(state.battleField, toId);
        state.battleField.playerSwitchedThisTurn = true;
        state.lastFieldEvent = {
          id,
          title: `Cambio: ${from.pokemon.name} → ${to.pokemon.name}`,
          details: [
            "Estados secundarios del Pokémon que sale eliminados; estados principales conservados.",
            "El cambio consume la acción de tu Pokémon. No puede atacar hasta finalizar este turno manualmente.",
            "El clima y los contadores no se han reducido. Pulsa Finalizar turno cuando corresponda.",
          ],
        };
      },
    },
    setPokemonStatusTurns(
      state,
      action: PayloadAction<{
        captureId: string;
        status: PokemonStatus;
        turns: number;
      }>,
    ) {
      const target = state.pokemons.find(
        (p) => p.captureId === action.payload.captureId,
      );
      if (target)
        assignStatusTurns(target, action.payload.status, action.payload.turns);
    },
    changeOpponentHp(
      state,
      action: PayloadAction<{ amount: number; expectedOpponent: string }>,
    ) {
      const opponent = state.opponent;
      if (
        !opponent ||
        JSON.stringify([
          opponent.encounterId,
          opponent.pokemon.id,
          opponent.kind,
        ]) !== action.payload.expectedOpponent ||
        !Number.isSafeInteger(action.payload.amount)
      )
        return;
      const max = getMaxHp(opponent.pokemon);
      const hp = opponent.pokemon.stats.find((s) => s.name === "hp");
      if (max === undefined || !hp) return;
      hp.value = Math.max(0, Math.min(max, hp.value + action.payload.amount));
      if (hp.value === 0 && state.battleField)
        clearFieldSource(state.battleField, { side: "opponent" });
    },
    setBattleWeather: {
      prepare(input: {
        captureId: string;
        expectedContext: string;
        kind: WeatherKind | null;
        turnsLeft: number;
        permanent: boolean;
      }) {
        return { payload: { ...input, id: nanoid() } };
      },
      reducer(
        state,
        action: PayloadAction<{
          captureId: string;
          expectedContext: string;
          kind: WeatherKind | null;
          turnsLeft: number;
          permanent: boolean;
          id: string;
        }>,
      ) {
        const { captureId, expectedContext, kind, turnsLeft, permanent, id } =
          action.payload;
        const capture = state.pokemons.find((p) => p.captureId === captureId);
        const opponent = state.opponent;
        if (!capture || !opponent || getCurrentHp(opponent.pokemon) <= 0)
          return;
        if (!validWeatherSelection(kind, turnsLeft, permanent)) return;
        if (
          battleContextKey(capture, opponent, state.battleField) !==
          expectedContext
        )
          return;
        const field =
          state.battleField ?? (state.battleField = emptyBattleField());
        if (field.activeCaptureId && field.activeCaptureId !== captureId)
          return;
        const previous = field.weather;
        const next =
          kind === null
            ? null
            : {
                kind,
                turnsLeft: permanent ? 5 : turnsLeft,
                ...(permanent ? { permanent: true } : {}),
              };
        // Una pulsación repetida no reinicia la duración ni duplica el historial.
        if (
          previous?.kind === next?.kind &&
          Boolean(previous?.permanent) === Boolean(next?.permanent) &&
          (next?.permanent || previous?.turnsLeft === next?.turnsLeft)
        )
          return;
        const before = weatherSummary(previous);
        field.weather = next;
        state.lastFieldEvent = {
          id,
          title: next
            ? "Clima actualizado manualmente"
            : "Clima retirado manualmente",
          details: [
            `${before} → ${weatherSummary(next)}.`,
            "Cambio declarado por el jugador. Se aplica a ambos Pokémon y al cálculo de movimientos.",
            "No consume turno ni aplica daño residual al seleccionarlo. La duración y el daño residual se resuelven al finalizar turno.",
          ],
        };
      },
    },
    adjustBattleTurn: {
      prepare(input: {
        captureId: string;
        expectedContext: string;
        amount: number;
      }) {
        return { payload: { ...input, id: nanoid() } };
      },
      reducer(
        state,
        action: PayloadAction<{
          captureId: string;
          expectedContext: string;
          amount: number;
          id: string;
        }>,
      ) {
        const { captureId, expectedContext, amount, id } = action.payload;
        const capture = state.pokemons.find((p) => p.captureId === captureId);
        const opponent = state.opponent;
        if (!capture || !opponent || (amount !== 1 && amount !== -1)) return;
        const field = getBattleField(state.battleField);
        if (field.activeCaptureId && field.activeCaptureId !== captureId)
          return;
        if (battleContextKey(capture, opponent, field) !== expectedContext)
          return;
        const next = field.turn + amount;
        if (!Number.isSafeInteger(next) || next < 1) return;
        state.battleField ??= emptyBattleField();
        const previous = state.battleField.turn;
        state.battleField.turn = next;
        state.lastFieldEvent = {
          id,
          title: "Contador de turno corregido",
          details: [
            `Turno ${previous} → ${next}.`,
            "Corrección manual del número: no aplica ni revierte HP, clima, estados o acciones consumidas.",
          ],
        };
      },
    },
    finishBattleTurn: {
      prepare(input: {
        captureId: string;
        expectedTurn: number;
        expectedContext: string;
      }) {
        return { payload: { ...input, id: nanoid() } };
      },
      reducer(
        state,
        action: PayloadAction<{
          captureId: string;
          expectedTurn: number;
          expectedContext: string;
          id: string;
        }>,
      ) {
        const c = state.pokemons.find(
            (p) => p.captureId === action.payload.captureId,
          ),
          o = state.opponent;
        if (!c || !o || getCurrentHp(o.pokemon) <= 0) return;
        state.battleField ??= emptyBattleField();
        const field = state.battleField;
        if (
          field.turn !== action.payload.expectedTurn ||
          battleContextKey(c, o, field) !== action.payload.expectedContext
        )
          return;
        if (field.activeCaptureId && field.activeCaptureId !== c.captureId)
          return;
        switchFieldPokemon(field, c.captureId);
        advanceBattleTurn(state, c.captureId, action.payload.id);
      },
    },
    executePokemonMove: {
      // Las tiradas pertenecen a la acción, nunca al render ni al reducer.
      prepare(input: ExecuteMoveInput) {
        return {
          payload: {
            ...input,
            rolls: {
              accuracy: Math.random(),
              critical: Math.random(),
              extra: Array.from({ length: 64 }, () => Math.random()),
            },
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
          options = {},
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
        if (
          battleContextKey(capture, opponent, state.battleField) !==
          expectedContext
        )
          return;
        if (
          getCurrentHp(capture.pokemon) <= 0 ||
          (opponent.kind === "wild" && !hasLivingHp(opponent.pokemon))
        )
          return;
        state.battleField ??= emptyBattleField();
        if (
          state.battleField.activeCaptureId &&
          state.battleField.activeCaptureId !== captureId
        )
          return;
        if (actorSide === "player" && state.battleField.playerSwitchedThisTurn)
          return;
        switchFieldPokemon(state.battleField, captureId);
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
          options,
          false,
          state.battleField,
          actorSide === "player"
            ? { side: "player", captureId }
            : { side: "opponent" },
        );
        result.actorSide = actorSide;
        const player = {
          pokemon: capture.pokemon,
          statuses: [...(capture.statuses ?? [])],
          stages: normalizeStages(capture.pokemon.battleStages),
        };
        const rival = {
          pokemon: opponent.pokemon,
          statuses: [...(opponent.statuses ?? [])],
          stages: normalizeStages(opponent.stages),
        };
        applyCuratedMoveEffects(
          result,
          actorSide === "player" ? player : rival,
          actorSide === "player" ? rival : player,
          rolls,
        );
        capture.statuses = player.statuses;
        capture.pokemon.battleStages = player.stages;
        opponent.statuses = rival.statuses;
        opponent.stages = rival.stages;
        if (
          [215, 312].includes(result.resolvedMoveId ?? result.moveId) &&
          result.outcome === "status" &&
          actorSide === "player"
        ) {
          const primary = new Set<PokemonStatus>(
            STATUS_OPTIONS.filter((option) => option.group === "primary").map(
              (option) => option.id,
            ),
          );
          for (const member of state.pokemons)
            member.statuses = (member.statuses ?? []).filter(
              (status) => !primary.has(status),
            );
          result.effectMessages?.push(
            "Estados principales de todo tu equipo curados.",
          );
        }
        if (result.outcome === "status") {
          const fieldMessage = activateMoveField(
            state.battleField,
            result.resolvedMoveId ?? result.moveId,
            actorSide === "player"
              ? { side: "player", captureId }
              : { side: "opponent" },
          );
          if (fieldMessage) result.effectMessages?.push(fieldMessage);
        }
        if (getCurrentHp(capture.pokemon) <= 0)
          clearFieldSource(state.battleField, { side: "player", captureId });
        if (getCurrentHp(opponent.pokemon) <= 0)
          clearFieldSource(state.battleField, { side: "opponent" });
        state.lastBattleResult = result;
        if (result.outcome !== "blocked") {
          if (actorSide === "player") {
            state.lastMovesByPlayer ??= {};
            state.lastMovesByPlayer[captureId] = result;
          } else state.lastOpponentMove = result;
        }
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
      if (!sameEncounter) {
        state.lastMovesByPlayer = {};
        state.lastOpponentMove = null;
        state.battleField = emptyBattleField();
        state.lastFieldEvent = undefined;
      }
      // Retirar al rival termina el combate para todo el equipo.
      // Conserva estados principales (incluido Sleep y su contador).
      if (state.opponent && next === null) {
        for (const member of state.pokemons) clearSecondaryStatuses(member);
      }
      state.opponent = next;
      if (next && getCurrentHp(next.pokemon) <= 0 && state.battleField)
        clearFieldSource(state.battleField, { side: "opponent" });
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
        // Capturarlo también termina el combate: limpia al equipo completo.
        for (const member of state.pokemons) clearSecondaryStatuses(member);
        // Captura y retirada del rival ocurren en la misma acción: evita duplicados.
        state.opponent = null;
        state.lastMovesByPlayer = {};
        state.lastOpponentMove = null;
        state.battleField = emptyBattleField();
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
        const balance = gameBalance(state.gameSettings);
        state.pokemons.push({
          ...action.payload,
          pokemon: createLeveledPokemon(
            pokemon,
            pokemon.baseStats ?? pokemon.stats,
            balance.startingLevel,
            balance.hpMultiplier,
          ),
        });
        state.starterClaimed = true;
      },
      prepare(pokemon: Pokemon) {
        return {
          payload: {
            captureId: nanoid(),
            pokemon,
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
        battleField: emptyBattleField(),
        dataVersion: GAME_DATA_VERSION,
        gameSettings: null,
        pokemons: [],
        opponent: null,
        starterClaimed: false,
        lastBattleResult: null,
        lastMovesByPlayer: {},
        lastOpponentMove: null,
        resolvedBattleIds: [],
      };
    },
    evolvePokemon: {
      prepare(input: {
        captureId: string;
        expectedCapture: string;
        evolution: Pokemon;
        requirementsConfirmed: boolean;
        shedinja?: Pokemon;
      }) {
        return { payload: { ...input, bonusCaptureId: nanoid() } };
      },
      reducer(
        state,
        action: PayloadAction<{
          captureId: string;
          expectedCapture: string;
          evolution: Pokemon;
          requirementsConfirmed: boolean;
          shedinja?: Pokemon;
          bonusCaptureId: string;
        }>,
      ) {
        const {
          captureId,
          expectedCapture,
          evolution,
          requirementsConfirmed,
          shedinja,
          bonusCaptureId,
        } = action.payload;
        const index = state.pokemons.findIndex(
          (p) => p.captureId === captureId,
        );
        const current = state.pokemons[index];
        if (
          !current ||
          !requirementsConfirmed ||
          evolutionBattleActive(state.opponent) ||
          JSON.stringify(current) !== expectedCapture
        )
          return;
        const rule = findEvolution(current.pokemon.id, evolution.id);
        if (
          !rule ||
          evolution.name !== rule.name ||
          evolutionLevelError(current, rule)
        )
          return;
        const bonus =
          rule.method === "level_ninjask" && state.pokemons.length < 6;
        if (
          bonus &&
          (!shedinja || shedinja.id !== 292 || shedinja.name !== "shedinja")
        )
          return;
        try {
          // Preparar ambos resultados antes de modificar el equipo: operación atómica.
          const evolved = replaceEvolvedPokemon(current, evolution);
          const extra =
            bonus && shedinja ? replaceEvolvedPokemon(current, shedinja) : null;
          state.pokemons[index] = evolved;
          if (extra)
            state.pokemons.push({
              ...extra,
              captureId: bonusCaptureId,
              origin: "wild",
              initialMovesChosen: undefined,
            });
          if (state.lastMovesByPlayer)
            delete state.lastMovesByPlayer[captureId];
        } catch {
          // Una respuesta incompleta no debe borrar la captura actual.
        }
      },
    },
    removePokemon(state, action: PayloadAction<string>) {
      const capture = state.pokemons.find(
        (p) => p.captureId === action.payload,
      );
      // Liberar el inicial no habilita una segunda elección gratuita.
      if (!capture || state.pokemons.length <= 1) return;
      if (state.battleField)
        clearFieldSource(state.battleField, {
          side: "player",
          captureId: capture.captureId,
        });
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
        const balance = gameBalance(state.gameSettings);
        const next = createLeveledPokemon(
          old,
          bases,
          old.level ?? balance.startingLevel,
          old.hpMultiplier ?? balance.hpMultiplier,
        );
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
      if (hp?.value === 0 && state.battleField)
        clearFieldSource(state.battleField, { side: "player", captureId });
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
        if (getCurrentHp(capture.pokemon) === 0 && state.battleField)
          clearFieldSource(state.battleField, {
            side: "player",
            captureId: capture.captureId,
          });
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
      if (hp?.value === 0 && state.battleField)
        clearFieldSource(state.battleField, {
          side: "player",
          captureId: action.payload.captureId,
        });
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
      action: PayloadAction<{
        captureId: string;
        status: PokemonStatus;
        turns?: number;
      }>,
    ) {
      const { captureId, status } = action.payload;
      const capture = state.pokemons.find((p) => p.captureId === captureId);
      if (!capture || !STATUS_OPTIONS.some((s) => s.id === status)) return;
      const current = capture.statuses ?? [];
      if (!current.includes(status) && isTimedStatus(status)) {
        if (
          action.payload.turns !== undefined &&
          validTurns(action.payload.turns)
        )
          assignStatusTurns(capture, status, action.payload.turns);
        return;
      }
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
export const evolvePokemon = withActivityMeta(partySlice.actions.evolvePokemon);
export const confirmBattleSwitch = withActivityMeta(
  partySlice.actions.confirmBattleSwitch,
);
export const setPokemonStatusTurns = withActivityMeta(
  partySlice.actions.setPokemonStatusTurns,
);
export const configureGame = partySlice.actions.configureGame;

export const activateBattlePokemon = withActivityMeta(
  partySlice.actions.activateBattlePokemon,
);
export const changeOpponentHp = withActivityMeta(
  partySlice.actions.changeOpponentHp,
);
export const setBattleWeather = withActivityMeta(
  partySlice.actions.setBattleWeather,
);
export const adjustBattleTurn = withActivityMeta(
  partySlice.actions.adjustBattleTurn,
);
export const finishBattleTurn = withActivityMeta(
  partySlice.actions.finishBattleTurn,
);
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
  // Estados curados, expirados o sustituidos no conservan contadores huérfanos.
  next = {
    ...next,
    pokemons: next.pokemons.map((p) => withCleanStatusTurns(p)),
    opponent: next.opponent ? withCleanStatusTurns(next.opponent) : null,
  };
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
