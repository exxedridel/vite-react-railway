import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useShopContext } from "@/context/ShopContext";
import { useAppSelector } from "@/store/hooks";
import { getCurrentMovePp, getMaxMovePp } from "@/lib/movePp";
import { isLocalPartyMutationBlocked } from "@/store/accountStorage";
import { localBattleActive } from "@/lib/shop/wallet";

export default function PpRestoreControls({
  captureId,
  battle = false,
  disabled = false,
  onUsed,
  onBusyChange,
}: {
  captureId: string;
  battle?: boolean;
  disabled?: boolean;
  onUsed?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const shop = useShopContext();
  const party = useAppSelector((state) => state.party);
  const target = party.pokemons.find(
    (capture) => capture.captureId === captureId,
  );
  const [moveId, setMoveId] = useState("");
  const [using, setUsing] = useState<string | null>(null);
  const moves = target?.moves ?? [];
  const selected = moves.find((move) => move.id === Number(moveId));
  const needs = (move: (typeof moves)[number]) =>
    getCurrentMovePp(move) < getMaxMovePp(move);
  const request =
    party.emerald && !party.emerald.ended
      ? party.emerald.requests.player
      : null;
  const pending =
    party.emerald && !party.emerald.ended && party.emerald.pending.player;
  const unavailable =
    disabled ||
    !!using ||
    shop.usingItem ||
    !shop.connected ||
    !shop.synced ||
    isLocalPartyMutationBlocked(party) ||
    !!pending ||
    !!request?.waiting ||
    !!request?.forceSwitch ||
    !!request?.locked ||
    (localBattleActive(party) &&
      !!(
        party.battleField?.playerItemUsedThisTurn ||
        party.battleField?.playerSwitchedThisTurn
      ));
  async function use(item: "max-ether" | "max-elixir") {
    if (unavailable || !target) return;
    setUsing(item);
    onBusyChange?.(true);
    try {
      await shop.useItem(
        item,
        captureId,
        item === "max-ether" ? selected?.id : undefined,
      );
      toast.success(
        `${item === "max-ether" ? "Max Ether" : "Max Elixir"} confirmado para ${target.pokemon.name}.`,
      );
      onUsed?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo restaurar los PP.",
      );
    } finally {
      setUsing(null);
      onBusyChange?.(false);
    }
  }
  if (!target) return null;
  return (
    <>
      {(["max-ether", "max-elixir"] as const).map((item) => {
        const ether = item === "max-ether",
          name = ether ? "Max Ether" : "Max Elixir";
        const stock = party.bag?.items?.[item] ?? 0;
        const canRestore = ether
          ? !!selected && needs(selected)
          : moves.some(needs);
        return (
          <div key={item} className="space-y-2 rounded-xl border p-3">
            {ether && (
              <label className="block space-y-1 text-xs">
                <span>Movimiento que recuperará sus PP</span>
                <select
                  className="min-h-10 w-full rounded-md border bg-background px-2"
                  aria-label="Movimiento para Max Ether"
                  value={moveId}
                  disabled={unavailable}
                  onChange={(event) => setMoveId(event.target.value)}
                >
                  <option value="">Seleccionar movimiento</option>
                  {moves.map((move) => (
                    <option
                      key={move.id}
                      value={move.id}
                      disabled={!needs(move)}
                    >
                      {move.displayName} · {getCurrentMovePp(move)}/
                      {getMaxMovePp(move)} PP
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button
              variant="outline"
              className="w-full gap-2"
              disabled={unavailable || stock < 1 || !canRestore}
              onClick={() => void use(item)}
              aria-label={`Usar ${name} en ${target.pokemon.name}`}
              data-testid={`${battle ? "battle" : "party"}-${item}`}
            >
              <img
                src={`/admin-shop/${item}.png`}
                alt=""
                className="h-6 w-6 [image-rendering:pixelated]"
              />
              {using === item ? "Confirmando…" : `${name} · ${stock}`}
            </Button>
            <p className="text-xs text-muted-foreground">
              {ether
                ? "Restaura todos los PP del movimiento elegido."
                : "Restaura todos los PP de los movimientos de este Pokémon."}{" "}
              Consume 1 unidad de la Bag
              {battle || localBattleActive(party)
                ? " y la acción del turno"
                : ""}
              .
            </p>
            {stock < 1 && (
              <p className="text-xs text-muted-foreground">
                No tienes {name} en la Bag.
              </p>
            )}
            {!moves.some(needs) && (
              <p className="text-xs text-muted-foreground">
                Todos los movimientos tienen sus PP completos.
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}
