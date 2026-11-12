import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Check, Coins, LogOut, RefreshCw, Store, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModeToggle } from "@/components/ui/mode-toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useShopContext } from "@/context/ShopContext";
import type { ShopPlayer, ShopPurchase } from "@/lib/shop/types";
import {
  PLAYER_COLORS,
  SHOP_ITEMS,
  formatShopMoney,
  isPlayerColorId,
  maximumShopQuantity,
  parseShopQuantity,
  quoteShopPurchase,
  readShopColors,
  shopPlayerColor,
  writeShopColors,
  type PlayerColorId,
  type PlayerColorPreferences,
  type ShopCatalogItem,
} from "@/lib/adminShop";
import "./AdminShopPage.css";

type PurchaseDraft = {
  player: ShopPlayer;
  item: ShopCatalogItem;
  quantity: string;
  revision: number;
  balance: number;
  requestId: string;
  attempted: boolean;
};
const playerName = (player: ShopPlayer) =>
  `${player.user.first_name} ${player.user.last_name}`.trim() ||
  player.user.email;
function playerStyle(colorId: PlayerColorId): CSSProperties {
  const color = PLAYER_COLORS.find((entry) => entry.id === colorId)!;
  return {
    "--player-color": color.hsl || "var(--primary)",
    "--player-foreground": color.foreground || "var(--primary-foreground)",
  } as CSSProperties;
}
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "No se pudo confirmar la operación. Actualiza la conexión y vuelve a intentarlo.";

