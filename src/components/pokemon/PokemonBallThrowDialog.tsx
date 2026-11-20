import { useEffect, useRef, useState } from "react";
import { store } from "@/store/store";
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
import {
  BALL_ITEM_IDS,
  type BallItemId,
  type CaptureQuote,
} from "@/lib/shop/types";
import { SHOP_ITEMS } from "@/lib/adminShop";
import { captureRequirements } from "@/lib/captureRates";
import type { BattleOpponent } from "@/lib/battleOpponent";
import PokemonCaptureThrow from "./PokemonCaptureThrow";

const captureBallId = {
  "poke-ball": "poke",
  "great-ball": "great",
  "ultra-ball": "ultra",
} as const;

export default function PokemonBallThrowDialog({
  opponent,
  open,
  onOpenChange,
  onPresentationChange,
  onResolved,
}: {
  opponent: BattleOpponent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPresentationChange?: (active: boolean) => void;
  onResolved?: () => void;
}) {
  const shop = useShopContext();
  const party = useAppSelector((state) => state.party);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const [selected, setSelected] = useState<{
    ballId: BallItemId;
    opponent: BattleOpponent;
    quote: CaptureQuote;
  } | null>(null);
  const presentation = useRef(onPresentationChange);
  presentation.current = onPresentationChange;
  useEffect(() => () => presentation.current?.(false), []);
  const settings = shop.catalog
    ? {
        captureDifficulty: shop.catalog.captureDifficulty ?? 0,
        captureRevision: shop.catalog.revision,
      }
    : party.captureSettings;
  const difficulty = settings?.captureDifficulty ?? 0;
  const info = opponent
    ? captureRequirements(opponent.pokemon, opponent.statuses, difficulty)
    : null;
  const canUse =
    !busy &&
    !shop.usingItem &&
    shop.localItemsReady &&
    !isLocalPartyMutationBlocked(party);
  function select(ballId: BallItemId) {
    const target = info?.balls.find(
      (ball) => ball.id === captureBallId[ballId],
    );
    if (
      !canUse ||
      inFlight.current ||
      !target ||
      target.minimum === null ||
      target.minimum > 20 ||
      (party.bag?.items?.[ballId] ?? 0) < 1
    )
      return;
    setError("");
    if (!opponent?.encounterId) return;
    setSelected({
      ballId,
      opponent,
      quote: {
        minimum: target.minimum,
        encounterId: opponent.encounterId,
        captureDifficulty: difficulty,
        captureRevision: settings?.captureRevision ?? 0,
      },
    });
    presentation.current?.(true);
  }
  if (selected)
    return (
      <PokemonCaptureThrow
        ballId={selected.ballId}
        opponent={selected.opponent}
        onLaunch={async (hit) => {
          if (inFlight.current)
            throw new Error("El lanzamiento ya se está guardando.");
          inFlight.current = true;
          setBusy(true);
          const before = store.getState().party.lastCaptureResult?.attemptId;
          try {
            await shop.throwBall(selected.ballId, selected.quote, hit);
            const result = store.getState().party.lastCaptureResult;
            if (
              !result ||
              result.attemptId === before ||
              result.ballId !== selected.ballId ||
              result.throwHit !== hit
            )
              throw new Error(
                "No se encontró el resultado guardado del lanzamiento.",
              );
            return result;
          } finally {
            inFlight.current = false;
            setBusy(false);
          }
        }}
        onCancel={() => {
          setSelected(null);
          presentation.current?.(false);
        }}
        onDone={() => {
          setSelected(null);
          presentation.current?.(false);
          onOpenChange(false);
          onResolved?.();
        }}
      />
    );
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (busy) return;
        if (value) {
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
            Tira hacia atrás y suelta para lanzarla.
          </DialogDescription>
        </DialogHeader>
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
                variant="outline"
                className="h-auto min-h-14 w-full justify-between gap-3 px-3 py-2"
                data-testid={`capture-ball-${id}`}
                aria-label={`Lanzar ${entry.name}`}
                disabled={
                  !quantity ||
                  !info ||
                  !canUse ||
                  minimum === undefined ||
                  minimum === null ||
                  minimum > 20
                }
                onClick={() => select(id)}
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
                          ? "No puede capturarlo"
                          : "Lista para lanzar"}
                    </span>
                  </span>
                </span>
              </Button>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground">
          Cada lanzamiento gasta una bola. Puedes cancelar antes de soltarla.
        </p>
        {!BALL_ITEM_IDS.some((id) => (party.bag?.items?.[id] ?? 0) > 0) && (
          <p role="status" className="text-sm text-muted-foreground">
            No tienes pokebolas. Compra más en el Poké Mart para intentar una
            captura.
          </p>
        )}
        {!shop.localItemsReady && (
          <p role="status" className="text-sm text-muted-foreground">
            Sincroniza la Bag una primera vez para habilitar los lanzamientos.
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
          {busy && (
            <p role="status" className="text-sm">
              Guardando lanzamiento…
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
