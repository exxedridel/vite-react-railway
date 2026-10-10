import { useState, type FormEvent } from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  currentHp: number;
  maxHp: number | undefined;
  onChangeHp: (amount: number) => void;
};

const DAMAGE_FRACTIONS = [
  { label: "1/16", divisor: 16 },
  { label: "1/8", divisor: 8 },
  { label: "1/4", divisor: 4 },
  { label: "1/2", divisor: 2 },
];

export default function PokemonHpControls({
  currentHp,
  maxHp,
  onChangeHp,
}: Props) {
  const [damageDialogOpen, setDamageDialogOpen] = useState(false);
  const [damageInput, setDamageInput] = useState("");

  const canEdit = maxHp !== undefined && maxHp > 0;
  const canReceiveDamage = canEdit && currentHp > 0;

  const normalizedDamage = damageInput.trim();
  const damage = Number(normalizedDamage);

  const validDamage =
    /^\d+$/.test(normalizedDamage) &&
    Number.isSafeInteger(damage) &&
    damage > 0;

  const remainingHp = validDamage
    ? Math.max(0, currentHp - damage)
    : currentHp;

  const handleDialogChange = (open: boolean) => {
    setDamageDialogOpen(open);
    setDamageInput("");
  };

  const handleApplyDamage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canReceiveDamage || !validDamage) return;

    onChangeHp(-damage);
    handleDialogChange(false);
  };

  return (
    <>
      <div className="space-y-3">
        {/* Daño proporcional: cerrado inicialmente */}
        <Accordion type="single" collapsible>
          <AccordionItem
            value="fractional-damage"
            className="border-b-0"
          >
            <AccordionTrigger className="gap-2 py-2 text-left text-xs font-medium text-muted-foreground hover:no-underline">
              Restar una fracción del HP máximo
            </AccordionTrigger>

            <AccordionContent className="pb-1 pt-2">
              <div className="grid grid-cols-4 gap-2">
                {DAMAGE_FRACTIONS.map(({ label, divisor }) => {
                  const amount = canEdit
                    ? Math.max(1, Math.floor((maxHp ?? 0) / divisor))
                    : 0;

                  return (
                    <Button
                      key={divisor}
                      type="button"
                      variant="outline"
                      disabled={!canReceiveDamage}
                      onClick={() => onChangeHp(-amount)}
                      aria-label={`Restar ${label} del HP máximo: ${amount} HP`}
                      className="
                        h-16 min-w-0 flex-col gap-1 rounded-xl
                        border-brand/40 bg-brand/10 px-1
                        hover:bg-brand/20
                      "
                    >
                      <span className="text-base font-bold">
                        −{label}
                      </span>

                      <span className="text-[11px] font-normal text-muted-foreground">
                        {canEdit ? `−${amount} HP` : "…"}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Contador y ajustes de un punto */}
        <div className="flex items-center justify-center gap-4">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            disabled={!canReceiveDamage}
            onClick={() => onChangeHp(-1)}
            aria-label="Restar 1 HP"
            title="Restar 1 HP"
          >
            <Minus className="h-4 w-4" />
          </Button>

          <button
            type="button"
            onClick={() => handleDialogChange(true)}
            disabled={!canReceiveDamage}
            aria-label={`HP actual: ${currentHp}. Introducir daño recibido`}
            aria-haspopup="dialog"
            className="
              min-w-[112px] rounded-xl px-4 py-2 text-center
              transition-colors hover:bg-muted
              focus-visible:outline-none
              focus-visible:ring-2 focus-visible:ring-ring
              disabled:cursor-default
            "
          >
            <span
              className="block text-4xl font-bold tabular-nums"
              aria-live="polite"
              aria-atomic="true"
            >
              {currentHp}
            </span>

            <span className="mt-1 block text-[11px] text-muted-foreground">
              {currentHp === 0 ? "Sin HP" : "Toca para restar daño"}
            </span>
          </button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            disabled={!canEdit || currentHp >= (maxHp ?? 0)}
            onClick={() => onChangeHp(1)}
            aria-label="Sumar 1 HP"
            title="Sumar 1 HP"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog
        open={damageDialogOpen}
        onOpenChange={handleDialogChange}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Daño recibido</DialogTitle>

            <DialogDescription>
              Escribe cuántos puntos de HP debes restar por el ataque
              del rival.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleApplyDamage} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="received-damage"
                className="text-sm font-medium"
              >
                Puntos de daño
              </label>

              <Input
                id="received-damage"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder="Ej. 23"
                value={damageInput}
                onChange={(event) => setDamageInput(event.target.value)}
                aria-invalid={normalizedDamage !== "" && !validDamage}
                aria-describedby="received-damage-help"
                className="h-14 text-center text-2xl font-bold tabular-nums"
              />

              <p
                id="received-damage-help"
                className={`text-xs ${
                  normalizedDamage !== "" && !validDamage
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                Introduce un número entero mayor que cero.
              </p>
            </div>

            <div
              className="flex items-center justify-between gap-3 rounded-xl border bg-muted/50 p-3"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="text-sm text-muted-foreground">
                HP restante
              </span>

              <span className="text-lg font-bold tabular-nums">
                {currentHp}
                <span className="mx-2 text-muted-foreground">→</span>
                {remainingHp}
              </span>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogChange(false)}
              >
                Cancelar
              </Button>

              <Button
                type="submit"
                variant="destructive"
                disabled={!canReceiveDamage || !validDamage}
              >
                Aplicar daño
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}