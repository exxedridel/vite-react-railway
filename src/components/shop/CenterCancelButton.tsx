import { useRef, useState } from "react";
import { toast } from "sonner";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useShopContext } from "@/context/ShopContext";
import type { CenterHeal } from "@/lib/shop/types";

export default function CenterCancelButton({
  receipt,
}: {
  receipt: Pick<CenterHeal, "requestId" | "userId" | "clientId">;
}) {
  const shop = useShopContext();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  async function cancel() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await shop.cancelCenter(receipt);
      toast.success(
        result.status === "applied"
          ? "La recuperación ya estaba guardada."
          : "Operación cerrada. Puedes continuar jugando.",
      );
      setOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo cerrar la operación.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        disabled={!shop.connected || shop.busy || busy}
        data-testid="center-cancel"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        Cancelar recuperación
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[120] bg-black/40" />
          <DialogPrimitive.Content
            className="fixed left-1/2 top-1/2 z-[121] grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-background p-6 text-foreground shadow-xl"
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>Cerrar recuperación pendiente</DialogTitle>
              <DialogDescription>
                Se cerrará esta operación de Poké Center. Si la recuperación ya
                se guardó, los Pokémon conservarán su salud. Tu equipo, objetos
                y Pokedollars se conservan.
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
                disabled={busy || !shop.connected}
                data-testid="center-cancel-confirm"
                onClick={() => void cancel()}
              >
                {busy ? "Cerrando…" : "Confirmar cancelación"}
              </Button>
            </DialogFooter>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Dialog>
    </>
  );
}
