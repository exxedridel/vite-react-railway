import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { store } from "@/store/store";
import { adjustBattleTurn, finishBattleTurn } from "@/slices/partySlice";
import { getBattleField } from "@/lib/battleField";
import { battleContextKey } from "@/lib/battleEngine";
import { getCurrentHp } from "@/lib/pokemonStats";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function ManualBattleFieldControl({
  captureId,
}: {
  captureId: string;
}) {
  const dispatch = useAppDispatch();
  const party = useAppSelector((s) => s.party);
  const field = getBattleField(party.battleField);
  const capture = party.pokemons.find((p) => p.captureId === captureId);
  const opponent = party.opponent;
  const [open, setOpen] = useState(false);
  if (!capture) return null;
  const canEdit =
    !!opponent &&
    (!field.activeCaptureId || field.activeCaptureId === captureId);
  const canFinish = canEdit && getCurrentHp(opponent!.pokemon) > 0;
  function correct(amount: number) {
    if (!opponent || !canEdit) return;
    dispatch(
      adjustBattleTurn({
        captureId,
        expectedContext: battleContextKey(capture!, opponent, field),
        amount,
      }),
    );
    if (
      getBattleField(store.getState().party.battleField).turn !==
      field.turn + amount
    )
      toast.error("El combate cambió. Revisa el turno e intenta nuevamente.");
  }
  function finish() {
    if (!opponent || !canFinish) return;
    dispatch(
      finishBattleTurn({
        captureId,
        expectedTurn: field.turn,
        expectedContext: battleContextKey(capture!, opponent, field),
      }),
    );
    if (
      getBattleField(store.getState().party.battleField).turn !==
      field.turn + 1
    ) {
      toast.error("El combate cambió. Revisa el turno e intenta nuevamente.");
      return;
    }
    setOpen(false);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canEdit}
          className="bg-background/90 px-2 text-xs tabular-nums"
          aria-label={`Turno ${field.turn}: finalizar o corregir contador`}
        >
          Turno {field.turn}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Turno {field.turn}</DialogTitle>
          <DialogDescription>
            Corrige el contador si no coincide con el de tu rival, o finaliza el
            turno cuando ambos hayan terminado de actuar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
          <p className="text-center text-sm font-medium">
            Corregir número de turno
          </p>
          <div className="flex items-center justify-center gap-5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!canEdit || field.turn <= 1}
              onClick={() => correct(-1)}
              aria-label="Restar un turno al contador"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <output
              aria-live="polite"
              className="min-w-12 text-center text-3xl font-bold tabular-nums"
            >
              {field.turn}
            </output>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!canEdit || !Number.isSafeInteger(field.turn + 1)}
              onClick={() => correct(1)}
              aria-label="Sumar un turno al contador"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Los botones −/+ solo corrigen el número. No aplican ni revierten HP,
            duración del clima, estados o la acción consumida por cambiar
            Pokémon. La corrección queda en el historial.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Finalizar turno aplica los efectos de fin de turno, reduce los
          contadores y avanza al siguiente turno.
        </p>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cerrar
          </Button>
          <Button type="button" disabled={!canFinish} onClick={finish}>
            Finalizar turno {field.turn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
