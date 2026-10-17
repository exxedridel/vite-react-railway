import { useEffect, useRef, useState, type FormEvent } from "react";
import { Backpack, Check, Coins, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { store } from "@/store/store";
import { changeBagMoney, toggleGymBadge } from "@/slices/partySlice";
import {
  KANTO_BADGES,
  formatBagMoney,
  moneyAfterChange,
  parseMoneyAmount,
  type MoneyDirection,
} from "@/lib/trainerBag";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export default function PokemonBagDialog({ open, onOpenChange }: Props) {
  const dispatch = useAppDispatch();
  const bag = useAppSelector((state) => state.party.bag);
  const balance = bag?.money ?? 0;
  const badges = bag?.badges ?? [];
  const [direction, setDirection] = useState<MoneyDirection | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);
  const amount = parseMoneyAmount(draft);
  const nextBalance =
    direction && amount !== null
      ? moneyAfterChange(balance, amount, direction)
      : null;
  const insufficient =
    direction === "subtract" && amount !== null && amount > balance;

  useEffect(() => {
    if (!open) {
      setDirection(null);
      setDraft("");
    }
  }, [open]);
  useEffect(() => {
    if (direction) inputRef.current?.focus();
  }, [direction]);

  function chooseDirection(value: MoneyDirection) {
    submitted.current = false;
    setDraft("");
    setDirection(value);
    inputRef.current?.focus();
  }

  function confirmMoney(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!direction || submitted.current) return;
    const value = parseMoneyAmount(draft);
    if (value === null) {
      toast.error("Ingresa una cantidad entera mayor que cero.");
      return;
    }
    const current = store.getState().party.bag?.money ?? 0;
    const next = moneyAfterChange(current, value, direction);
    if (next === null) {
      toast.error(
        direction === "subtract" && value > current
          ? "No tienes suficiente dinero."
          : "La cantidad excede el límite permitido.",
      );
      return;
    }
    submitted.current = true;
    dispatch(changeBagMoney({ amount: value, direction }));
    toast.success(
      `${direction === "add" ? "Agregaste" : "Restaste"} $${formatBagMoney(value)}.`,
    );
    setDirection(null);
    setDraft("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          aria-label="Abrir Bag"
        >
          <Backpack className="h-4 w-4 text-brand" aria-hidden="true" />
          Bag
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] flex-col overflow-hidden p-4 sm:max-w-[480px] sm:p-6">
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle className="flex items-center gap-2">
            <Backpack className="h-5 w-5 text-brand" aria-hidden="true" /> Bag
          </DialogTitle>
          <DialogDescription>
            Medallas y dinero de tu entrenador.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-1 pb-1">
          <section aria-labelledby="bag-badges-heading" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 id="bag-badges-heading" className="text-sm font-semibold">
                Kanto badges
              </h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {badges.length}/8
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {KANTO_BADGES.map((badge) => {
                const earned = badges.includes(badge.id);
                return (
                  <button
                    key={badge.id}
                    type="button"
                    aria-pressed={earned}
                    aria-label={`${badge.name} · ${badge.leader} · ${earned ? "Obtenida; presiona para retirarla" : "Sin obtener; presiona para agregarla"}`}
                    title={`${badge.name} · ${badge.leader}`}
                    onClick={() => dispatch(toggleGymBadge(badge.id))}
                    className={`relative flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-1 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${earned ? "border-brand bg-muted" : "border-border bg-muted/30 hover:bg-muted"}`}
                  >
                    <img
                      src={badge.sprite}
                      alt=""
                      draggable={false}
                      className={`h-12 w-12 max-w-full object-contain transition-[filter,opacity] ${earned ? "" : "brightness-0 opacity-30 dark:invert"}`}
                    />
                    {earned && (
                      <Check
                        aria-hidden="true"
                        className="absolute right-1 top-1 h-3 w-3 text-brand"
                      />
                    )}
                    <span className="w-full break-words text-center text-[10px] leading-tight">
                      {badge.name.replace(" Badge", "")}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Toca una medalla cuando la obtengas en el tablero. Vuelve a
              tocarla para retirarla.
            </p>
          </section>

          <section
            aria-labelledby="bag-money-heading"
            className="space-y-3 rounded-xl border bg-card p-3 text-card-foreground"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Coins className="h-4 w-4 text-brand" aria-hidden="true" />
              <h3 id="bag-money-heading" className="text-sm font-medium">
                Dinero
              </h3>
            </div>
            <p
              className="break-all text-3xl font-bold tabular-nums"
              aria-live="polite"
            >
              ${formatBagMoney(balance)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={() => chooseDirection("subtract")}
                disabled={balance === 0}
              >
                <Minus className="h-4 w-4" aria-hidden="true" /> Restar
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={() => chooseDirection("add")}
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Agregar
              </Button>
            </div>
            {direction && (
              <form onSubmit={confirmMoney} className="space-y-3 border-t pt-3">
                <label
                  htmlFor="bag-money-amount"
                  className="block text-sm font-medium"
                >
                  {direction === "add"
                    ? "Cantidad a agregar"
                    : "Cantidad a restar"}
                </label>
                <Input
                  ref={inputRef}
                  id="bag-money-amount"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]+"
                  autoComplete="off"
                  placeholder="0"
                  maxLength={16}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  aria-describedby="bag-money-feedback"
                  aria-invalid={draft !== "" && nextBalance === null}
                />
                <p
                  id="bag-money-feedback"
                  className={`text-xs ${insufficient ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {insufficient
                    ? "No tienes suficiente dinero para restar esa cantidad."
                    : nextBalance !== null
                      ? `Nuevo saldo: $${formatBagMoney(nextBalance)}`
                      : "Ingresa una cantidad entera mayor que cero, sin comas ni decimales."}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDirection(null);
                      setDraft("");
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={nextBalance === null}>
                    Confirmar
                  </Button>
                </div>
              </form>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
