import { useEffect, useRef, useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { usePokemonProgression } from "@/hooks/usePokemonProgression";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fullRestorePokemon } from "@/slices/partySlice";
import type { CapturedPokemon } from "@/types/pokemon";

type Props = {
  capturedPokemon: CapturedPokemon;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRelease: (pokemon: CapturedPokemon) => void;
};

export default function PokemonActionsDialog({
  capturedPokemon,
  open,
  onOpenChange,
  onRelease,
}: Props) {
  const dispatch = useAppDispatch();
  const partySize = useAppSelector((state) => state.party.pokemons.length);
  const [confirmingRelease, setConfirmingRelease] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const cancelReleaseRef = useRef<HTMLButtonElement>(null);
  const { ready, isError, retry } = usePokemonProgression(capturedPokemon.pokemon);
  const { pokemon, captureId } = capturedPokemon;

  useEffect(() => {
    if (!open) setConfirmingRelease(false);
  }, [open]);
  useEffect(() => {
    if (confirmingRelease) cancelReleaseRef.current?.focus();
  }, [confirmingRelease]);

  async function restore() {
    if (!ready || restoring) return;
    setRestoring(true);
    try {
      await dispatch(fullRestorePokemon(captureId));
      toast.success(`Full restore aplicado a ${pokemon.name}.`);
      onOpenChange(false);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo aplicar Full restore.",
      );
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!restoring) onOpenChange(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full min-w-0 px-1 sm:px-3"
          aria-label={`Acciones de ${pokemon.name}`}
        >
          Acciones
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {confirmingRelease ? "Liberar a " : "Acciones de "}
            <span className="capitalize">{pokemon.name}</span>
          </DialogTitle>
          <DialogDescription>
            {confirmingRelease
              ? "Se perderán sus estadísticas y movimientos guardados. Esta acción no permite elegir otro inicial."
              : "Aplica un objeto o administra este Pokémon de tu equipo."}
          </DialogDescription>
        </DialogHeader>
        {confirmingRelease ? (
          <>
            <p className="text-sm">
              ¿Quieres liberar a{" "}
              <span className="font-semibold capitalize">{pokemon.name}</span>?
            </p>
            <DialogFooter className="gap-2">
              <Button
                ref={cancelReleaseRef}
                type="button"
                variant="outline"
                onClick={() => setConfirmingRelease(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={partySize <= 1}
                onClick={() => onRelease(capturedPokemon)}
              >
                Liberar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl border p-3">
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                disabled={!ready || restoring}
                aria-busy={restoring}
                onClick={() => void restore()}
              >
                {restoring ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <img
                    src="/admin-shop/full-restore.png"
                    alt=""
                    className="h-6 w-6 object-contain [image-rendering:pixelated]"
                  />
                )}
                {restoring ? "Aplicando…" : "Full restore"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Recupera todo el HP, elimina los estados negativos y restablece
                los modificadores de combate a 0.
              </p>
              {!ready && (
                <p role="status" className="text-xs text-muted-foreground">
                  {isError
                    ? "No se pudieron cargar las estadísticas."
                    : "Preparando estadísticas…"}
                </p>
              )}
              {isError && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={retry}
                >
                  Reintentar
                </Button>
              )}
            </div>
            <div className="space-y-2 rounded-xl border p-3">
              <Button
                type="button"
                variant="destructive"
                className="w-full gap-2"
                disabled={partySize <= 1 || restoring}
                onClick={() => setConfirmingRelease(true)}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Liberar Pokémon
              </Button>
              <p className="text-xs text-muted-foreground">
                {partySize <= 1
                  ? "No puedes liberar al último Pokémon de tu equipo."
                  : "Retira este Pokémon de tu equipo. Requiere confirmación."}
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
