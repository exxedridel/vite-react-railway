import type { RefObject } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { History, X } from "lucide-react";
import { useAppSelector } from "@/store/hooks";
import { formatActivityDate } from "@/lib/activityTime";
import { BattleResultView } from "@/components/pokemon/PokemonMoveExecutionDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
};

export default function PokemonActivityDialog({
  open,
  onOpenChange,
  returnFocusRef,
}: Props) {
  const history = useAppSelector((state) => state.party.activityHistory);
  const entries = history ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[2147483001] bg-black/70" />
        <DialogPrimitive.Content
          data-activity-history="true"
          className="fixed left-1/2 top-1/2 z-[2147483002] flex w-[calc(100vw-2rem)] max-w-[560px] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-hidden rounded-lg border bg-background p-6 text-foreground shadow-lg"
          onCloseAutoFocus={(event) => {
            if (returnFocusRef?.current) {
              event.preventDefault();
              returnFocusRef.current.focus();
            }
          }}
        >
          <DialogPrimitive.Close
            className="absolute right-3 top-3 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Cerrar historial"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
          <DialogHeader className="shrink-0 pr-6">
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-brand" /> Historial de actividad
            </DialogTitle>
            <DialogDescription>
              Últimas {entries.length} de 20 acciones · Más recientes primero.
              <span className="block">
                Fecha y hora local de León, Guanajuato.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
            {entries.length ? (
              <ol className="space-y-3">
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="min-w-0 space-y-2 rounded-xl border bg-card p-3 text-card-foreground"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        Acción #{entry.sequence}
                      </span>
                      <time
                        dateTime={entry.occurredAt}
                        className="tabular-nums"
                      >
                        {formatActivityDate(entry.occurredAt)}
                      </time>
                    </div>
                    <h3 className="break-words text-sm font-semibold">
                      {entry.title}
                    </h3>
                    {entry.details.length > 0 && (
                      <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                        {entry.details.map((detail, index) => (
                          <li key={index} className="break-words">
                            {detail}
                          </li>
                        ))}
                      </ul>
                    )}
                    {entry.captureId && (
                      <p className="break-all text-[10px] text-muted-foreground">
                        Captura: {entry.captureId}
                      </p>
                    )}
                    {entry.battle && (
                      <details className="rounded-lg border p-2">
                        <summary className="cursor-pointer text-xs font-medium">
                          Ver resultado y cálculo del movimiento
                        </summary>
                        <div className="mt-3">
                          <BattleResultView result={entry.battle} />
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Todavía no hay acciones registradas. El historial comienza con
                tus próximos cambios en la partida.
              </p>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
