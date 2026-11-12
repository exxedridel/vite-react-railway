import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Coins, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShopContext } from "@/context/ShopContext";
import { useAppSelector } from "@/store/hooks";

/** Purchases and new-game requests remain recoverable when the Party is locked. */
export default function ShopPartyGate({ children }: { children: ReactNode }) {
  const shop = useShopContext();
  const lock = useAppSelector((state) => state.party.shopLock);
  const resetLock = useAppSelector((state) => state.party.resetLock);
  const [retrying, setRetrying] = useState(false);
  const [localError, setLocalError] = useState("");
  const pendingReset = shop.resets.find((reset) => reset.status === "pending");
  const resetting = !!resetLock || !!pendingReset;
  const otherBrowser = pendingReset && pendingReset.clientId !== shop.clientId;
  if (!lock && !resetting) return <>{children}</>;
  async function retry() {
    if (retrying) return;
    setRetrying(true);
    setLocalError("");
    try {
      await shop.sync();
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
  return (
    <main
      className="mx-auto flex min-h-[70dvh] max-w-2xl flex-col justify-center gap-4 px-4 py-8"
      data-testid={resetting ? "shop-reset-lock" : "shop-party-lock"}
    >
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Coins className="text-brand" />{" "}
        {resetting ? "Reiniciando partida" : "Procesando compra del Poké Mart"}
      </h1>
      <p>
        {resetting
          ? otherBrowser
            ? "Esta cuenta tiene un reinicio pendiente en otro navegador. Vuelve al navegador que lo solicitó para terminarlo."
            : "Tu partida está protegida mientras confirmamos y guardamos el reinicio con 500 Pokedollars y la mochila de objetos vacía."
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
              : "Recuperar compra"}
        </Button>
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
