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

type AdjustmentMode = "damage" | "heal";

const HP_FRACTIONS = [
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
  const [dialogMode, setDialogMode] =
    useState<AdjustmentMode | null>(null);

  const [amountInput, setAmountInput] = useState("");

  const canEdit =
    maxHp !== undefined &&
    Number.isSafeInteger(maxHp) &&
    maxHp > 0;

  const canReceiveDamage = canEdit && currentHp > 0;
  const canHeal = canEdit && currentHp < (maxHp ?? 0);

  const isHealing = dialogMode === "heal";
  const normalizedAmount = amountInput.trim();
  const amount = Number(normalizedAmount);

  const validAmount =
    /^\d+$/.test(normalizedAmount) &&
    Number.isSafeInteger(amount) &&
    amount > 0;

  const canApply =
    dialogMode !== null &&
    validAmount &&
    (isHealing ? canHeal : canReceiveDamage);

  const resultingHp = validAmount
    ? isHealing
      ? Math.min(maxHp ?? currentHp, currentHp + amount)
      : Math.max(0, currentHp - amount)
    : currentHp;

  const openAdjustment = (mode: AdjustmentMode) => {
    setAmountInput("");
    setDialogMode(mode);
  };

  const closeAdjustment = () => {
    setDialogMode(null);
    setAmountInput("");
  };

  const handleApply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canApply) return;

    onChangeHp(isHealing ? amount : -amount);
    closeAdjustment();
  };

  const applyFraction = (
    divisor: number,
    mode: AdjustmentMode,
  ) => {
    if (!canEdit || maxHp === undefined) return;
    if (mode === "damage" && !canReceiveDamage) return;
    if (mode === "heal" && !canHeal) return;

    const points = Math.max(1, Math.floor(maxHp / divisor));

    onChangeHp(mode === "heal" ? points : -points);
  };

  const removeAllHp = () => {
    if (!canReceiveDamage || maxHp === undefined) return;

    // El reducer limita el resultado a cero.
    onChangeHp(-maxHp);
  };

  const restoreAllHp = () => {
    if (!canHeal || maxHp === undefined) return;

    // El reducer limita el resultado al HP máximo.
    onChangeHp(maxHp);
  };

  return (
    <>
      <div className="space-y-3">
        <Accordion type="single" collapsible>
          <AccordionItem
            value="proportional-hp"
            className="border-b-0"
          >
            <AccordionTrigger className="gap-2 py-2 text-left text-xs font-medium text-muted-foreground hover:no-underline">
              Daño y curación proporcional
            </AccordionTrigger>

            <AccordionContent className="space-y-4 pb-1 pt-2">
              <p className="text-[11px] text-muted-foreground">
                Las fracciones se calculan sobre el HP máximo.
              </p>

              {/* Restar HP */}
              <div className="space-y-2">
                <p className="flex items-center gap-1 text-xs font-semibold">
                  <Minus className="h-3.5 w-3.5" />
                  Restar HP
                </p>

                <div className="grid grid-cols-5 gap-1">
                  {HP_FRACTIONS.map(({ label, divisor }) => {
                    const points = canEdit
                      ? Math.max(
                          1,
                          Math.floor((maxHp ?? 0) / divisor),
                        )
                      : 0;

                    return (
                      <Button
                        key={`damage-${divisor}`}
                        type="button"
                        variant="outline"
                        disabled={!canReceiveDamage}
                        onClick={() =>
                          applyFraction(divisor, "damage")
                        }
                        aria-label={`Restar ${label} del HP máximo: ${points} HP`}
                        className="
                          h-14 min-w-0 flex-col gap-1 rounded-lg
                          border-destructive/30 bg-destructive/5 px-0
                          hover:bg-destructive/15
                        "
                      >
                        <span className="text-xs font-bold">
                          −{label}
                        </span>

                        <span className="text-[10px] font-normal text-muted-foreground">
                          {canEdit ? `−${points}` : "…"}
                        </span>
                      </Button>
                    );
                  })}

                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canReceiveDamage}
                    onClick={removeAllHp}
                    aria-label="Quitar todos los HP"
                    className="
                      h-14 min-w-0 flex-col gap-1 rounded-lg
                      border-destructive/40 bg-destructive/10 px-0
                      hover:bg-destructive/20
                    "
                  >
                    <span className="text-xs font-bold">Todo</span>

                    <span className="text-[10px] font-normal text-muted-foreground">
                      0 HP
                    </span>
                  </Button>
                </div>
              </div>

              {/* Recuperar HP */}
              <div className="space-y-2">
                <p className="flex items-center gap-1 text-xs font-semibold">
                  <Plus className="h-3.5 w-3.5" />
                  Recuperar HP
                </p>

                <div className="grid grid-cols-5 gap-1">
                  {HP_FRACTIONS.map(({ label, divisor }) => {
                    const points = canEdit
                      ? Math.max(
                          1,
                          Math.floor((maxHp ?? 0) / divisor),
                        )
                      : 0;

                    return (
                      <Button
                        key={`heal-${divisor}`}
                        type="button"
                        variant="outline"
                        disabled={!canHeal}
                        onClick={() =>
                          applyFraction(divisor, "heal")
                        }
                        aria-label={`Recuperar ${label} del HP máximo: ${points} HP`}
                        className="
                          h-14 min-w-0 flex-col gap-1 rounded-lg
                          border-brand/30 bg-brand/5 px-0
                          hover:bg-brand/15
                        "
                      >
                        <span className="text-xs font-bold">
                          +{label}
                        </span>

                        <span className="text-[10px] font-normal text-muted-foreground">
                          {canEdit ? `+${points}` : "…"}
                        </span>
                      </Button>
                    );
                  })}

                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canHeal}
                    onClick={restoreAllHp}
                    aria-label="Recuperar todos los HP"
                    className="
                      h-14 min-w-0 flex-col gap-1 rounded-lg
                      border-brand/40 bg-brand/10 px-0
                      hover:bg-brand/20
                    "
                  >
                    <span className="text-xs font-bold">Todo</span>

                    <span className="text-[10px] font-normal text-muted-foreground">
                      100%
                    </span>
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Contador informativo y apertura de diálogos */}
        <div className="flex items-center justify-center gap-4">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full"
            disabled={!canReceiveDamage}
            onClick={() => openAdjustment("damage")}
            aria-label="Introducir daño recibido"
            aria-haspopup="dialog"
            title="Restar HP"
          >
            <Minus className="h-4 w-4" />
          </Button>

          <div className="min-w-[112px] px-4 py-2 text-center">
            <span
              className="block text-4xl font-bold tabular-nums"
              aria-live="polite"
              aria-atomic="true"
            >
              {currentHp}
            </span>

            <span className="mt-1 block text-[11px] text-muted-foreground">
              {currentHp === 0 ? "Debilitado" : "HP actuales"}
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full"
            disabled={!canHeal}
            onClick={() => openAdjustment("heal")}
            aria-label="Introducir HP a recuperar"
            aria-haspopup="dialog"
            title="Recuperar HP"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Un diálogo compartido, con contenido según la operación */}
      <Dialog
        open={dialogMode !== null}
        onOpenChange={(open) => {
          if (!open) closeAdjustment();
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>
              {isHealing ? "Recuperar HP" : "Daño recibido"}
            </DialogTitle>

            <DialogDescription>
              {isHealing
                ? "Escribe cuántos puntos de HP quieres recuperar."
                : "Escribe cuántos puntos de HP debes restar por el ataque del rival."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleApply} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="hp-adjustment"
                className="text-sm font-medium"
              >
                {isHealing ? "Puntos a recuperar" : "Puntos de daño"}
              </label>

              <Input
                id="hp-adjustment"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder="Ej. 23"
                value={amountInput}
                onChange={(event) =>
                  setAmountInput(event.target.value)
                }
                aria-invalid={
                  normalizedAmount !== "" && !validAmount
                }
                aria-describedby="hp-adjustment-help"
                className="h-14 text-center text-2xl font-bold tabular-nums"
              />

              <p
                id="hp-adjustment-help"
                className={`text-xs ${
                  normalizedAmount !== "" && !validAmount
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
                HP resultante
              </span>

              <span className="text-lg font-bold tabular-nums">
                {currentHp}
                <span className="mx-2 text-muted-foreground">
                  →
                </span>
                {resultingHp}
              </span>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeAdjustment}
              >
                Cancelar
              </Button>

              <Button
                type="submit"
                variant={isHealing ? "default" : "destructive"}
                disabled={!canApply}
              >
                {isHealing ? "Recuperar HP" : "Aplicar daño"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}