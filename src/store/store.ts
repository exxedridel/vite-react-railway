import {
  configureStore,
  combineReducers,
  type UnknownAction,
  type Middleware,
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
  PVP_PARTY_COMMIT,
  isLocalPartyMutationBlocked,
  withAccountStorageLock,
  writePvpAccountParty,
  pvpPartyRevision,
  setAccountTransactionBlocked,
  isAccountTransactionBlocked,
} from "./accountStorage";

import partyReducer, { resetGame } from "@/slices/partySlice";
import { emptyTrainerBag } from "@/lib/trainerBag";

import { pokeApi } from "@/api/pokeApi";

const rootReducer = combineReducers({
  party: partyReducer,

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

const pvpPartyGuard: Middleware<{}, { party: AppState["party"] }> =
  (api) => (next) => (action) => {
    // Starting a new game requires the checked, server-confirmed coordinator.
    // A legacy dispatch must never clear the local party on its own.
    if (
      action &&
      typeof action === "object" &&
      "type" in action &&
      (action.type === resetGame.type ||
        action.type === "party/fullRestorePokemon")
    )
      return action;
    if (
      action &&
      typeof action === "object" &&
      "type" in action &&
      typeof action.type === "string" &&
      action.type.startsWith("party/") &&
      action.type !== PVP_PARTY_COMMIT &&
      (isAccountTransactionBlocked() || isLocalPartyMutationBlocked(api.getState().party))
    )
      return action;
    return next(action);
  };

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
    }).concat(pvpPartyGuard, pokeApi.middleware),
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
  if (owner !== null)
    await withAccountStorageLock(owner, async () => {
      writeAccountParty(owner, store.getState().party);
    });
}

/** Serializes account changes and cross-tab PvP writes; never waits on a lock while flushing. */
export function transactPvpParty<T>(
  userId: number,
  operation: (
    latest: AppState["party"],
  ) => Promise<{ party: AppState["party"]; value: T }>,
): Promise<T> {
  return serializeAccountChange(async () => {
    await waitForBootstrap();
    if (getActiveAccountId() !== userId)
      throw new Error(
        "La cuenta cambió. Vuelve a conectar PvP desde la cuenta correspondiente.",
      );
    setAccountTransactionBlocked(true);
    persistor.pause();
    try {
      await persistor.flush();
      return await withAccountStorageLock(
        userId,
        async () => {
          const latest =
            readAccountParty(userId)?.party ?? store.getState().party;
          store.dispatch({ type: PVP_PARTY_COMMIT, payload: latest });
          const update = await operation(latest);
          if (update.party !== latest)
            writePvpAccountParty(userId, update.party);
          store.dispatch({ type: PVP_PARTY_COMMIT, payload: update.party });
          return update.value;
        },
        true,
      );
    } finally {
      try {
        resumeWithParty({ party: store.getState().party });
        await persistor.flush();
      } finally {
        setAccountTransactionBlocked(false);
      }
    }
  });
}

function resetAccountUi(): void {
  [
    store.dispatch(pokeApi.util.getRunningQueriesThunk()),
    store.dispatch(pokeApi.util.getRunningMutationsThunk()),
  ].forEach((requests) => requests.forEach((request) => request.abort()));
  [pokeApi.util.resetApiState()].forEach((action) => store.dispatch(action));
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
  if (
    decoded.party.shopLock ||
    decoded.party.resetLock ||
    decoded.party.itemUseLock
  )
    throw new Error(
      "La partida anterior contiene una compra pendiente. Recupérala desde su cuenta original antes de importar.",
    );
  return { raw, party: decoded.party };
}

export function hasLegacyPartyForImport(userId: number): Promise<boolean> {
  accountStorageKey(userId);
  return serializeAccountChange(async () => {
    if (getActiveAccountId() !== userId || !legacyAvailableTo(userId))
      return false;
    if (isLocalPartyMutationBlocked(store.getState().party)) return false;
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
      if (isLocalPartyMutationBlocked(store.getState().party))
        throw new Error(
          "La partida está reservada para una batalla o compra, o esperando sincronización. La importación anterior se conserva.",
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
        if (isLocalPartyMutationBlocked(store.getState().party))
          throw new Error(
            "La partida quedó reservada mientras se importaba. Recupera la batalla o compra pendiente antes de continuar.",
          );
        if (!finishingPreviousImport) {
          // Legacy Pokémon and badges may be imported, but old local money
          // must never replace an already confirmed account wallet.
          const savedBag = current.bag;
          const confirmedWallet =
            savedBag?.currencyVersion === 1 &&
            savedBag.walletUserId === userId &&
            Number.isSafeInteger(savedBag.walletRevision) &&
            Number(savedBag.walletRevision) >= 0;
          const bag = confirmedWallet
            ? { ...savedBag!, items: { ...(savedBag?.items ?? {}) } }
            : emptyTrainerBag();
          resumeWithParty({
            party: {
              ...legacy.party,
              pvpRevision:
                Math.max(
                  pvpPartyRevision(current),
                  pvpPartyRevision(legacy.party),
                ) + 1,
              shopLock: undefined,
              bag: { ...bag, badges: [...(legacy.party.bag?.badges ?? [])] },
            },
          });
        } else resumeWithParty({ party: current });
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
