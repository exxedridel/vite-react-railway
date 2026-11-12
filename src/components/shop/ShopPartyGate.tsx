import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Coins, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useShopContext } from "@/context/ShopContext";
import { useAppSelector } from "@/store/hooks";

/** A pending purchase must be recoverable even when Bag is closed. */
export default function ShopPartyGate({ children }: { children: ReactNode }) {
  const shop = useShopContext();
  const lock = useAppSelector((state) => state.party.shopLock);
  const [retrying, setRetrying] = useState(false);
  const [localError, setLocalError] = useState("");
  if (!lock) return <>{children}</>;
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
          : "No se pudo recuperar la compra.",
      );
    } finally {
      setRetrying(false);
    }
  }
  return (
    <main
      className="mx-auto flex min-h-[70dvh] max-w-2xl flex-col justify-center gap-4 px-4 py-8"
      data-testid="shop-party-lock"
    >
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Coins className="text-brand" /> Procesando compra del Poké Mart
      </h1>
      <p>
        Tu partida está protegida mientras guardamos el saldo y los objetos de
        la compra confirmada por el administrador.
      </p>
      <p className="text-sm text-muted-foreground">
        Si se interrumpe la conexión, vuelve a conectar este navegador. La
        recuperación conserva la misma transacción y evita cobrar o entregar los
        objetos dos veces.
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
          {retrying ? "Recuperando…" : "Recuperar compra"}
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
