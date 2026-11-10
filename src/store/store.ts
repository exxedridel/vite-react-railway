import {
  configureStore,
  combineReducers,
  type UnknownAction,
} from "@reduxjs/toolkit";
import { persistStore, persistReducer } from "redux-persist";
import { GAME_DATA_VERSION } from "@/lib/gameVersion";
import {
  accountStorage,
  accountStorageKey,
  accountNicknameKey,
  getActiveAccountId,
  selectAccountStorage,
  readAccountParty,
  writeAccountParty,
  decodeAccountParty,
  readLocalValue,
  writeLocalValue,
  legacyAvailableTo,
  withLegacyImportLock,
  notifyNicknameChanged,
  LEGACY_PARTY_KEY,
  LEGACY_PARTY_BACKUP_KEY,
  LEGACY_PARTY_OWNER_KEY,
  LEGACY_PARTY_RESERVATION_KEY,
  LEGACY_NICKNAME_KEY,
} from "./accountStorage";

import partyReducer from "@/slices/partySlice";

import { elegirClienteApi } from "@/api/elegirClienteApi";

import { elegirClienteApiNoToken } from "@/api/elegirClienteApiNoToken";
import { creditsApi } from "@/api/creditsApi";
import { pokeApi } from "@/api/pokeApi";

const rootReducer = combineReducers({
  party: partyReducer,

  [elegirClienteApi.reducerPath]: elegirClienteApi.reducer,

  [elegirClienteApiNoToken.reducerPath]: elegirClienteApiNoToken.reducer,
  [creditsApi.reducerPath]: creditsApi.reducer,
  [pokeApi.reducerPath]: pokeApi.reducer,
});

type AppState = ReturnType<typeof rootReducer>;
const RESET_ACCOUNT = "accounts/reset";
const resettableReducer = (
  state: AppState | undefined,
  action: UnknownAction,
): AppState =>
  rootReducer(action.type === RESET_ACCOUNT ? undefined : state, action);

const persistConfig = {
  key: "root",
  storage: accountStorage,
  whitelist: ["party"],
};

const persistedReducer = persistReducer(persistConfig, resettableReducer);

export const store = configureStore({
  reducer: persistedReducer,

  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [
          "persist/PERSIST",
          "persist/REHYDRATE",
          "persist/PAUSE",
          "persist/FLUSH",
          "persist/PURGE",
          "persist/REGISTER",
        ],
      },
    }).concat(
      elegirClienteApi.middleware,

      elegirClienteApiNoToken.middleware,
      creditsApi.middleware,
      pokeApi.middleware,
    ),
});

export const persistor = persistStore(store);

