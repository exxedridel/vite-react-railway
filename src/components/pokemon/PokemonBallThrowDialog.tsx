import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useShopContext } from "@/context/ShopContext";
import { useAppSelector } from "@/store/hooks";
import { isLocalPartyMutationBlocked } from "@/store/accountStorage";
import { BALL_ITEM_IDS, type BallItemId } from "@/lib/shop/types";
import { SHOP_ITEMS } from "@/lib/adminShop";
import { captureRequirements } from "@/lib/captureRates";
import type { BattleOpponent } from "@/lib/battleOpponent";
import PokemonCaptureRequirements from "./PokemonCaptureRequirements";

const captureBallId = {
  "poke-ball": "poke",
  "great-ball": "great",
  "ultra-ball": "ultra",
} as const;

export default function PokemonBallThrowDialog({
  opponent,
  open,
  onOpenChange,
}: {
  opponent: BattleOpponent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shop = useShopContext();
  const party = useAppSelector((state) => state.party);
  const [selected, setSelected] = useState<BallItemId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const difficulty = shop.catalog?.captureDifficulty ?? 0;
  const info = opponent
    ? captureRequirements(opponent.pokemon, opponent.statuses, difficulty)
    : null;
  const item = SHOP_ITEMS.find((item) => item.id === selected);
  const target = info?.balls.find(
    (ball) => selected && ball.id === captureBallId[selected],
  );
  const stock = selected ? (party.bag?.items?.[selected] ?? 0) : 0;
  const canThrow =
    !!selected &&
    !!target &&
    target.minimum !== null &&
    target.minimum <= 20 &&
    !!shop.catalog &&
    stock > 0 &&
    !busy &&
    !shop.usingItem &&
    shop.connected &&
    shop.synced &&
    !isLocalPartyMutationBlocked(party);
  async function launch() {
    if (!canThrow || !selected || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (!target || !opponent?.encounterId) return;
      await shop.throwBall(selected, {
        minimum: target.minimum!,
        encounterId: opponent.encounterId,
        captureDifficulty: difficulty,
        captureRevision: shop.catalog!.revision,
      });
      onOpenChange(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo confirmar el lanzamiento.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (busy) return;
        if (value) {
          setSelected(null);
          setError("");
        }
        onOpenChange(value);
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-[440px]"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Lanzar pokebola</DialogTitle>
          <DialogDescription>
            Elige una bola de tu Bag para atrapar a {opponent?.pokemon.name}.
            Primero confirma el lanzamiento; después tira tu D20 físico.
          </DialogDescription>
        </DialogHeader>
        <p
          className="text-xs text-muted-foreground"
          data-testid="capture-difficulty-bonus"
        >
          Dificultad global: +{difficulty} al mínimo D20
        </p>
        <div className="space-y-2" aria-label="Pokebolas disponibles">
          {BALL_ITEM_IDS.map((id) => {
            const entry = SHOP_ITEMS.find((item) => item.id === id)!;
            const quantity = party.bag?.items?.[id] ?? 0;
            const minimum = info?.balls.find(
              (ball) => ball.id === captureBallId[id],
            )?.minimum;
            return (
              <Button
                key={id}
                type="button"
                variant={selected === id ? "default" : "outline"}
                className="h-auto min-h-14 w-full justify-between gap-3 px-3 py-2"
                data-testid={`capture-ball-${id}`}
                aria-pressed={selected === id}
                disabled={
                  !quantity ||
                  !info ||
                  busy ||
                  minimum === undefined ||
                  minimum === null ||
                  minimum > 20
                }
                onClick={() => {
                  setSelected(id);
                  setError("");
                }}
              >
                <span className="flex items-center gap-2">
                  <img
                    src={entry.image}
                    alt=""
                    className="h-9 w-9 [image-rendering:pixelated]"
                  />
                  <span className="text-left">
                    <span className="block font-semibold">
                      {entry.name} · ×{quantity}
                    </span>
                    <span className="block text-xs font-normal">
                      {!quantity
                        ? "Sin existencias"
                        : minimum !== undefined &&
                            minimum !== null &&
                            minimum > 20
                          ? `Imposible · mínimo ${minimum}+`
                          : `D20 mínimo ${minimum}+`}
                    </span>
                  </span>
                </span>
                {selected === id && <span aria-hidden="true">✓</span>}
              </Button>
            );
          })}
        </div>
        {target && item && (
          <div
            className="space-y-2 rounded-xl border p-3 text-sm"
            data-testid="capture-ball-quote"
          >
            <p>
              Lanzarás <strong>1 {item.name}</strong>. Necesitas{" "}
              <strong>{target.minimum} o más</strong> en tu D20 físico.
            </p>
            {target.minimum !== null && target.minimum > 20 && (
              <p role="status" className="text-destructive">
                Imposible con esta bola: el mínimo supera el máximo de tu D20.
                No se gastará ninguna bola.
              </p>
            )}
            <p className="text-muted-foreground">
              La bola se gastará al confirmar, tanto si capturas al Pokémon como
              si escapa. Si falla, el salvaje responderá y se resolverá el
              turno.
            </p>
          </div>
        )}
        {opponent && (
          <details className="rounded-xl border p-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium">
              Cómo se calcula el mínimo
            </summary>
            <div className="mt-3">
              <PokemonCaptureRequirements
                opponent={opponent}
                difficulty={difficulty}
              />
            </div>
          </details>
        )}
        {!BALL_ITEM_IDS.some((id) => (party.bag?.items?.[id] ?? 0) > 0) && (
          <p role="status" className="text-sm text-muted-foreground">
            No tienes pokebolas. Compra más en el Poké Mart para intentar una
            captura.
          </p>
        )}
        {!shop.connected && (
          <p role="status" className="text-sm text-muted-foreground">
            Conecta tu Bag para confirmar el consumo de una pokebola.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            data-testid="capture-throw-confirm"
            disabled={!canThrow}
            onClick={() => void launch()}
          >
            {busy
              ? "Confirmando lanzamiento…"
              : item
                ? `Lanzar ${item.name}`
                : "Elige una pokebola"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
