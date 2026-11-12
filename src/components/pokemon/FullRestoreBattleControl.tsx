import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useShopContext } from "@/context/ShopContext";
import { useAppSelector } from "@/store/hooks";
import { isLocalPartyMutationBlocked } from "@/store/accountStorage";
import { localBattleActive } from "@/lib/shop/wallet";

export default function FullRestoreBattleControl({
  captureId,
}: {
  captureId: string;
}) {
  const shop = useShopContext();
  const party = useAppSelector((state) => state.party);
  const [busy, setBusy] = useState(false);
  const stock = party.bag?.items?.["full-restore"] ?? 0;
  const runtime = party.emerald && !party.emerald.ended ? party.emerald : null;
  const request = runtime?.requests.player;
  const unavailable =
    busy ||
    stock < 1 ||
    !shop.connected ||
    !shop.synced ||
    isLocalPartyMutationBlocked(party) ||
    !!runtime?.pending.player ||
    !!request?.waiting ||
    !!request?.forceSwitch ||
    !!request?.locked ||
    (localBattleActive(party) && !!party.battleField?.playerItemUsedThisTurn);
  async function use() {
    if (unavailable) return;
    setBusy(true);
    try {
      await shop.useFullRestore(captureId);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo usar Full Restore.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <Button
        variant="outline"
        className="w-full gap-2"
        disabled={unavailable}
        onClick={() => void use()}
        data-testid="battle-full-restore"
      >
        <img
          src="/admin-shop/full-restore.png"
          alt=""
          className="h-6 w-6 [image-rendering:pixelated]"
        />
        {busy ? "Confirmando…" : `Full Restore · ${stock}`}
      </Button>
      <p className="text-xs text-muted-foreground">
        Consume 1 Full Restore de tu Bag y la acción de tu Pokémon en este
        turno. Requiere conexión.
      </p>
    </div>
  );
}
