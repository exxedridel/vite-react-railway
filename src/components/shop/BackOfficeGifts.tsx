import { useRef, useState } from "react";
import { Gift, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useShopContext } from "@/context/ShopContext";
import { SHOP_ITEMS, formatShopMoney } from "@/lib/adminShop";
import type { ShopItemId, ShopPlayer, ShopPurchase } from "@/lib/shop/types";

type GiftDraft = {
  player: ShopPlayer;
  itemId: ShopItemId;
  quantity: number;
  requestId: string;
  attempted: boolean;
};
const displayName = (player: ShopPlayer) =>
  `${player.user.first_name} ${player.user.last_name}`.trim() ||
  player.user.email;
const itemName = (id: ShopItemId) =>
  SHOP_ITEMS.find((item) => item.id === id)?.name ?? id;
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo completar el regalo.";

export default function BackOfficeGifts() {
  const shop = useShopContext();
  const [playerId, setPlayerId] = useState("");
  const [itemId, setItemId] = useState<ShopItemId>("poke-ball");
  const [quantityText, setQuantityText] = useState("1");
  const [draft, setDraft] = useState<GiftDraft | null>(null);
  const [receipt, setReceipt] = useState<ShopPurchase | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const submitLock = useRef(false);
  const players = [
    ...new Map(
      shop.players
        .filter((player) => player.online)
        .map((player) => [player.user.id, player]),
    ).values(),
  ];
  const selected = players.find(
    (player) => String(player.user.id) === playerId,
  );
  const ready = shop.connected && shop.synced;
  const available = (player: ShopPlayer) =>
    ready &&
    player.ready &&
    !!player.wallet &&
    player.supportsItemGifts === true &&
    !player.inBattle &&
    !player.pending &&
    !shop.busy;
  const quantity =
    /^\d+$/.test(quantityText) &&
    Number.isSafeInteger(Number(quantityText)) &&
    Number(quantityText) >= 1 &&
    Number(quantityText) <= 99
      ? Number(quantityText)
      : null;
  const stock = selected?.wallet?.items[itemId] ?? 0;
  const after =
    quantity !== null && Number.isSafeInteger(stock + quantity)
      ? stock + quantity
      : null;
  const gifts = shop.purchases.filter((entry) => entry.kind === "gift");
  const pending = gifts.filter((entry) => entry.status === "pending");
  const transaction = draft
    ? (gifts.find(
        (entry) =>
          entry.requestId === draft.requestId &&
          entry.userId === draft.player.user.id &&
          entry.clientId === draft.player.clientId,
      ) ?? receipt)
    : null;
  const current =
    draft &&
    players.find(
      (player) =>
        player.user.id === draft.player.user.id &&
        player.clientId === draft.player.clientId,
    );
  const changed =
    !!draft &&
    (!current?.wallet ||
      current.wallet.revision !== draft.player.wallet?.revision);
  const canConfirm =
    !!draft &&
    !transaction &&
    !submitting &&
    !shop.busy &&
    ready &&
    (draft.attempted || (!changed && !!current && available(current)));

  function open() {
    if (
      !selected?.wallet ||
      !available(selected) ||
      quantity === null ||
      after === null
    )
      return;
    setError("");
    setReceipt(null);
    setDraft({
      player: {
        ...selected,
        wallet: { ...selected.wallet, items: { ...selected.wallet.items } },
      },
      itemId,
      quantity,
      requestId: crypto.randomUUID(),
      attempted: false,
    });
  }
  function close() {
    if (submitLock.current) return;
    setDraft(null);
    setReceipt(null);
    setError("");
  }
  async function confirm() {
    if (!draft || !canConfirm || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setError("");
    const request = { ...draft, attempted: true };
    setDraft(request);
    try {
      const result = await shop.giftItems(
        request.player,
        request.itemId,
        request.quantity,
        request.requestId,
      );
      if (!result)
        throw new Error(
          "No se recibió el resultado. Recupera este mismo regalo.",
        );
      setReceipt(result);
    } catch (reason) {
      setError(errorText(reason));
      await shop.sync().catch(() => {});
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }
  async function sync() {
    if (syncing || shop.busy) return;
    setSyncing(true);
    setError("");
    try {
      await shop.sync();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setSyncing(false);
    }
  }
  const playerLabel = (id: number) =>
    shop.players.find((player) => player.user.id === id)?.user.email ??
    `Jugador #${id}`;
  return (
    <section
      className="space-y-3"
      aria-labelledby="back-office-gifts"
      data-testid="back-office-gifts"
    >
      <h2
        id="back-office-gifts"
        className="flex items-center gap-2 text-xl font-semibold"
      >
        <Gift className="h-5 w-5" /> Regalar objetos
      </h2>
      <p className="text-sm text-muted-foreground">
        Entrega de 1 a 99 unidades de un objeto a un jugador conectado, fuera de
        batalla. Sus Pokedollars y los precios de la tienda se conservan.
      </p>
      <div className="space-y-4 rounded-xl border bg-card p-4 text-card-foreground">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Jugador</span>
            <select
              aria-label="Jugador del regalo"
              data-testid="gift-player"
              value={playerId}
              disabled={shop.busy}
              onChange={(event) => setPlayerId(event.target.value)}
              className="min-h-10 w-full min-w-0 rounded-md border bg-background px-3 text-foreground"
            >
              <option value="">Selecciona un jugador</option>
              {players.map((player) => (
                <option key={player.user.id} value={player.user.id}>
                  {displayName(player)} · {player.user.email}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Objeto</span>
            <select
              aria-label="Objeto del regalo"
              data-testid="gift-item"
              value={itemId}
              disabled={shop.busy}
              onChange={(event) => setItemId(event.target.value as ShopItemId)}
              className="min-h-10 w-full rounded-md border bg-background px-3 text-foreground"
            >
              {SHOP_ITEMS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Cantidad (1–99)</span>
            <Input
              aria-label="Cantidad de objetos a regalar"
              data-testid="gift-quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              step={1}
              value={quantityText}
              disabled={shop.busy}
              onChange={(event) => setQuantityText(event.target.value)}
            />
          </label>
          <div className="flex items-end">
            <Button
              data-testid="gift-open"
              className="w-full"
              onClick={open}
              disabled={
                !selected ||
                !available(selected) ||
                quantity === null ||
                after === null
              }
            >
              <Gift className="mr-2 h-4 w-4" /> Regalar objetos
            </Button>
          </div>
        </div>
        {selected?.wallet && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <p>
              En Bag: <strong data-testid="gift-stock">{stock}</strong>{" "}
              {itemName(itemId)}
            </p>
            {after !== null && (
              <p>
                Después: <strong data-testid="gift-after-stock">{after}</strong>
              </p>
            )}
            <p>
              Pokedollars:{" "}
              <strong data-testid="gift-balance">
                {formatShopMoney(selected.wallet.balance)}
              </strong>{" "}
              PD
            </p>
          </div>
        )}
        <p role="status" className="text-sm text-muted-foreground">
          {!ready
            ? "Conectando y recuperando jugadores…"
            : !players.length
              ? "No hay jugadores conectados."
              : !selected
                ? "Selecciona al jugador que recibirá el regalo."
                : selected.supportsItemGifts !== true
                  ? "Actualiza y recarga el frontend del jugador para recibir regalos."
                  : selected.inBattle
                    ? "En batalla · regalos bloqueados"
                    : selected.pending
                      ? "Esperando guardado de una operación"
                      : !selected.ready
                        ? "Sincronizando"
                        : "Disponible para recibir regalos"}
        </p>
        {quantityText !== "" && quantity === null && (
          <p className="text-sm text-destructive">
            Introduce una cantidad entera entre 1 y 99.
          </p>
        )}
        {quantity !== null && after === null && (
          <p className="text-sm text-destructive">
            La cantidad supera el límite del inventario.
          </p>
        )}
      </div>
      {pending.length > 0 && (
        <div
          className="space-y-2 rounded-xl border p-3"
          data-testid="pending-gifts"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Regalos pendientes de guardar</h3>
            <Button
              variant="outline"
              disabled={syncing || shop.busy || !shop.connected}
              onClick={() => void sync()}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Actualizar regalos
            </Button>
          </div>
          {pending.map((entry) => (
            <p
              key={entry.purchaseId}
              data-purchase-id={entry.purchaseId}
              className="break-words text-sm"
            >
              {playerLabel(entry.userId)} · {entry.quantity} ×{" "}
              {itemName(entry.itemId)} · Esperando guardado
            </p>
          ))}
        </div>
      )}
      {gifts.some((entry) => entry.status !== "pending") && (
        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Últimos regalos
          </summary>
          <ul className="mt-2 space-y-2 text-sm">
            {gifts
              .filter((entry) => entry.status !== "pending")
              .slice(0, 8)
              .map((entry) => (
                <li key={entry.purchaseId}>
                  {playerLabel(entry.userId)} · {entry.quantity} ×{" "}
                  {itemName(entry.itemId)} ·{" "}
                  {entry.status === "applied" ? "Guardado" : "No entregado"}
                </li>
              ))}
          </ul>
        </details>
      )}
      {error && !draft && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Dialog
        open={!!draft}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar regalo de objetos</DialogTitle>
            <DialogDescription>
              {draft
                ? `${displayName(draft.player)} · ${draft.player.user.email}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <>
              <p className="text-lg font-semibold">
                {draft.quantity} × {itemName(draft.itemId)}
              </p>
              <p className="text-sm text-muted-foreground">
                Regalo gratuito. El saldo del jugador y los precios de la tienda
                se conservan.
              </p>
              {transaction ? (
                <p role="status" data-testid="gift-result">
                  {transaction.status === "applied"
                    ? "El jugador guardó el regalo."
                    : transaction.status === "cancelled"
                      ? "Regalo no entregado. No se agregaron objetos."
                      : "Esperando guardado en el dispositivo del jugador."}
                </p>
              ) : (
                <>
                  <p className="text-sm">
                    Bag: {draft.player.wallet?.items[draft.itemId] ?? 0} →{" "}
                    {(draft.player.wallet?.items[draft.itemId] ?? 0) +
                      draft.quantity}
                  </p>
                  {changed && !draft.attempted && (
                    <p role="alert" className="text-sm">
                      El inventario o la conexión cambió. Cancela y revisa el
                      regalo.
                    </p>
                  )}
                  {draft.attempted && (
                    <p className="text-sm text-muted-foreground">
                      Reintenta esta misma solicitud para recuperar su resultado
                      sin entregar objetos dos veces.
                    </p>
                  )}
                </>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={submitting}>
              {transaction || draft?.attempted ? "Listo" : "Cancelar"}
            </Button>
            {!transaction && (
              <Button
                data-testid="gift-confirm"
                disabled={!canConfirm}
                onClick={() => void confirm()}
              >
                {submitting
                  ? "Confirmando…"
                  : draft?.attempted
                    ? "Recuperar regalo"
                    : "Confirmar regalo"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
