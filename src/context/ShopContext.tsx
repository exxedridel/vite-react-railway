import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import type { ChatUser } from "@/lib/testMessages";
import type { PokemonMove } from "@/types/moves";
import { testMessagesUrl } from "@/lib/testMessages";
import { store } from "@/store/store";
import {
  accountStorageKey,
  isLocalPartyMutationBlocked,
  setResetSyncBlocked,
  setShopSyncBlocked,
  setItemUseSyncBlocked,
} from "@/store/accountStorage";
import { applyItemUse, prepareItemUse, validItemUse } from "@/lib/shop/itemUse";
import {
  applyShopWallet,
  applyGameReset,
  localBattleActive,
  prepareGameReset,
  prepareShopParty,
  validGameReset,
  validPurchase,
  validWallet,
  validShopCatalog,
  validBalanceAdjustment,
  applyBalanceAdjustment,
} from "@/lib/shop/wallet";
import type {
  ShopAck,
  ShopItemId,
  ShopPlayer,
  ShopPurchase,
  ShopState,
  GameReset,
  ItemUse,
  ConsumableItemId,
  UsableItemId,
  Wallet,
  ShopCatalog,
  BalanceAdjustment,
} from "@/lib/shop/types";

type ShopContextValue = {
  user: ChatUser | null;
  clientId: string;
  connected: boolean;
  synced: boolean;
  players: ShopPlayer[];
  wallet: Wallet | null;
  purchases: ShopPurchase[];
  catalog: ShopCatalog | null;
  adjustments: BalanceAdjustment[];
  setPrice: (
    itemId: ShopItemId,
    price: number,
    expectedCatalogRevision: number,
    requestId?: string,
  ) => Promise<ShopCatalog>;
  adjustBalance: (
    player: ShopPlayer,
    delta: number,
    expectedWalletRevision?: number,
    requestId?: string,
  ) => Promise<BalanceAdjustment | null>;
  resets: GameReset[];
  restarting: boolean;
  uses: ItemUse[];
  usingItem: boolean;
  error: string;
  busy: boolean;
  sync: () => Promise<void>;
  restartGame: () => Promise<void>;
  useFullRestore: (captureId: string) => Promise<void>;
  useTm: (
    captureId: string,
    move: PokemonMove,
    replaceMoveId?: number,
  ) => Promise<void>;
  useItem: (
    itemId: ConsumableItemId,
    captureId: string,
    moveId?: number,
  ) => Promise<void>;
  purchase: (
    player: ShopPlayer,
    itemId: ShopItemId,
    quantity: number,
    expectedRevision?: number,
    requestId?: string,
    expectedCatalogRevision?: number,
  ) => Promise<ShopPurchase | null>;
};
const ShopContext = createContext<ShopContextValue | null>(null);
export function useShopContext() {
  const value = useContext(ShopContext);
  if (!value) throw new Error("La conexión de Tienda no está disponible.");
  return value;
}
const SESSION_ERRORS = new Set([
  "TOKEN_REQUIRED",
  "TOKEN_EXPIRED",
  "INVALID_TOKEN",
  "SESSION_REVOKED",
  "ACCOUNT_NOT_FOUND",
]);
const TIMEOUT = 15000;
class ShopResponseError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo sincronizar la Tienda.";
function token() {
  try {
    return localStorage.getItem("bearer_token");
  } catch {
    return null;
  }
}
function clientFor(user: ChatUser) {
  const storage = user.role === "admin" ? sessionStorage : localStorage;
  const key = `pokemon-pvp-client:v1:${user.role}:${user.id}`;
  const found = storage.getItem(key);
  if (found && /^[\w.:-]{8,128}$/.test(found)) return found;
  const value = crypto.randomUUID();
  storage.setItem(key, value);
  return value;
}
function validState(value: unknown): value is ShopState {
  if (!value || typeof value !== "object") return false;
  const state = value as ShopState;
  return (
    (!state.catalog || validShopCatalog(state.catalog)) &&
    (!state.adjustment || validBalanceAdjustment(state.adjustment)) &&
    (!state.adjustments ||
      (Array.isArray(state.adjustments) &&
        state.adjustments.every(validBalanceAdjustment))) &&
    (!state.wallet || validWallet(state.wallet)) &&
    (!state.purchases ||
      (Array.isArray(state.purchases) &&
        state.purchases.every(validPurchase))) &&
    (!state.purchase || validPurchase(state.purchase)) &&
    (!state.reset || validGameReset(state.reset)) &&
    (!state.resets ||
      (Array.isArray(state.resets) && state.resets.every(validGameReset))) &&
    (!state.use || validItemUse(state.use)) &&
    (!state.uses ||
      (Array.isArray(state.uses) && state.uses.every(validItemUse))) &&
    (!state.players ||
      (Array.isArray(state.players) &&
        state.players.every(
          (player) =>
            player?.user?.role === "player" &&
            Number.isSafeInteger(player.user.id) &&
            typeof player.clientId === "string" &&
            typeof player.online === "boolean" &&
            typeof player.ready === "boolean" &&
            typeof player.inBattle === "boolean" &&
            typeof player.pending === "boolean" &&
            (player.wallet === null || validWallet(player.wallet)),
        )))
  );
}

