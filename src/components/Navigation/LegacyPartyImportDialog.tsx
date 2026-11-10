import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { hasLegacyPartyForImport, importLegacyParty } from "@/store/store";

export default function LegacyPartyImportDialog({
  user,
}: {
  user: { id: number; email: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkVersion, setCheckVersion] = useState(0);
  const submitting = useRef(false);
  const currentUserId = useRef(user?.id);
  currentUserId.current = user?.id;

  useEffect(() => {
    let cancelled = false;
    setOpen(false);
    setAvailable(false);
    setError("");
    setBusy(false);
    submitting.current = false;
    if (!user) return;
    void hasLegacyPartyForImport(user.id)
      .then((found) => {
        if (cancelled) return;
        setAvailable(found);
        setOpen(found);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudo revisar la partida anterior. Tus datos se conservan.",
        );
        setOpen(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, checkVersion]);

  async function importParty() {
    if (!user || submitting.current) return;
    const userId = user.id;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await importLegacyParty(userId);
      if (currentUserId.current !== userId) return;
      setOpen(false);
      toast.success("Partida anterior importada a tu cuenta.");
    } catch (reason) {
      if (currentUserId.current !== userId) return;
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo completar la importación. La partida anterior se conserva.",
      );
    } finally {
      if (currentUserId.current === userId) {
        submitting.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <Dialog
      open={!!user && open}
      onOpenChange={(next) => {
        if (!submitting.current) setOpen(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Partida anterior de este navegador</DialogTitle>
          <DialogDescription>
            ¿Te pertenece? Puedes importarla a {user?.email}. La copia anterior
            se conserva y solo una cuenta puede recibirla.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            Ahora no
          </Button>
          {available ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void importParty()}
            >
              {busy ? "Importando…" : `Importar a ${user?.email}`}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={busy}
              onClick={() => setCheckVersion((version) => version + 1)}
            >
              Reintentar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