export default function AdminShopPage() {
  const shop = useShopContext();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [colors, setColors] = useState<PlayerColorPreferences>({});
  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  const [localPurchase, setLocalPurchase] = useState<ShopPurchase | null>(null);
  const [localError, setLocalError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const submitLock = useRef(false);
  const adminId = shop.user?.id;
  useEffect(() => {
    setSelectedId(null);
    setDraft(null);
    setLocalPurchase(null);
    setLocalError("");
    if (!adminId) {
      setColors({});
      return;
    }
    try {
      setColors(readShopColors(localStorage, adminId));
    } catch {
      setColors({});
    }
  }, [adminId]);

  const players = Array.from(
    new Map(
      shop.players
        .filter((player) => player.online)
        .map((player) => [player.user.id, player]),
    ).values(),
  );
  const selectedPlayer = players.find(
    (player) => player.user.id === selectedId,
  );
  const readyConnection = shop.connected && shop.synced;
  const selectedAvailable =
    !!selectedPlayer?.wallet &&
    selectedPlayer.ready &&
    !selectedPlayer.inBattle &&
    !selectedPlayer.pending &&
    readyConnection;
  const draftPlayer = draft
    ? players.find(
        (player) =>
          player.user.id === draft.player.user.id &&
          player.clientId === draft.player.clientId,
      )
    : undefined;
  const transaction = draft
    ? (shop.purchases.find(
        (purchase) =>
          purchase.requestId === draft.requestId &&
          purchase.userId === draft.player.user.id,
      ) ?? localPurchase)
    : null;
  const quantity = draft ? parseShopQuantity(draft.quantity) : null;
  const maximum = draft
    ? maximumShopQuantity(draft.balance, draft.item.price)
    : 0;
  const quote =
    draft && quantity !== null
      ? quoteShopPurchase(draft.balance, draft.item.price, quantity)
      : null;
  const changedQuote =
    !!draft &&
    (!draftPlayer?.wallet ||
      draftPlayer.wallet.revision !== draft.revision ||
      draftPlayer.wallet.balance !== draft.balance);
  const draftAvailable =
    !!draftPlayer?.wallet &&
    draftPlayer.ready &&
    !draftPlayer.inBattle &&
    !draftPlayer.pending;
  const canConfirm =
    !!draft &&
    !transaction &&
    !submitting &&
    !shop.busy &&
    readyConnection &&
    !!quote &&
    (draft.attempted || (!changedQuote && draftAvailable));

  async function synchronize() {
    if (syncing) return;
    setSyncing(true);
    setLocalError("");
    try {
      await shop.sync();
    } catch (error) {
      setLocalError(errorText(error));
    } finally {
      setSyncing(false);
    }
  }
  function changeColor(playerId: number, colorId: PlayerColorId) {
    if (!isPlayerColorId(colorId)) return;
    const next = { ...colors, [String(playerId)]: colorId };
    setColors(next);
    if (adminId)
      try {
        writeShopColors(localStorage, adminId, next);
      } catch {
        setLocalError(
          "El color cambió, pero no se pudo guardar en este navegador.",
        );
      }
  }
  function openPurchase(item: ShopCatalogItem) {
    if (!selectedPlayer?.wallet || !selectedAvailable || shop.busy) return;
    setLocalPurchase(null);
    setLocalError("");
    setDraft({
      player: selectedPlayer,
      item,
      quantity: "1",
      revision: selectedPlayer.wallet.revision,
      balance: selectedPlayer.wallet.balance,
      requestId: crypto.randomUUID(),
      attempted: false,
    });
  }
  function refreshQuote() {
    if (!draft || !draftPlayer?.wallet || !draftAvailable || draft.attempted)
      return;
    const nextMaximum = maximumShopQuantity(
      draftPlayer.wallet.balance,
      draft.item.price,
    );
    setLocalError("");
    setDraft({
      ...draft,
      player: draftPlayer,
      revision: draftPlayer.wallet.revision,
      balance: draftPlayer.wallet.balance,
      quantity: String(Math.max(1, Math.min(quantity ?? 1, nextMaximum))),
      requestId: crypto.randomUUID(),
    });
  }
  async function confirmPurchase() {
    if (!draft || !canConfirm || quantity === null || submitLock.current)
      return;
    submitLock.current = true;
    setSubmitting(true);
    setLocalError("");
    const attempt = { ...draft, attempted: true };
    setDraft(attempt);
    try {
      const confirmed = await shop.purchase(
        attempt.player,
        attempt.item.id,
        quantity,
        attempt.revision,
        attempt.requestId,
      );
      if (confirmed) setLocalPurchase(confirmed);
    } catch (error) {
      setLocalError(errorText(error));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }
  function closeDialog() {
    if (submitLock.current) return;
    setDraft(null);
    setLocalPurchase(null);
    setLocalError("");
  }

  return (
    <main className="admin-shop-page">
      <header className="admin-shop-header">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Store className="h-6 w-6 text-brand" /> Tienda
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={syncing || submitting}
            onClick={() => void synchronize()}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Actualizar conexión
          </Button>
          <ModeToggle />
          <Button asChild variant="outline" size="icon">
            <Link to="/logout" aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>
      {!readyConnection && (
        <p role="status" className="mb-4 rounded-xl border p-3 text-sm">
          Conectando con los jugadores y recuperando sus Pokedollars…
        </p>
      )}
      {(localError || shop.error) && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-destructive/40 p-3 text-sm text-destructive"
        >
          {localError || shop.error}
        </p>
      )}
      <section className="admin-mart-scene" aria-labelledby="admin-shop-prices">
        <div className="admin-mart-menu">
          <div className="admin-mart-menu__title">
            <h2 id="admin-shop-prices">Poké Mart</h2>
            <span>Precios en Pokedollars</span>
          </div>
          <p className="px-4 py-3 text-sm" role="status">
            {selectedPlayer ? (
              <>
                Comprando para <strong>{playerName(selectedPlayer)}</strong> ·{" "}
                {selectedPlayer.wallet
                  ? `${formatShopMoney(selectedPlayer.wallet.balance)} Pokedollars`
                  : "recuperando saldo"}
                {selectedPlayer.inBattle
                  ? " · En batalla"
                  : selectedPlayer.pending
                    ? " · Compra pendiente de guardar"
                    : ""}
              </>
            ) : (
              "Selecciona un jugador conectado para elegir su compra."
            )}
          </p>
          <ul className="admin-mart-items">
            {SHOP_ITEMS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="admin-mart-item"
                  disabled={!selectedAvailable || shop.busy}
                  onClick={() => openPurchase(item)}
                  aria-label={`Comprar ${item.name}`}
                >
                  <img src={item.image} alt="" draggable={false} />
                  <span className="admin-mart-item__name">{item.name}</span>
                  <strong>
                    {formatShopMoney(item.price)}{" "}
                    <span className="admin-price-unit">PD</span>
                  </strong>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <section
          className="admin-mart-players"
          aria-labelledby="admin-players-heading"
        >
          <h2
            id="admin-players-heading"
            className="mb-3 flex items-center gap-2 text-lg font-bold"
          >
            <Users className="h-5 w-5" /> Jugadores conectados ·{" "}
            {players.length}
          </h2>
          {!players.length ? (
            <p
              role="status"
              className="rounded-xl border bg-background/90 p-4 text-sm"
            >
              Los jugadores aparecerán aquí al conectarse a la partida.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {players.map((player) => (
                <article
                  key={player.user.id}
                  className={`admin-player-card${selectedId === player.user.id ? " admin-player-card--selected" : ""}`}
                  style={playerStyle(shopPlayerColor(colors, player.user.id))}
                  data-testid={`shop-player-${player.user.id}`}
                >
                  <div className="admin-player-card__heading">
                    <span className="admin-player-dot" aria-hidden="true" />
                    <div className="min-w-0">
                      <h3 className="break-words font-bold">
                        {playerName(player)}
                      </h3>
                      <p className="break-all text-xs text-muted-foreground">
                        {player.user.email}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pokedollars actuales
                  </p>
                  <p
                    className="mb-3 text-2xl font-bold tabular-nums"
                    data-testid={`shop-balance-${player.user.id}`}
                  >
                    {player.wallet
                      ? formatShopMoney(player.wallet.balance)
                      : "…"}{" "}
                    <span className="text-sm font-normal">PD</span>
                  </p>
                  <p role="status" className="mb-3 text-sm">
                    {player.inBattle
                      ? "En batalla · compras bloqueadas"
                      : player.pendingUse
                        ? "Confirmando el uso de un objeto"
                        : player.pendingReset
                          ? "Esperando guardado del reinicio de partida"
                          : player.pending
                            ? "Esperando guardado de una compra"
                            : !player.ready
                              ? "Sincronizando su mochila"
                              : "Disponible para comprar"}
                  </p>
                  <Button
                    type="button"
                    className="mb-3 min-h-11 w-full"
                    variant={
                      selectedId === player.user.id ? "default" : "outline"
                    }
                    aria-pressed={selectedId === player.user.id}
                    disabled={
                      !readyConnection ||
                      !player.ready ||
                      player.inBattle ||
                      player.pending ||
                      !player.wallet ||
                      submitting
                    }
                    onClick={() => {
                      setSelectedId(player.user.id);
                      setLocalError("");
                    }}
                    aria-label={`Seleccionar a ${playerName(player)}`}
                  >
                    {selectedId === player.user.id ? (
                      <>
                        <Check className="mr-2 h-4 w-4" /> Jugador seleccionado
                      </>
                    ) : (
                      "Seleccionar jugador"
                    )}
                  </Button>
                  <label className="block space-y-1 text-xs">
                    <span>Color del jugador</span>
                    <select
                      className="min-h-10 w-full rounded-md border bg-background px-2 text-foreground"
                      aria-label={`Color de ${playerName(player)}`}
                      value={shopPlayerColor(colors, player.user.id)}
                      onChange={(event) =>
                        changeColor(
                          player.user.id,
                          event.target.value as PlayerColorId,
                        )
                      }
                    >
                      {PLAYER_COLORS.map((color) => (
                        <option key={color.id} value={color.id}>
                          {color.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Coins className="h-4 w-4 shrink-0" /> Selecciona al jugador y después
        un objeto. La compra se confirma cuando su mochila guarda el nuevo saldo
        y los objetos.
      </p>
      {!!shop.purchases.length && (
        <section className="mt-6" aria-labelledby="shop-purchases-heading">
          <h2 id="shop-purchases-heading" className="mb-3 text-lg font-bold">
            Últimas compras
          </h2>
          <ul className="space-y-2 text-sm">
            {shop.purchases.slice(0, 8).map((purchase) => (
              <li
                key={purchase.purchaseId}
                className="flex flex-wrap justify-between gap-2 rounded-xl border bg-card p-3"
              >
                <span>
                  {players.find((player) => player.user.id === purchase.userId)
                    ? playerName(
                        players.find(
                          (player) => player.user.id === purchase.userId,
                        )!,
                      )
                    : `Jugador #${purchase.userId}`}{" "}
                  · {purchase.quantity} ×{" "}
                  {SHOP_ITEMS.find((item) => item.id === purchase.itemId)
                    ?.name ?? purchase.itemId}{" "}
                  · {formatShopMoney(purchase.total)} Pokedollars
                </span>
                <strong
                  className={
                    purchase.status === "applied"
                      ? "text-brand"
                      : "text-muted-foreground"
                  }
                >
                  {purchase.status === "applied"
                    ? "Guardado"
                    : "Esperando guardado"}
                </strong>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {transaction?.status === "applied"
                ? "Compra completada"
                : transaction
                  ? "Compra confirmada"
                  : "Confirmar compra"}
            </DialogTitle>
            <DialogDescription>
              {draft
                ? `${playerName(draft.player)} · ${draft.item.name}`
                : "Elige la cantidad que comprará el jugador."}
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <>
              <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
                <img
                  src={draft.item.image}
                  alt=""
                  className="h-12 w-12 object-contain"
                />
                <p>
                  <strong>{draft.item.name}</strong>
                  <span className="block text-sm">
                    {formatShopMoney(draft.item.price)} Pokedollars por unidad
                  </span>
                </p>
              </div>
              {transaction ? (
                <div role="status" className="space-y-2 rounded-xl border p-4">
                  <p className="font-semibold">
                    {transaction.status === "applied"
                      ? "El jugador guardó el saldo y los objetos."
                      : "Esperando guardado en el dispositivo del jugador."}
                  </p>
                  <p>
                    {transaction.quantity} × {draft.item.name} ·{" "}
                    {formatShopMoney(transaction.total)} Pokedollars
                  </p>
                  <p>
                    Saldo resultante:{" "}
                    {formatShopMoney(transaction.balanceAfter)} Pokedollars
                  </p>
                </div>
              ) : (
                <>
                  <label className="space-y-2 text-sm">
                    <span className="block font-medium">Cantidad</span>
                    <Input
                      aria-label="Cantidad de objetos"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={maximum}
                      step={1}
                      value={draft.quantity}
                      disabled={submitting || draft.attempted || maximum === 0}
                      onChange={(event) =>
                        setDraft({ ...draft, quantity: event.target.value })
                      }
                    />
                    <span className="block text-muted-foreground">
                      Máximo disponible con este saldo: {maximum}.
                    </span>
                  </label>
                  <dl className="grid grid-cols-2 gap-2 rounded-xl border p-3 text-sm">
                    <dt>Saldo actual</dt>
                    <dd className="text-right tabular-nums">
                      {formatShopMoney(draft.balance)} PD
                    </dd>
                    <dt>Total a gastar</dt>
                    <dd className="text-right font-bold tabular-nums">
                      {quote ? formatShopMoney(quote.total) : "—"} PD
                    </dd>
                    <dt>Saldo después de comprar</dt>
                    <dd className="text-right tabular-nums">
                      {quote ? formatShopMoney(quote.remaining) : "—"} PD
                    </dd>
                  </dl>
                  {!quote && (
                    <p role="alert" className="text-sm text-destructive">
                      {maximum === 0
                        ? "Pokedollars insuficientes para comprar este objeto."
                        : `Elige una cantidad entera entre 1 y ${maximum}.`}
                    </p>
                  )}
                  {changedQuote && !draft.attempted && (
                    <div role="alert" className="space-y-2 text-sm">
                      <p>
                        El saldo o la conexión del jugador cambió. Revisa la
                        cotización antes de confirmar.
                      </p>
                      <Button
                        variant="outline"
                        disabled={!draftAvailable}
                        onClick={refreshQuote}
                      >
                        Actualizar cotización
                      </Button>
                    </div>
                  )}
                  {!draftAvailable && !draft.attempted && (
                    <p role="status" className="text-sm text-muted-foreground">
                      {draftPlayer?.inBattle
                        ? "El jugador está en batalla y no puede comprar."
                        : "Espera a que el jugador esté conectado y su mochila esté sincronizada."}
                    </p>
                  )}
                  {draft.attempted && (
                    <p role="status" className="text-sm text-muted-foreground">
                      La solicitud ya se envió. Si no llegó la confirmación,
                      reintenta esta misma compra para recuperar su estado.
                    </p>
                  )}
                </>
              )}
              {localError && (
                <p role="alert" className="text-sm text-destructive">
                  {localError}
                </p>
              )}
            </>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={submitting}
              onClick={closeDialog}
            >
              {transaction?.status === "applied"
                ? "Listo"
                : transaction || draft?.attempted
                  ? "Cerrar"
                  : "Cancelar"}
            </Button>
            {!transaction && (
              <Button
                disabled={!canConfirm}
                onClick={() => void confirmPurchase()}
              >
                {submitting
                  ? "Confirmando…"
                  : draft?.attempted
                    ? "Reintentar misma compra"
                    : "Aceptar compra"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