export default function ShopProvider({
  user,
  onSessionExpired,
  children,
}: {
  user: ChatUser | null;
  onSessionExpired: (token?: string) => Promise<unknown>;
  children: ReactNode;
}) {
  const [clientId, setClientId] = useState("");
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);
  const [players, setPlayers] = useState<ShopPlayer[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [purchases, setPurchases] = useState<ShopPurchase[]>([]);
  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const catalogRef = useRef<ShopCatalog | null>(null);
  const [adjustments, setAdjustments] = useState<BalanceAdjustment[]>([]);
  const [resets, setResets] = useState<GameReset[]>([]);
  const [restarting, setRestarting] = useState(false);
  const [uses, setUses] = useState<ItemUse[]>([]);
  const [usingItem, setUsingItem] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const ownerRef = useRef(user);
  ownerRef.current = user;
  const expiryRef = useRef(onSessionExpired);
  expiryRef.current = onSessionExpired;
  const generation = useRef(0);
  const queueState = useRef<
    (
      value: ShopState,
      proof?: { abortUnlockRequestId?: string },
    ) => Promise<void>
  >(async () => {});
  const mutation = useRef(false);
  const recoverResetRef = useRef<() => Promise<void>>(async () => {});
  const restartRef = useRef<() => Promise<void>>(async () => {
    throw new Error("Inicia sesión para reiniciar la partida.");
  });
  const restartGame = useCallback(() => restartRef.current(), []);
  const recoverItemUseRef = useRef<() => Promise<void>>(async () => {});
  const useItemRef = useRef<
    (
      itemId: UsableItemId,
      captureId: string,
      moveId?: number,
      learning?: { move: PokemonMove; replaceMoveId?: number },
    ) => Promise<void>
  >(async () => {
    throw new Error("Inicia sesión para usar objetos de tu Bag.");
  });
  const useItem = useCallback(
    (itemId: ConsumableItemId, captureId: string, moveId?: number) =>
      useItemRef.current(itemId, captureId, moveId),
    [],
  );
  const useFullRestore = useCallback(
    (captureId: string) => useItemRef.current("full-restore", captureId),
    [],
  );
  const useTm = useCallback(
    (captureId: string, move: PokemonMove, replaceMoveId?: number) =>
      useItemRef.current("tm", captureId, move.id, {
        move,
        ...(replaceMoveId === undefined ? {} : { replaceMoveId }),
      }),
    [],
  );

  const emit = useCallback(
    async (
      event: string,
      payload: unknown,
    ): Promise<Extract<ShopAck, { ok: true }>> => {
      const socket = socketRef.current;
      const owner = ownerRef.current?.id;
      const capturedToken =
        typeof socket?.auth === "object"
          ? (socket.auth.token as string)
          : undefined;
      if (!socket?.connected)
        throw new Error("Reconecta con la Tienda para continuar.");
      return new Promise((resolve, reject) => {
        socket
          .timeout(TIMEOUT)
          .emit(event, payload, (timeout: Error | null, response: ShopAck) => {
            if (
              socketRef.current !== socket ||
              ownerRef.current?.id !== owner ||
              token() !== capturedToken
            ) {
              reject(new Error("La sesión cambió durante la compra."));
              return;
            }
            if (timeout) {
              reject(
                new Error(
                  "No llegó la confirmación. Actualiza la conexión para recuperar la transacción.",
                ),
              );
              return;
            }
            if (!response || response.ok !== true) {
              const detail =
                response && !response.ok ? response.error : undefined;
              if (detail && SESSION_ERRORS.has(detail.code))
                void expiryRef.current(capturedToken);
              reject(
                new ShopResponseError(
                  detail?.message ??
                    "El servidor rechazó la operación de Tienda.",
                  detail?.code,
                ),
              );
              return;
            }
            if (!validState(response)) {
              reject(
                new Error("La Tienda devolvió una respuesta incompatible."),
              );
              return;
            }
            resolve(response);
          });
      });
    },
    [],
  );

  const sync = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) throw new Error("Inicia sesión para conectar con la Tienda.");
    if (!socket.connected) {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          window.clearTimeout(timer);
          socket.off("connect", done);
          socket.off("connect_error", fail);
        };
        const done = () => {
          cleanup();
          resolve();
        };
        const fail = (reason: Error) => {
          cleanup();
          reject(reason);
        };
        const timer = window.setTimeout(
          () => fail(new Error("No se pudo recuperar la conexión con Tienda.")),
          TIMEOUT,
        );
        socket.once("connect", done);
        socket.once("connect_error", fail);
        socket.connect();
      });
    }
    // This request is emitted after the prepare ACK. The server serializes its
    // read behind that purchase, so it can prove an absent request was aborted.
    const abortUnlockRequestId = store.getState().party.shopLock?.requestId;
    const balanceLock = store.getState().party.shopLock;
    const response = await emit(
      "shop:sync",
      balanceLock?.operation === "balance-adjustment"
        ? { adjustmentRequestId: balanceLock.requestId }
        : {},
    );
    await queueState.current(response, { abortUnlockRequestId });
    await recoverResetRef.current();
    await recoverItemUseRef.current();
  }, [emit]);

  useEffect(() => {
    const run = ++generation.current;
    setClientId("");
    setConnected(false);
    setSynced(false);
    setPlayers([]);
    setWallet(null);
    setPurchases([]);
    setCatalog(null);
    catalogRef.current = null;
    setAdjustments([]);
    setResets([]);
    setRestarting(false);
    setUses([]);
    setUsingItem(false);
    setError("");
    setBusy(false);
    mutation.current = false;
    if (!user) {
      setShopSyncBlocked(false);
      setResetSyncBlocked(false);
      setItemUseSyncBlocked(false);
      return;
    }
    const actor = user;
    let id: string, capturedToken: string, endpoint: string;
    try {
      id = clientFor(actor);
      const saved = token();
      if (!saved) throw new Error("Inicia sesión para conectar con la Tienda.");
      capturedToken = saved;
      endpoint = new URL(
        "/shop",
        testMessagesUrl(
          import.meta.env.VITE_WEBSOCKET_URL,
          import.meta.env.VITE_BASE_SERVICES,
        ),
      ).toString();
    } catch (reason) {
      setError(message(reason));
      return;
    }
    setClientId(id);
    const socket = io(endpoint, {
      auth: { token: capturedToken, clientId: id },
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: TIMEOUT,
    });
    socketRef.current = socket;
    let reconciliation = Promise.resolve();
    let applied = false;
    let latestWallet: Wallet | null = null;
    let latestPurchases: ShopPurchase[] = [];
    let latestAdjustments: BalanceAdjustment[] = [];
    let latestResets: GameReset[] = [];
    let resetRecovery: Promise<void> | null = null;
    let resetStarting = false;
    let latestUses: ItemUse[] = [];
    let itemRecovery: Promise<void> | null = null;
    let itemStarting = false;
    let presenceTimer: number | undefined;
    let presenceKey = "";
    const current = () =>
      generation.current === run &&
      socketRef.current === socket &&
      ownerRef.current?.id === actor.id &&
      token() === capturedToken;
    const reportPresence = () => {
      if (!current() || !socket.connected || actor.role !== "player") return;
      const party = store.getState().party;
      const localBattle = localBattleActive(party);
      const ready =
        applied &&
        !localBattle &&
        !party.shopLock &&
        !party.resetLock &&
        !party.itemUseLock &&
        !latestResets.some((reset) => reset.status === "pending") &&
        !latestUses.some((use) => use.status === "pending");
      const next = JSON.stringify([ready, localBattle]);
      if (next === presenceKey) return;
      presenceKey = next;
      void emit("shop:presence", { ready, localBattle })
        .then((response) => receive(response))
        .catch((reason) => {
          presenceKey = "";
          if (current()) setError(message(reason));
        });
    };
    const schedulePresence = () => {
      if (presenceTimer !== undefined) window.clearTimeout(presenceTimer);
      presenceTimer = window.setTimeout(reportPresence, 50);
    };
    async function reconcile(
      next: ShopState,
      proof?: { abortUnlockRequestId?: string },
    ) {
      if (!current()) return;
      if (
        next.catalog &&
        next.catalog.revision >= (catalogRef.current?.revision ?? -1)
      ) {
        catalogRef.current = next.catalog;
        setCatalog(next.catalog);
      }
      if (next.adjustments || next.adjustment) {
        const previous = new Map(
          latestAdjustments.map((entry) => [entry.adjustmentId, entry]),
        );
        const merged = new Map<string, BalanceAdjustment>();
        for (const entry of next.adjustments ?? latestAdjustments) {
          const saved = previous.get(entry.adjustmentId);
          merged.set(
            entry.adjustmentId,
            saved?.status === "applied" ? saved : entry,
          );
        }
        if (next.adjustment) {
          const saved = previous.get(next.adjustment.adjustmentId);
          merged.set(
            next.adjustment.adjustmentId,
            saved?.status === "applied" ? saved : next.adjustment,
          );
        }
        latestAdjustments = [...merged.values()];
        setAdjustments(latestAdjustments);
      }
      if (actor.role === "admin") {
        if (next.players) setPlayers(next.players);
        if (next.purchases) setPurchases(next.purchases);
        setSynced(true);
        setError("");
        return;
      }
      if (next.wallet) {
        if (next.wallet.userId !== actor.id)
          throw new Error("El saldo recibido pertenece a otra cuenta.");
        const savedRevision =
          store.getState().party.bag?.walletUserId === actor.id
            ? (store.getState().party.bag?.walletRevision ?? -1)
            : -1;
        if (
          next.wallet.revision <
          Math.max(latestWallet?.revision ?? -1, savedRevision)
        )
          return;
        latestWallet = next.wallet;
      }
      if (next.purchases) {
        latestPurchases = next.purchases;
        setPurchases(next.purchases);
      }
      if (next.resets || next.reset) {
        const previous = new Map(
          latestResets.map((reset) => [reset.requestId, reset]),
        );
        const incoming = next.resets ?? latestResets;
        latestResets = incoming.map((reset) => {
          const saved = previous.get(reset.requestId);
          return saved &&
            saved.status !== "pending" &&
            reset.status === "pending"
            ? saved
            : reset;
        });
        if (next.reset) {
          const reset = next.reset;
          const index = latestResets.findIndex(
            (entry) => entry.requestId === reset.requestId,
          );
          if (index < 0) latestResets.push(reset);
          else if (
            latestResets[index].status === "pending" ||
            reset.status !== "pending"
          )
            latestResets[index] = reset;
        }
        setResets(latestResets);
      }
      if (next.uses || next.use) {
        const previous = new Map(latestUses.map((use) => [use.requestId, use]));
        latestUses = (next.uses ?? latestUses).map((use) => {
          const saved = previous.get(use.requestId);
          return saved && saved.status !== "pending" && use.status === "pending"
            ? saved
            : use;
        });
        if (next.use) {
          const use = next.use;
          const index = latestUses.findIndex(
            (entry) => entry.requestId === use.requestId,
          );
          if (index < 0) latestUses.push(use);
          else if (
            latestUses[index].status === "pending" ||
            use.status !== "pending"
          )
            latestUses[index] = use;
        }
        setUses(latestUses);
      }
      if (!latestWallet)
        throw new Error("Falta recuperar el saldo de Pokedollars.");
      const resetLock = store.getState().party.resetLock;
      const receipt =
        resetLock &&
        latestResets.find(
          (entry) =>
            entry.requestId === resetLock.requestId &&
            entry.userId === actor.id &&
            entry.clientId === id,
        );
      if (receipt) {
        const resetStatus = await applyGameReset(latestWallet, receipt, id);
        if (!current()) return;
        if (resetStatus === "pending") {
          const confirmed = await emit("shop:reset-applied", {
            requestId: receipt.requestId,
            revision: receipt.walletRevision,
          });
          // Reconcile the ACK inline, rather than waiting on our own queue.
          await reconcile(confirmed);
          return;
        }
      }
      const itemLock = store.getState().party.itemUseLock;
      const itemReceipt =
        itemLock &&
        latestUses.find(
          (use) =>
            use.requestId === itemLock.requestId &&
            use.userId === actor.id &&
            use.clientId === id,
        );
      if (itemReceipt) {
        const itemStatus = await applyItemUse(latestWallet, itemReceipt, id);
        if (!current()) return;
        if (itemStatus === "pending") {
          const confirmed = await emit("shop:use-applied", {
            requestId: itemReceipt.requestId,
            revision: itemReceipt.walletRevision,
          });
          await reconcile(confirmed);
          return;
        }
      }
      const pending = latestPurchases.filter(
        (purchase) =>
          purchase.userId === actor.id && purchase.status === "pending",
      );
      const balanceLock = store.getState().party.shopLock;
      if (balanceLock?.operation === "balance-adjustment") {
        const receipt = latestAdjustments.find(
          (entry) =>
            entry.requestId === balanceLock.requestId &&
            entry.userId === actor.id &&
            entry.clientId === id,
        );
        if (receipt) {
          const status = await applyBalanceAdjustment(
            latestWallet,
            receipt,
            id,
          );
          if (!current()) return;
          if (status === "pending") {
            await reconcile(
              await emit("shop:balance-applied", {
                adjustmentId: receipt.adjustmentId,
                revision: receipt.walletRevision,
              }),
            );
            return;
          }
        }
      }
      await applyShopWallet(
        latestWallet,
        [
          ...pending.map((purchase) => purchase.requestId),
          ...latestAdjustments
            .filter((entry) => entry.status === "pending")
            .map((entry) => entry.requestId),
        ],
        {
          appliedPurchases: next.purchases?.filter(
            (purchase) => purchase.status === "applied",
          ),
          abortUnlockRequestId: proof?.abortUnlockRequestId,
        },
      );
      if (!current()) return;
      applied = true;
      setWallet(latestWallet);
      setSynced(true);
      setError("");
      setShopSyncBlocked(
        !!store.getState().party.shopLock ||
          latestAdjustments.some((entry) => entry.status === "pending"),
      );
      setResetSyncBlocked(
        !!store.getState().party.resetLock ||
          latestResets.some((reset) => reset.status === "pending"),
      );
      setItemUseSyncBlocked(
        !!store.getState().party.itemUseLock ||
          latestUses.some((use) => use.status === "pending"),
      );
      schedulePresence();
      for (const purchase of pending) {
        if (
          purchase.clientId !== id ||
          purchase.walletRevision > latestWallet.revision
        )
          continue;
        const response = await emit("shop:applied", {
          purchaseId: purchase.purchaseId,
          revision: purchase.walletRevision,
        });
        // Append instead of awaiting our own reconciliation queue.
        void receive(response);
      }
    }
    function receive(
      next: ShopState,
      proof?: { abortUnlockRequestId?: string },
    ): Promise<void> {
      if (!current()) return Promise.resolve();
      if (!validState(next)) {
        setError("La Tienda envió datos incompatibles.");
        setSynced(false);
        return Promise.resolve();
      }
      const operation = reconciliation
        .catch(() => {})
        .then(() => reconcile(next, proof));
      reconciliation = operation.catch((reason) => {
        if (current()) {
          applied = false;
          setSynced(false);
          setError(message(reason));
          setShopSyncBlocked(!!store.getState().party.shopLock);
          setResetSyncBlocked(
            !!store.getState().party.resetLock ||
              latestResets.some((reset) => reset.status === "pending"),
          );
          setItemUseSyncBlocked(
            !!store.getState().party.itemUseLock ||
              latestUses.some((use) => use.status === "pending"),
          );
        }
      });
      return operation;
    }
    queueState.current = receive;
    async function sendResetIntent() {
      const lock = store.getState().party.resetLock;
      if (!lock) return;
      if (
        !current() ||
        !socket.connected ||
        actor.role !== "player" ||
        lock.userId !== actor.id ||
        lock.clientId !== id
      )
        throw new Error(
          "Reconecta el navegador original para recuperar el reinicio de la partida.",
        );
      const payload = {
        requestId: lock.requestId,
        expectedWalletRevision: lock.expectedWalletRevision,
      };
      let response: Extract<ShopAck, { ok: true }>;
      let rejected: unknown;
      try {
        response = await emit("shop:reset", payload);
      } catch (reason) {
        if (
          !(reason instanceof ShopResponseError) ||
          !current() ||
          !socket.connected
        )
          throw reason;
        // Persist a cancellation tombstone before releasing local consent. A
        // delayed copy of this request can then never reset a later game.
        rejected = reason;
        response = await emit("shop:reset-cancel", payload);
      }
      await receive(response);
      if (!current()) throw new Error("La sesión cambió durante el reinicio.");
      const receipt =
        response.reset ??
        response.resets?.find((entry) => entry.requestId === lock.requestId);
      if (store.getState().party.resetLock)
        throw new Error(
          "El reinicio sigue pendiente. Recupera la conexión en este navegador.",
        );
      if (receipt?.status === "cancelled")
        throw (
          rejected ??
          new Error("El reinicio se canceló; tu partida anterior se conserva.")
        );
    }
    function recoverReset(): Promise<void> {
      if (actor.role !== "player" || !store.getState().party.resetLock)
        return Promise.resolve();
      if (resetRecovery) return resetRecovery;
      setRestarting(true);
      const operation = sendResetIntent();
      resetRecovery = operation;
      void operation
        .catch((reason) => {
          if (current()) setError(message(reason));
        })
        .finally(() => {
          if (resetRecovery === operation) resetRecovery = null;
          if (current()) setRestarting(false);
        });
      return operation;
    }
    recoverResetRef.current = recoverReset;
    restartRef.current = async () => {
      if (resetStarting || resetRecovery)
        throw new Error("Espera la confirmación del reinicio anterior.");
      if (!current() || !socket.connected || !applied || !latestWallet)
        throw new Error(
          "Conecta y sincroniza tus Pokedollars antes de reiniciar la partida.",
        );
      if (actor.role !== "player")
        throw new Error("Sólo un jugador puede reiniciar su partida.");
      if (
        isLocalPartyMutationBlocked(store.getState().party) ||
        localBattleActive(store.getState().party)
      )
        throw new Error(
          "Termina la batalla o compra pendiente antes de reiniciar la partida.",
        );
      resetStarting = true;
      setRestarting(true);
      setError("");
      setResetSyncBlocked(true);
      try {
        await prepareGameReset(
          actor.id,
          id,
          crypto.randomUUID(),
          latestWallet.revision,
        );
        if (!current() || !socket.connected)
          throw new Error(
            "La conexión cambió; recupera el reinicio desde este navegador.",
          );
        await recoverReset();
      } catch (reason) {
        if (current()) setError(message(reason));
        throw reason;
      } finally {
        resetStarting = false;
        if (current()) {
          setRestarting(false);
          setResetSyncBlocked(
            !!store.getState().party.resetLock ||
              latestResets.some((reset) => reset.status === "pending"),
          );
        }
      }
    };
    async function sendItemIntent() {
      const lock = store.getState().party.itemUseLock;
      if (!lock) return;
      if (
        !current() ||
        !socket.connected ||
        actor.role !== "player" ||
        lock.userId !== actor.id ||
        lock.clientId !== id
      )
        throw new Error(
          "Reconecta el navegador original para recuperar el uso del objeto.",
        );
      const payload = {
        requestId: lock.requestId,
        captureId: lock.captureId,
        ...(lock.itemId === undefined ? {} : { itemId: lock.itemId }),
        ...(lock.moveId === undefined ? {} : { moveId: lock.moveId }),
        context: lock.context,
        planHash: lock.planHash,
        expectedWalletRevision: lock.expectedWalletRevision,
      };
      let response: Extract<ShopAck, { ok: true }>;
      let rejected: unknown;
      try {
        response = await emit("shop:use", payload);
      } catch (reason) {
        if (
          !(reason instanceof ShopResponseError) ||
          !current() ||
          !socket.connected
        )
          throw reason;
        rejected = reason;
        response = await emit("shop:use-cancel", payload);
      }
      await receive(response);
      if (!current())
        throw new Error("La sesión cambió durante el uso del objeto.");
      const receipt =
        response.use ??
        response.uses?.find((entry) => entry.requestId === lock.requestId);
      if (store.getState().party.itemUseLock)
        throw new Error(
          "El uso del objeto sigue pendiente. Recupera la operación desde este navegador.",
        );
      if (receipt?.status === "cancelled")
        throw (
          rejected ??
          new Error(
            "El uso del objeto se canceló; tu inventario y Pokémon se conservan.",
          )
        );
    }
    function recoverItemUse(): Promise<void> {
      if (actor.role !== "player" || !store.getState().party.itemUseLock)
        return Promise.resolve();
      if (itemRecovery) return itemRecovery;
      setUsingItem(true);
      const operation = sendItemIntent();
      itemRecovery = operation;
      void operation
        .catch((reason) => {
          if (current()) setError(message(reason));
        })
        .finally(() => {
          if (itemRecovery === operation) itemRecovery = null;
          if (current()) setUsingItem(false);
        });
      return operation;
    }
    recoverItemUseRef.current = recoverItemUse;
    useItemRef.current = async (itemId, captureId, moveId, learning) => {
      if (itemStarting || itemRecovery)
        throw new Error("Espera a que termine el uso del objeto anterior.");
      if (
        !current() ||
        !socket.connected ||
        !applied ||
        !latestWallet ||
        actor.role !== "player"
      )
        throw new Error(
          "Conecta y sincroniza tu inventario antes de usar un objeto.",
        );
      if (isLocalPartyMutationBlocked(store.getState().party))
        throw new Error(
          "Termina la batalla reservada o la operación pendiente antes de usar un objeto.",
        );
      if ((latestWallet.items[itemId] ?? 0) < 1)
        throw new Error("No tienes existencias de este objeto en tu Bag.");
      itemStarting = true;
      setUsingItem(true);
      setError("");
      setItemUseSyncBlocked(true);
      try {
        // Load before the storage transaction. The resulting effects are planned
        // once against its latest state and persisted before any server debit.
        const planner = await import("@/lib/fullRestorePlan");
        if (itemId !== "tm") await planner.loadFullRestoreEngine();
        if (!current() || !socket.connected)
          throw new Error("La conexión cambió antes de preparar el objeto.");
        await prepareItemUse(
          actor.id,
          id,
          crypto.randomUUID(),
          captureId,
          latestWallet.revision,
          (party, target) => {
            if (itemId === "tm") {
              if (!learning || learning.move.id !== moveId)
                throw new Error(
                  "Selecciona un movimiento compatible antes de usar una TM.",
                );
              return planner.prepareTmParty(
                party,
                target,
                learning.move,
                learning.replaceMoveId,
              );
            }
            return planner.preparePartyItem(party, target, itemId, moveId);
          },
          itemId,
          moveId,
        );
        if (!current() || !socket.connected)
          throw new Error(
            "Recupera el uso del objeto desde este navegador al volver a conectar.",
          );
        await recoverItemUse();
      } catch (reason) {
        if (current()) setError(message(reason));
        throw reason;
      } finally {
        itemStarting = false;
        if (current()) {
          setUsingItem(false);
          setItemUseSyncBlocked(
            !!store.getState().party.itemUseLock ||
              latestUses.some((use) => use.status === "pending"),
          );
        }
      }
    };
    socket.on("shop:state", (next: ShopState) => {
      void receive(next).catch(() => {});
    });
    socket.on(
      "shop:prepare",
      (
        request: {
          requestId?: unknown;
          playerUserId?: unknown;
          clientId?: unknown;
          expectedWalletRevision?: unknown;
          operation?: "balance-adjustment";
        },
        acknowledge: (response: unknown) => void,
      ) => {
        if (
          !current() ||
          actor.role !== "player" ||
          !request ||
          request.playerUserId !== actor.id ||
          request.clientId !== id ||
          typeof request.requestId !== "string" ||
          !/^[\w.:-]{1,128}$/.test(request.requestId) ||
          !Number.isSafeInteger(request.expectedWalletRevision) ||
          Number(request.expectedWalletRevision) < 0 ||
          (request.operation !== undefined &&
            request.operation !== "balance-adjustment")
        ) {
          acknowledge({
            ok: false,
            error: {
              code: "INVALID_PREPARE",
              message: "La compra no pertenece a esta instancia del jugador.",
            },
          });
          return;
        }
        setShopSyncBlocked(true);
        const prepare = reconciliation
          .catch(() => {})
          .then(async () => {
            if (!current() || !applied)
              throw new Error("Recupera el saldo antes de comprar.");
            const revision = await prepareShopParty(
              actor.id,
              id,
              request.requestId as string,
              request.expectedWalletRevision as number,
              request.operation,
            );
            if (!current() || !socket.connected)
              throw new Error("La conexión cambió durante la compra.");
            acknowledge({ ok: true, revision });
            // Do not await: sync reconciliation runs after this prepare and
            // its server read waits for purchase completion or cancellation.
            void sync().catch((reason) => {
              if (current()) setError(message(reason));
            });
          });
        reconciliation = prepare.catch((reason) => {
          if (current()) {
            setShopSyncBlocked(!!store.getState().party.shopLock);
            setError(message(reason));
          }
          acknowledge({
            ok: false,
            error: { code: "PLAYER_NOT_READY", message: message(reason) },
          });
        });
      },
    );
    socket.on("shop:error", (detail: { code?: string; message?: string }) => {
      if (!current()) return;
      setError(detail?.message ?? "No se pudo recuperar la Tienda.");
      if (detail?.code && SESSION_ERRORS.has(detail.code))
        void expiryRef.current(capturedToken);
    });
    socket.on("connect", () => {
      if (!current()) return;
      applied = false;
      setConnected(true);
      setSynced(false);
      presenceKey = "";
      void sync().catch((reason) => {
        if (current()) setError(message(reason));
      });
    });
    socket.on("disconnect", () => {
      if (!current()) return;
      applied = false;
      setConnected(false);
      setSynced(false);
      presenceKey = "";
    });
    socket.on(
      "connect_error",
      (reason: Error & { data?: { code?: string } }) => {
        if (!current()) return;
        setConnected(false);
        setSynced(false);
        setError(message(reason));
        if (reason.data?.code && SESSION_ERRORS.has(reason.data.code))
          void expiryRef.current(capturedToken);
      },
    );
    const unsubscribe = store.subscribe(schedulePresence);
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === accountStorageKey(actor.id) &&
        current() &&
        latestWallet
      )
        void receive({
          wallet: latestWallet,
        }).catch(() => {});
    };
    window.addEventListener("storage", onStorage);
    setShopSyncBlocked(!!store.getState().party.shopLock);
    setResetSyncBlocked(!!store.getState().party.resetLock);
    setItemUseSyncBlocked(!!store.getState().party.itemUseLock);
    socket.connect();
    return () => {
      unsubscribe();
      window.removeEventListener("storage", onStorage);
      if (presenceTimer !== undefined) window.clearTimeout(presenceTimer);
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
        queueState.current = async () => {};
        recoverResetRef.current = async () => {};
        restartRef.current = async () => {
          throw new Error("Inicia sesión para reiniciar la partida.");
        };
        recoverItemUseRef.current = async () => {};
        useItemRef.current = async () => {
          throw new Error("Inicia sesión para usar un objeto.");
        };
      }
      setShopSyncBlocked(false);
      setResetSyncBlocked(false);
      setItemUseSyncBlocked(false);
    };
  }, [user?.id, user?.role, sync, emit]);

  const purchase = async (
    player: ShopPlayer,
    itemId: ShopItemId,
    quantity: number,
    expectedRevision = player.wallet?.revision,
    requestId: string = crypto.randomUUID(),
    expectedCatalogRevision = catalogRef.current?.revision,
  ): Promise<ShopPurchase | null> => {
    if (ownerRef.current?.role !== "admin")
      throw new Error("Sólo el administrador puede confirmar compras.");
    if (mutation.current)
      throw new Error("Espera la confirmación de la compra anterior.");
    mutation.current = true;
    setBusy(true);
    setError("");
    try {
      if (expectedCatalogRevision === undefined)
        throw new Error("Recupera los precios antes de confirmar la compra.");
      const response = await emit("shop:purchase", {
        requestId,
        playerUserId: player.user.id,
        clientId: player.clientId,
        itemId,
        quantity,
        expectedWalletRevision: expectedRevision,
        expectedCatalogRevision,
      });
      await queueState.current(response);
      return (
        response.purchase ??
        response.purchases?.find((entry) => entry.requestId === requestId) ??
        null
      );
    } catch (reason) {
      setError(message(reason));
      throw reason;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  };
  async function adminMutation(
    event: string,
    payload: unknown,
  ): Promise<Extract<ShopAck, { ok: true }>> {
    if (ownerRef.current?.role !== "admin")
      throw new Error("Esta operación requiere una cuenta administradora.");
    if (mutation.current)
      throw new Error("Espera a que termine la operación anterior.");
    mutation.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await emit(event, payload);
      await queueState.current(response);
      return response;
    } catch (reason) {
      setError(message(reason));
      throw reason;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  async function setPrice(
    itemId: ShopItemId,
    price: number,
    expectedCatalogRevision: number,
    requestId: string = crypto.randomUUID(),
  ): Promise<ShopCatalog> {
    const response = await adminMutation("shop:price-set", {
      requestId,
      itemId,
      price,
      expectedCatalogRevision,
    });
    if (!response.catalog)
      throw new Error("No se recibió el catálogo actualizado.");
    return response.catalog;
  }
  async function adjustBalance(
    player: ShopPlayer,
    delta: number,
    expectedWalletRevision = player.wallet?.revision,
    requestId: string = crypto.randomUUID(),
  ): Promise<BalanceAdjustment | null> {
    const response = await adminMutation("shop:balance-adjust", {
      requestId,
      playerUserId: player.user.id,
      clientId: player.clientId,
      delta,
      expectedWalletRevision,
    });
    return (
      response.adjustment ??
      response.adjustments?.find((entry) => entry.requestId === requestId) ??
      null
    );
  }
  return (
    <ShopContext.Provider
      value={{
        user,
        clientId,
        connected,
        synced,
        players,
        wallet,
        purchases,
        catalog,
        adjustments,
        setPrice,
        adjustBalance,
        resets,
        restarting,
        uses,
        usingItem,
        error,
        busy,
        sync,
        restartGame,
        useFullRestore,
        useTm,
        useItem,
        purchase,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}
