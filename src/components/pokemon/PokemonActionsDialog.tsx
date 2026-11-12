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
import { useAppSelector } from "@/store/hooks";
import { useShopContext } from "@/context/ShopContext";
import { isLocalPartyMutationBlocked } from "@/store/accountStorage";
import { localBattleActive } from "@/lib/shop/wallet";
import type { CapturedPokemon } from "@/types/pokemon";
import PpRestoreControls from "./PpRestoreControls";

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
  const party = useAppSelector((state) => state.party);
  const shop = useShopContext();
  const partySize = party.pokemons.length;
  const stock = party.bag?.items?.["full-restore"] ?? 0;
  const nativeTurn =
    party.emerald && !party.emerald.ended ? party.emerald : null;
  const turnUnavailable =
    !!nativeTurn &&
    (!!nativeTurn.pending.player ||
      nativeTurn.requests.player.waiting ||
      nativeTurn.requests.player.forceSwitch ||
      nativeTurn.requests.player.locked);
  const restoreUnavailable =
    stock < 1 ||
    shop.usingItem ||
    !shop.connected ||
    !shop.synced ||
    isLocalPartyMutationBlocked(party) ||
    turnUnavailable ||
    (localBattleActive(party) &&
      !!(
        party.battleField?.playerItemUsedThisTurn ||
        party.battleField?.playerSwitchedThisTurn
      ));
  const [confirmingRelease, setConfirmingRelease] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const cancelReleaseRef = useRef<HTMLButtonElement>(null);
  const { ready, isError, retry } = usePokemonProgression(
    capturedPokemon.pokemon,
  );
  const { pokemon, captureId } = capturedPokemon;

  useEffect(() => {
    if (!open) setConfirmingRelease(false);
  }, [open]);
  useEffect(() => {
    if (confirmingRelease) cancelReleaseRef.current?.focus();
  }, [confirmingRelease]);

  async function restore() {
    if (!ready || restoring || restoreUnavailable) return;
    setRestoring(true);
    try {
      await shop.useFullRestore(captureId);
      toast.success(`Full Restore confirmado para ${pokemon.name}.`);
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
                disabled={!ready || restoring || restoreUnavailable}
                aria-busy={restoring}
                aria-label={`Usar Full Restore en ${pokemon.name}`}
                onClick={() => void restore()}
              >
                {restoring ? (
                  <Loader2
                    className="h-5 w-5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <img
                    src="/admin-shop/full-restore.png"
                    alt=""
                    className="h-6 w-6 object-contain [image-rendering:pixelated]"
                  />
                )}
                {restoring ? "Aplicando…" : `Full Restore · ${stock}`}
              </Button>
              <p className="text-xs text-muted-foreground">
                Recupera todo el HP, elimina los estados negativos y restablece
                los modificadores de combate a 0.
                {nativeTurn || party.opponent
                  ? " En combate consume tu acción del turno."
                  : " Consume 1 unidad de tu Bag."}
              </p>
              {stock < 1 && (
                <p role="status" className="text-xs text-muted-foreground">
                  No tienes Full Restore en la Bag.
                </p>
              )}
              {stock > 0 && (!shop.connected || !shop.synced) && (
                <p role="status" className="text-xs text-muted-foreground">
                  Conecta y sincroniza tu Bag para usar este objeto.
                </p>
              )}
              {turnUnavailable && (
                <p role="status" className="text-xs text-muted-foreground">
                  Espera una acción libre de tu turno antes de usar el objeto.
                </p>
              )}
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
            <PpRestoreControls
              captureId={captureId}
              disabled={!ready || restoring}
              onUsed={() => onOpenChange(false)}
              onBusyChange={setRestoring}
            />
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
