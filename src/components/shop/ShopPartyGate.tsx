import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Coins, HeartPulse, Loader2, RefreshCw } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { useShopContext } from "@/context/ShopContext";
import { useAppSelector } from "@/store/hooks";
import BalanceAbortButton from "./BalanceAbortButton";
import CenterCancelButton from "./CenterCancelButton";
import { SHOP_ITEMS } from "@/lib/adminShop";

/** Keep local item use modal so Layout, the arena and its music stay mounted. */
export default function ShopPartyGate({ children }: { children: ReactNode }) {
  const shop = useShopContext();
  const lock = useAppSelector((state) => state.party.shopLock);
  const resetLock = useAppSelector((state) => state.party.resetLock);
  const itemLock = useAppSelector((state) => state.party.itemUseLock);
  const centerLock = useAppSelector((state) => state.party.centerLock);
  const pendingCenter = shop.centerHeals.find(
    (entry) => entry.status === "pending",
  );
  const healing = !!centerLock || !!pendingCenter;
  const centerOperation = pendingCenter ?? centerLock;
  const pendingUse = shop.uses.find((use) => use.status === "pending");
  const usingItem = !!itemLock || !!pendingUse;
  const itemId = itemLock?.itemId ?? pendingUse?.itemId ?? "full-restore";
  const itemName =
    SHOP_ITEMS.find((item) => item.id === itemId)?.name ?? "Full Restore";
  const [retrying, setRetrying] = useState(false);
  const [localError, setLocalError] = useState("");
  const pendingReset = shop.resets.find((reset) => reset.status === "pending");
  const resetting = !!resetLock || !!pendingReset;
  const otherBrowser = pendingReset && pendingReset.clientId !== shop.clientId;
  const pendingAdjustment = shop.adjustments.find(
    (entry) => entry.status === "pending",
  );
  const adjusting =
    lock?.operation === "balance-adjustment" || !!pendingAdjustment;
  const pendingGift = shop.purchases.find(
    (entry) => entry.kind === "gift" && entry.status === "pending",
  );
  const receivingGift = lock?.operation === "gift" || !!pendingGift;
  async function retry() {
    if (retrying) return;
    setRetrying(true);
    setLocalError("");
    try {
      if (healing) await shop.recoverCenter();
      else await shop.sync();
    } catch (error) {
      setLocalError(
        error instanceof Error
          ? error.message
          : "No se pudo recuperar la operación pendiente.",
      );
    } finally {
      setRetrying(false);
    }
  }
  if (
    usingItem ||
    healing ||
    (!lock && !resetting && !adjusting && !receivingGift)
  )
    return (
      <>
        {children}
        {healing && (
          <DialogPrimitive.Root open modal onOpenChange={() => {}}>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/25" />
              <DialogPrimitive.Content
                role="alertdialog"
                aria-modal="true"
                data-testid="center-healing-lock"
                className="fixed left-1/2 top-1/2 z-[101] grid w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 gap-3 rounded-2xl border bg-background p-5 text-foreground shadow-xl"
                onEscapeKeyDown={(event) => event.preventDefault()}
                onPointerDownOutside={(event) => event.preventDefault()}
                onInteractOutside={(event) => event.preventDefault()}
              >
                <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold">
                  <HeartPulse
                    className="h-5 w-5 text-brand"
                    aria-hidden="true"
                  />{" "}
                  Recuperando Pokémon
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-muted-foreground">
                  {centerOperation && centerOperation.clientId !== shop.clientId
                    ? "Vuelve al navegador que recibió la atención de Poké Center para completar su guardado."
                    : !shop.connected
                      ? "Se interrumpió la conexión. Reconecta para guardar la recuperación."
                      : "Poké Center está guardando la salud y los PP de los Pokémon seleccionados. Enseguida podrás continuar."}
                </DialogPrimitive.Description>
                {(localError || shop.error) && (
                  <p role="alert" className="text-sm text-destructive">
                    {localError || shop.error}
                  </p>
                )}
                <Button
                  variant="outline"
                  onClick={() => void retry()}
                  disabled={retrying || !shop.connected}
                >
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                  {retrying ? "Recuperando…" : "Recuperar operación"}
                </Button>
                {centerOperation && (
                  <CenterCancelButton receipt={centerOperation} />
                )}
                {(localError || shop.error || !shop.connected) && (
                  <Link className="text-center text-xs underline" to="/logout">
                    Cerrar sesión
                  </Link>
                )}
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        )}
        {usingItem && (
          <DialogPrimitive.Root open modal onOpenChange={() => {}}>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/25" />
              <DialogPrimitive.Content
                role="alertdialog"
                aria-modal="true"
                data-testid="item-use-lock"
                className="fixed left-1/2 top-1/2 z-[101] grid w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 gap-3 rounded-2xl border bg-background p-5 text-foreground shadow-xl"
                onEscapeKeyDown={(event) => event.preventDefault()}
                onPointerDownOutside={(event) => event.preventDefault()}
                onInteractOutside={(event) => event.preventDefault()}
              >
                <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold">
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-brand"
                    aria-hidden="true"
                  />
                  Confirmando {itemName}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-muted-foreground">
                  {pendingUse && pendingUse.clientId !== shop.clientId
                    ? "Vuelve al navegador que solicitó el objeto para completar su uso."
                    : !shop.connected
                      ? "Se interrumpió la conexión. Reconecta para completar el uso del objeto."
                      : "Guardando el objeto y sus efectos. Enseguida podrás continuar."}
                </DialogPrimitive.Description>
                {(localError || shop.error) && (
                  <p role="alert" className="text-sm text-destructive">
                    {localError || shop.error}
                  </p>
                )}
                <Button
                  variant="outline"
                  onClick={() => void retry()}
                  disabled={retrying || !shop.connected}
                >
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                  {retrying ? "Recuperando…" : `Recuperar ${itemName}`}
                </Button>
                {(localError || shop.error || !shop.connected) && (
                  <Link className="text-center text-xs underline" to="/logout">
                    Cerrar sesión
                  </Link>
                )}
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        )}
      </>
    );
  return (
    <main
      className="mx-auto flex min-h-[70dvh] max-w-2xl flex-col justify-center gap-4 px-4 py-8"
      data-testid={
        resetting
          ? "shop-reset-lock"
          : adjusting
            ? "balance-adjust-lock"
            : receivingGift
              ? "shop-gift-lock"
              : "shop-party-lock"
      }
    >
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Coins className="text-brand" />{" "}
        {resetting
          ? "Reiniciando partida"
          : adjusting
            ? "Actualizando Pokedollars"
            : receivingGift
              ? "Recibiendo regalo"
              : "Procesando compra del Poké Mart"}
      </h1>
      <p>
        {resetting
          ? otherBrowser
            ? "Esta cuenta tiene un reinicio pendiente en otro navegador. Vuelve al navegador que lo solicitó para terminarlo."
            : "Tu partida está protegida mientras confirmamos y guardamos el reinicio con 500 Pokedollars y la mochila de objetos vacía."
          : adjusting
            ? pendingAdjustment && pendingAdjustment.clientId !== shop.clientId
              ? "Vuelve al navegador que recibió el ajuste para completar su guardado."
              : "Guardando el ajuste de Pokedollars del administrador. Tu equipo y tus objetos se conservan."
            : receivingGift
              ? pendingGift && pendingGift.clientId !== shop.clientId
                ? "Vuelve al navegador que recibió el regalo para completar su guardado."
                : "Guardando los objetos regalados por el administrador. Tus Pokedollars y tu equipo se conservan."
              : "Tu partida está protegida mientras guardamos el saldo y los objetos de la compra confirmada por el administrador."}
      </p>
      <p className="text-sm text-muted-foreground">
        Si se interrumpe la conexión, vuelve a conectar este navegador. La
        recuperación conserva la misma solicitud para completar la operación una
        sola vez.
      </p>
      {(localError || shop.error) && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
        >
          {localError || shop.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void retry()} disabled={retrying}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {retrying
            ? "Recuperando…"
            : resetting
              ? "Recuperar reinicio"
              : adjusting
                ? "Recuperar ajuste"
                : receivingGift
                  ? "Recuperar regalo"
                  : "Recuperar compra"}
        </Button>
        {adjusting && pendingAdjustment && (
          <BalanceAbortButton receipt={pendingAdjustment} />
        )}
        <Button asChild variant="outline">
          <Link to="/mensajes-prueba">Mensajes</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/logout">Cerrar sesión</Link>
        </Button>
      </div>
    </main>
  );
}
