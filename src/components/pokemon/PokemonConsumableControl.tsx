import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useShopContext } from "@/context/ShopContext";
import { useAppSelector } from "@/store/hooks";
import { isLocalPartyMutationBlocked } from "@/store/accountStorage";
import { localBattleActive } from "@/lib/shop/wallet";
import { getCurrentHp, isLeveled } from "@/lib/pokemonStats";

/** Stock and turn guards mirror the other Party items; effects and inventory
 * are saved by the shared checked-use coordinator, never by the button. */
export default function PokemonConsumableControl({
  itemId,
  captureId,
  battle = false,
  disabled = false,
  onUsed,
  onBusyChange,
}: {
  itemId: "max-revive" | "rare-candy";
  captureId?: string;
  battle?: boolean;
  disabled?: boolean;
  onUsed?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const shop = useShopContext();
  const party = useAppSelector((state) => state.party);
  const [selectedId, setSelectedId] = useState("");
  const [using, setUsing] = useState(false);
  const revive = itemId === "max-revive";
  const chooseTarget = battle && revive;
  const target = party.pokemons.find(
    (entry) => entry.captureId === (chooseTarget ? selectedId : captureId),
  );
  const stock = party.bag?.items?.[itemId] ?? 0;
  const inBattle = localBattleActive(party);
  const runtime = party.emerald && !party.emerald.ended ? party.emerald : null;
  const request = runtime?.requests.player;
  const unavailable =
    disabled ||
    using ||
    shop.usingItem ||
    !shop.localItemsReady ||
    isLocalPartyMutationBlocked(party) ||
    (revive
      ? !!runtime?.pending.player ||
        !!request?.waiting ||
        !!request?.forceSwitch ||
        !!request?.locked ||
        (inBattle &&
          !!(
            party.battleField?.playerItemUsedThisTurn ||
            party.battleField?.playerSwitchedThisTurn
          ))
      : inBattle);
  const eligible =
    !!target &&
    isLeveled(target.pokemon) &&
    (revive ? getCurrentHp(target.pokemon) === 0 : target.pokemon.level < 100);
  const name = revive ? "Max Revive" : "Rare Candy";
  async function use() {
    if (unavailable || stock < 1 || !eligible || !target) return;
    setUsing(true);
    onBusyChange?.(true);
    try {
      if (revive) await shop.useItem("max-revive", target.captureId);
      else await shop.useRareCandy(target.captureId);
      toast.success(`${name} usado en ${target.pokemon.name}.`);
      onUsed?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `No se pudo usar ${name}.`,
      );
    } finally {
      setUsing(false);
      onBusyChange?.(false);
    }
  }
  return (
    <div className="space-y-2 rounded-xl border p-3">
      {chooseTarget && (
        <label className="block space-y-1 text-xs">
          <span>Pokémon debilitado que revivirá</span>
          <select
            className="min-h-10 w-full rounded-md border bg-background px-2"
            aria-label="Pokémon para Max Revive"
            data-testid="battle-max-revive-target"
            value={selectedId}
            disabled={unavailable}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="">Seleccionar Pokémon</option>
            {party.pokemons.map((entry) => (
              <option
                key={entry.captureId}
                value={entry.captureId}
                disabled={
                  !isLeveled(entry.pokemon) || getCurrentHp(entry.pokemon) !== 0
                }
              >
                {entry.pokemon.name}
                {getCurrentHp(entry.pokemon) === 0 ? " · Debilitado" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        disabled={unavailable || stock < 1 || !eligible}
        aria-label={`Usar ${name}${target ? ` en ${target.pokemon.name}` : ""}`}
        data-testid={`${battle ? "battle" : "party"}-${itemId}`}
        onClick={() => void use()}
      >
        <img
          src={`/admin-shop/${itemId}.png`}
          alt=""
          className="h-6 w-6 object-contain [image-rendering:pixelated]"
        />
        {using ? "Aplicando…" : `${name} · ${stock}`}
      </Button>
      <p className="text-xs text-muted-foreground">
        {revive
          ? "Revive a un Pokémon debilitado con todo su HP."
          : "Sube un nivel, hasta el nivel 100. Conserva los estados y PP del Pokémon. Sólo fuera de combate."}{" "}
        Consume 1 unidad de tu Bag
        {revive && inBattle ? " y la acción del turno" : ""}.
      </p>
      {stock < 1 && (
        <p className="text-xs text-muted-foreground">
          No tienes {name} en la Bag.
        </p>
      )}
      {!revive && inBattle && (
        <p className="text-xs text-muted-foreground">
          Termina el combate antes de usar Rare Candy.
        </p>
      )}
      {!revive && target?.pokemon.level === 100 && (
        <p className="text-xs text-muted-foreground">
          Este Pokémon ya está en el nivel máximo.
        </p>
      )}
      {revive &&
        !chooseTarget &&
        target &&
        getCurrentHp(target.pokemon) > 0 && (
          <p className="text-xs text-muted-foreground">
            Max Revive se usa en Pokémon debilitados.
          </p>
        )}
    </div>
  );
}
