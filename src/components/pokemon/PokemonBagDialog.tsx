import { Backpack, Check, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { toggleGymBadge } from "@/slices/partySlice";
import { KANTO_BADGES, formatBagMoney } from "@/lib/trainerBag";
import { SHOP_ITEMS } from "@/lib/adminShop";
import { useShopContext } from "@/context/ShopContext";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };
export default function PokemonBagDialog({ open, onOpenChange }: Props) {
  const dispatch = useAppDispatch();
  const bag = useAppSelector((state) => state.party.bag);
  const shop = useShopContext();
  const balance = bag?.money ?? 500;
  const badges = bag?.badges ?? [];
  const items = SHOP_ITEMS.filter((item) => (bag?.items?.[item.id] ?? 0) > 0);
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
          <Backpack className="h-4 w-4 text-brand" aria-hidden="true" /> Bag
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] flex-col overflow-hidden p-4 sm:max-w-[480px] sm:p-6">
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle className="flex items-center gap-2">
            <Backpack className="h-5 w-5 text-brand" aria-hidden="true" /> Bag
          </DialogTitle>
          <DialogDescription>
            Medallas, Pokedollars y objetos de tu entrenador.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-1 pb-1">
          <section
            aria-labelledby="bag-money-heading"
            className="space-y-3 rounded-xl border bg-card p-3 text-card-foreground"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Coins className="h-4 w-4 text-brand" aria-hidden="true" />
              <h3 id="bag-money-heading" className="text-sm font-medium">
                Pokedollars
              </h3>
            </div>
            <p
              className="break-all text-3xl font-bold tabular-nums"
              aria-live="polite"
              data-testid="pokedollars-balance"
            >
              {formatBagMoney(balance)} Pokedollars
            </p>
            <p className="text-xs text-muted-foreground">
              Las compras se confirman en el Poké Mart con el administrador.
            </p>
            {!shop.connected && (
              <p role="status" className="text-xs text-muted-foreground">
                Sin conexión con Tienda. Se muestra el último saldo guardado.
              </p>
            )}
            {shop.connected && !shop.synced && (
              <p role="status" className="text-xs text-muted-foreground">
                Recuperando el saldo confirmado…
              </p>
            )}
            {shop.error && (
              <p role="alert" className="text-xs text-destructive">
                {shop.error}
              </p>
            )}
          </section>
          <section aria-labelledby="bag-items-heading" className="space-y-3">
            <h3 id="bag-items-heading" className="text-sm font-semibold">
              Objetos del Poké Mart
            </h3>
            {items.length ? (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border p-2"
                    data-item-id={item.id}
                  >
                    <img
                      src={item.image}
                      alt=""
                      className="h-9 w-9 object-contain"
                      draggable={false}
                    />
                    <span className="flex-1 text-sm">{item.name}</span>
                    <strong className="tabular-nums">
                      ×{bag?.items?.[item.id]}
                    </strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aún no tienes objetos comprados.
              </p>
            )}
          </section>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