let accountQueue: Promise<void> = Promise.resolve();
function serializeAccountChange<T>(operation: () => Promise<T>): Promise<T> {
  const next = accountQueue.then(operation);
  accountQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function waitForBootstrap(): Promise<void> {
  if (persistor.getState().bootstrapped) return;
  await new Promise<void>((resolve) => {
    const unsubscribe = persistor.subscribe(() => {
      if (!persistor.getState().bootstrapped) return;
      unsubscribe();
      resolve();
    });
  });
}

async function flushCurrentAccount(): Promise<void> {
  await persistor.flush();
  const owner = getActiveAccountId();
  // redux-persist catches storage failures internally; this checked write makes
  // account transitions fail explicitly instead of pretending they were saved.
  if (owner !== null) writeAccountParty(owner, store.getState().party);
}

function resetAccountUi(): void {
  [
    store.dispatch(elegirClienteApi.util.getRunningQueriesThunk()),
    store.dispatch(elegirClienteApiNoToken.util.getRunningQueriesThunk()),
    store.dispatch(creditsApi.util.getRunningQueriesThunk()),
    store.dispatch(pokeApi.util.getRunningQueriesThunk()),
    store.dispatch(elegirClienteApi.util.getRunningMutationsThunk()),
    store.dispatch(elegirClienteApiNoToken.util.getRunningMutationsThunk()),
    store.dispatch(creditsApi.util.getRunningMutationsThunk()),
    store.dispatch(pokeApi.util.getRunningMutationsThunk()),
  ].forEach((requests) => requests.forEach((request) => request.abort()));
  [
    elegirClienteApi.util.resetApiState(),
    elegirClienteApiNoToken.util.resetApiState(),
    creditsApi.util.resetApiState(),
    pokeApi.util.resetApiState(),
  ].forEach((action) => store.dispatch(action));
  store.dispatch({ type: RESET_ACCOUNT });
}

function resumeWithParty(payload?: { party: AppState["party"] }): void {
  // PERSIST only resumes an already bootstrapped reducer. Rehydrate immediately
  // afterwards so its persistoid stages the new owner's state before flushing.
  persistor.persist();
  store.dispatch({ type: "persist/REHYDRATE", key: "root", payload });
}

/** Call only after the API has confirmed the signed-in user's identity. */
export function activateAccountStore(userId: number): Promise<void> {
  accountStorageKey(userId);
  return serializeAccountChange(async () => {
    await waitForBootstrap();
    if (getActiveAccountId() === userId) return;
    persistor.pause();
    try {
      await flushCurrentAccount();
      // Read/validate before selecting the owner; a corrupt save is never replaced.
      const incoming = readAccountParty(userId);
      selectAccountStorage(userId);
      resetAccountUi();
      resumeWithParty(incoming);
      await flushCurrentAccount();
    } catch (error) {
      persistor.pause();
      selectAccountStorage(null);
      resetAccountUi();
      resumeWithParty();
      await persistor.flush();
      throw error;
    }
  });
}

/** Logout clears memory and caches, while every account's saved party remains. */
export function clearAccountStore(): Promise<void> {
  return serializeAccountChange(async () => {
    await waitForBootstrap();
    persistor.pause();
    let saveError: unknown;
    try {
      await flushCurrentAccount();
    } catch (error) {
      saveError = error;
    }
    selectAccountStorage(null);
    resetAccountUi();
    resumeWithParty();
    await persistor.flush();
    if (saveError) throw saveError;
  });
}

function legacyParty() {
  const raw = readLocalValue(LEGACY_PARTY_KEY);
  const decoded = decodeAccountParty(raw);
  if (!raw || !decoded || !decoded.party.pokemons.length) return null;
  if (decoded.party.dataVersion !== GAME_DATA_VERSION)
    throw new Error(
      "La partida anterior usa una versión incompatible. Se conserva intacta para recuperarla antes de importar.",
    );
  return { raw, party: decoded.party };
}

export function hasLegacyPartyForImport(userId: number): Promise<boolean> {
  accountStorageKey(userId);
  return serializeAccountChange(async () => {
    if (getActiveAccountId() !== userId || !legacyAvailableTo(userId))
      return false;
    const legacy = legacyParty();
    if (!legacy) return false;
    const current = store.getState().party;
    if (current.pokemons.length === 0) return true;
    return (
      readLocalValue(LEGACY_PARTY_RESERVATION_KEY) === String(userId) &&
      legacy.party.pokemons.every((capture) =>
        current.pokemons.some((own) => own.captureId === capture.captureId),
      )
    );
  });
}

export function importLegacyParty(userId: number): Promise<void> {
  accountStorageKey(userId);
  return serializeAccountChange(() =>
    withLegacyImportLock(async () => {
      if (getActiveAccountId() !== userId)
        throw new Error(
          "La cuenta cambió. Vuelve a abrir la importación desde tu cuenta.",
        );
      if (!legacyAvailableTo(userId))
        throw new Error(
          "La partida anterior ya está vinculada a otra cuenta o fue importada.",
        );
      const legacy = legacyParty();
      if (!legacy)
        throw new Error(
          "No hay una partida anterior disponible para importar.",
        );
      const current = store.getState().party;
      const reserved =
        readLocalValue(LEGACY_PARTY_RESERVATION_KEY) === String(userId);
      // A previous attempt may have saved the party but failed its final marker.
      const finishingPreviousImport =
        reserved &&
        current.pokemons.length > 0 &&
        legacy.party.pokemons.every((capture) =>
          current.pokemons.some((own) => own.captureId === capture.captureId),
        );
      if (current.pokemons.length && !finishingPreviousImport)
        throw new Error(
          "Esta cuenta ya tiene un equipo. La importación no reemplaza partidas existentes.",
        );
      if (readLocalValue(LEGACY_PARTY_BACKUP_KEY) === null)
        writeLocalValue(LEGACY_PARTY_BACKUP_KEY, legacy.raw);
      // The exclusive lock serializes tabs; a reservation binds a failed/crashed
      // opt-in attempt to this account without marking an unsaved import complete.
      writeLocalValue(LEGACY_PARTY_RESERVATION_KEY, String(userId));
      persistor.pause();
      try {
        await flushCurrentAccount();
        if (!finishingPreviousImport) resumeWithParty({ party: legacy.party });
        else resumeWithParty({ party: current });
        await flushCurrentAccount();
        const nickname = readLocalValue(LEGACY_NICKNAME_KEY)?.trim();
        if (
          nickname &&
          nickname.length <= 30 &&
          readLocalValue(accountNicknameKey(userId)) === null
        )
          writeLocalValue(accountNicknameKey(userId), nickname);
        writeLocalValue(LEGACY_PARTY_OWNER_KEY, String(userId));
        notifyNicknameChanged(userId);
      } catch (error) {
        // The original and backup are untouched, and the reservation prevents a
        // second account receiving the same legacy party after a partial failure.
        persistor.persist();
        throw error;
      }
    }),
  );
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
