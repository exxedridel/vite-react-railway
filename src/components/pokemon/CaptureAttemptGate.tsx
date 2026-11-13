import { useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/store/hooks";
import { SHOP_ITEMS } from "@/lib/adminShop";
import { resolveCaptureAttempt } from "@/lib/shop/ballCapture";

/** A paid external roll survives navigation/reloads. The game stays mounted. */
export default function CaptureAttemptGate({
  children,
}: {
  children: ReactNode;
}) {
  const attempt = useAppSelector((state) => state.party.captureAttempt);
  const itemLock = useAppSelector((state) => state.party.itemUseLock);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const ball = SHOP_ITEMS.find((item) => item.id === attempt?.ballId);
  async function resolve(outcome: "caught" | "escaped") {
    if (!attempt || itemLock || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await resolveCaptureAttempt(
        attempt.userId,
        attempt.attemptId,
        outcome,
      );
      toast.success(
        result.outcome === "caught"
          ? `${result.pokemonName} se unió a tu equipo.`
          : `${result.pokemonName} escapó de la pokebola.`,
        {
          description:
            result.outcome === "caught"
              ? "Conserva su nivel, HP, estados principales y PP actuales."
              : "El lanzamiento gastó la acción y se resolvió la respuesta del salvaje.",
        },
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo guardar el resultado. Puedes reintentarlo.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {children}
      {attempt && !itemLock && (
        <Dialog.Root open modal onOpenChange={() => {}}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[110] bg-black/25" />
            <Dialog.Content
              role="alertdialog"
              aria-modal="true"
              data-testid="capture-roll-pending"
              className="fixed left-1/2 top-1/2 z-[111] grid w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border bg-background p-5 text-foreground shadow-xl"
              onEscapeKeyDown={(event) => event.preventDefault()}
              onInteractOutside={(event) => event.preventDefault()}
            >
              <Dialog.Title className="flex items-center gap-2 font-semibold">
                {ball && (
                  <img
                    src={ball.image}
                    alt=""
                    className="h-8 w-8 [image-rendering:pixelated]"
                  />
                )}{" "}
                Resultado de la captura
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                Ya gastaste 1 {ball?.name ?? "pokebola"} en{" "}
                {attempt.pokemonName}. Tira tu D20 físico: necesitas{" "}
                <strong className="text-foreground">
                  {attempt.minimum} o más
                </strong>
                . Marca el resultado de esa tirada.
              </Dialog.Description>
              <p className="text-xs text-muted-foreground">
                La bola ya se gastó y no se devuelve. Si recargas, continuarás
                con este mismo intento.
              </p>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  data-testid="capture-result-escaped"
                  onClick={() => void resolve("escaped")}
                >
                  Escapó
                </Button>
                <Button
                  disabled={busy}
                  data-testid="capture-result-caught"
                  onClick={() => void resolve("caught")}
                >
                  Capturada
                </Button>
              </div>
              {busy && (
                <p role="status" className="text-xs text-muted-foreground">
                  Guardando el resultado…
                </p>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </>
  );
}
