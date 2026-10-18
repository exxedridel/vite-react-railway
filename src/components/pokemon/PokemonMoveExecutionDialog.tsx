import ManualMoveExecutionDialog from "./ManualMoveExecutionDialog";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { submitEmeraldAction } from "@/lib/emerald/commands";
import { getWildMove } from "@/lib/emerald/moveInfo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
export { default as BattleResultView } from "./BattleResultView";
function WildMoveExecutionDialog({
  captureId,
  moveId,
  actorSide = "player",
  onClose,
}: {
  captureId: string;
  moveId: number;
  actorSide?: "player" | "opponent";
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const party = useAppSelector((s) => s.party);
  const [busy, setBusy] = useState(false);
  const capture = party.pokemons.find((p) => p.captureId === captureId);
  const raw = (
    actorSide === "player" ? capture?.moves : party.opponent?.moves
  )?.find((m) => m.id === moveId);
  const move = raw ? getWildMove(raw) : undefined;
  const runtime = party.emerald;
  const option = runtime?.requests[actorSide].moves.find(
    (m) => m.id === moveId,
  );
  const unavailable =
    runtime?.pending[actorSide] ||
    runtime?.ended ||
    (runtime && (!option || option.disabled));
  async function confirm() {
    setBusy(true);
    try {
      await dispatch(
        submitEmeraldAction(captureId, actorSide, { kind: "move", moveId }),
      );
      onClose();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "No se pudo ejecutar el movimiento.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {move?.displayName ?? option?.name ?? "Movimiento"}
          </DialogTitle>
          <DialogDescription>
            La acción se resuelve cuando ambos lados hayan elegido. La prioridad
            y la velocidad determinan quién actúa primero.
          </DialogDescription>
        </DialogHeader>
        {move && (
          <p className="text-sm text-muted-foreground">{move.description}</p>
        )}
        {option && (
          <p className="text-sm">
            PP: {option.pp}/{option.maxpp}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Acierto, estados, daño, curación y efectos de fin de turno se aplican
          automáticamente. Los movimientos de carga consumen su primer turno
          antes de atacar.
        </p>
        {unavailable && (
          <p role="alert" className="text-sm text-destructive">
            Ya elegiste una acción, terminó el combate o el movimiento no está
            disponible. Consulta el panel del turno.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={busy || !!unavailable || !party.opponent}
            onClick={() => void confirm()}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Elegir
            movimiento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PokemonMoveExecutionDialog(props: {
  captureId: string;
  moveId: number;
  actorSide?: "player" | "opponent";
  onClose: () => void;
}) {
  const wild = useAppSelector((s) => s.party.opponent?.kind === "wild");
  return wild ? (
    <WildMoveExecutionDialog {...props} />
  ) : (
    <ManualMoveExecutionDialog {...props} />
  );
}
