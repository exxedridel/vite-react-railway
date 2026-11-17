import { useRef, useState } from "react";
import { toast } from "sonner";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
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
  async function launch(ballId: BallItemId) {
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
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (!target || !opponent?.encounterId) return;
      await shop.throwBall(ballId, {
        minimum: target.minimum!,
        encounterId: opponent.encounterId,
        captureDifficulty: difficulty,
        captureRevision: settings?.captureRevision ?? 0,
      });
      const result = store.getState().party.lastCaptureResult;
      if (result?.roll !== undefined && result.minimum !== undefined) {
        toast(
          result.outcome === "caught"
            ? `${result.pokemonName} se unió a tu equipo.`
            : `${result.pokemonName} escapó de la pokebola.`,
          {
            id: `capture:${result.attemptId}`,
            description: (
              <span data-testid="capture-auto-result">
                D20: {result.roll} · mínimo: {result.minimum}.{" "}
                {result.outcome === "caught"
                  ? "Captura conseguida."
                  : "El salvaje respondió al lanzamiento."}
              </span>
            ),
          },
        );
      }
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
            Toca la pokebola que quieras lanzar. El D20 y el resultado se
            calculan automáticamente al gastar una unidad.
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
                onClick={() => void launch(id)}
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
              </Button>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground">
          Cada lanzamiento consume una bola y tu acción, tanto si captura como
          si falla. El D20 debe igualar o superar el mínimo indicado. Si falla,
          el salvaje responderá. Un mínimo superior a 20 impide lanzar esa bola.
        </p>
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
