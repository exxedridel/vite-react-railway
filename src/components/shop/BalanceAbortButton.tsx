import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useShopContext } from "@/context/ShopContext";
import { formatShopMoney } from "@/lib/adminShop";
import type { BalanceAdjustment } from "@/lib/shop/types";

export default function BalanceAbortButton({
  receipt,
}: {
  receipt: BalanceAdjustment;
}) {
  const shop = useShopContext();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function abort() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await shop.abortBalance(receipt.adjustmentId);
      toast.success(
        result.status === "cancelled"
          ? "Ajuste cancelado. Se restableció el saldo anterior."
          : "El ajuste ya estaba confirmado; se conservó el saldo.",
      );
      setOpen(false);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo cancelar el ajuste. Reintenta la conexión.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="destructive"
        disabled={!shop.connected || shop.busy || busy}
        data-testid="balance-adjust-abort"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        Abortar ajuste
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abortar ajuste pendiente</DialogTitle>
            <DialogDescription>
              Se cancelará el ajuste pendiente y el saldo volverá a{" "}
              {formatShopMoney(receipt.balanceBefore)} Pokedollars. El equipo y
              los objetos se conservan. Si el ajuste ya fue confirmado, no se
              revertirá.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Volver
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !shop.connected}
              data-testid="balance-abort-confirm"
              onClick={() => void abort()}
            >
              {busy ? "Cancelando…" : "Confirmar cancelación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
