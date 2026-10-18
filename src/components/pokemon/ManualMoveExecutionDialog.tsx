import { getBattleField, WEATHER_LABELS } from "@/lib/battleField";
import PokemonMoveExecutionOptions, {
  optionsProblem,
} from "./PokemonMoveExecutionOptions";
import type { MoveExecutionOptions } from "@/lib/moveCatalogTypes";
import { getCuratedMove, CURATED_MOVE_CATALOG } from "@/lib/curatedMoveCatalog";
import { useRef, useState } from "react";
import { nanoid } from "@reduxjs/toolkit";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { store } from "@/store/store";
import { executePokemonMove } from "@/slices/partySlice";
import {
  battleContextKey,
  battleParticipants,
  criticalChance,
  getMoveSupportReason,
  moveHitChance,
  requiresConditionCheck,
} from "@/lib/battleEngine";
import { getCurrentHp } from "@/lib/pokemonStats";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
const percent = (value: number) => `${Number(value.toFixed(2))}%`;
export { default as BattleResultView } from "./BattleResultView";
import BattleResultView from "./BattleResultView";
export default function ManualMoveExecutionDialog({
  captureId,
  moveId,
  onClose,
  actorSide = "player",
}: {
  actorSide?: "player" | "opponent";
  captureId: string;
  moveId: number;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const capture = useAppSelector((state) =>
    state.party.pokemons.find((p) => p.captureId === captureId),
  );
  const opponent = useAppSelector((state) => state.party.opponent);
  const field = getBattleField(
    useAppSelector((state) => state.party.battleField),
  );
  const [commandId] = useState(() => nanoid());
  const [expectedContext] = useState(() =>
    capture && opponent ? battleContextKey(capture, opponent, field) : "",
  );
  const [conditionsConfirmed, setConditionsConfirmed] = useState(false);
  const [declaredOptions, setOptions] = useState<MoveExecutionOptions>({});
  const options = {
    ...declaredOptions,
    weather: field.weather?.kind ?? ("none" as const),
  };
  const submitted = useRef(false);
  const result = useAppSelector((state) =>
    state.party.lastBattleResult?.id === commandId
      ? state.party.lastBattleResult
      : null,
  );
  const participants =
    capture && opponent
      ? battleParticipants(capture, opponent, actorSide)
      : null;
  const storedMove = (
    actorSide === "opponent" ? opponent?.moves : capture?.moves
  )?.find((m) => m.id === moveId);
  const move = storedMove ? getCuratedMove(storedMove) : undefined;
  const needsConditionCheck =
    !!participants && requiresConditionCheck(participants.attacker, moveId);
  let manualReason: string | null = move ? getMoveSupportReason(move) : null;
  let reason: string | null = null;
  let hitChance: number | null = null;
  if (!capture || !opponent || !move)
    reason = "Selecciona un Pokémon, un movimiento aprendido y un oponente.";
  else {
    if (actorSide === "opponent" && opponent.kind !== "wild")
      reason = "El encuentro salvaje ya no está disponible.";
    if (!reason && getCurrentHp(capture.pokemon) <= 0)
      reason = "Tu Pokémon está debilitado.";
    if (
      !reason &&
      opponent.kind === "wild" &&
      getCurrentHp(opponent.pokemon) <= 0
    )
      reason = "El salvaje está debilitado.";
    if (
      !reason &&
      participants?.attacker.statuses?.includes("taunted") &&
      move.damageClass === "status"
    )
      reason = "Taunt impide usar movimientos de estado.";
    if (
      !reason &&
      battleContextKey(capture, opponent, field) !== expectedContext
    )
      reason =
        "Los datos del combate cambiaron. Cierra esta ventana y vuelve a elegir el movimiento.";
    if (!reason) {
      try {
        hitChance = moveHitChance(
          participants!.attacker,
          participants!.defender,
          move,
          options,
        );
      } catch {
        manualReason = "Acierto y efecto pendientes de resolución manual.";
      }
    }
  }
  function confirm() {
    if (
      submitted.current ||
      result ||
      reason ||
      optionsProblem(moveId, options) ||
      !move ||
      (needsConditionCheck && !conditionsConfirmed)
    )
      return;
    submitted.current = true;
    dispatch(
      executePokemonMove({
        captureId,
        actorSide,
        moveId,
        commandId,
        expectedContext,
        conditionsConfirmed,
        options,
      }),
    );
    if (store.getState().party.lastBattleResult?.id !== commandId) {
      submitted.current = false;
      toast.error(
        "El combate cambió. Cierra esta ventana y vuelve a elegir el movimiento.",
      );
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-[480px]">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {result
              ? "Resultado del movimiento"
              : `Usar ${move?.displayName ?? "movimiento"}`}
          </DialogTitle>
          <DialogDescription>
            {result
              ? "Esta acción ya se resolvió. Cerrar la ventana conserva el resultado."
              : "Al confirmar, la app resuelve el acierto y, si corresponde, el crítico y el daño."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-1">
          {result ? (
            <BattleResultView result={result} />
          ) : (
            <>
              <p className="text-sm capitalize">
                Atacante: {participants?.attacker.pokemon.name ?? "—"} →
                Objetivo: {participants?.defender.pokemon.name ?? "—"}
              </p>
              {move && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    Ver regla de {move.displayName}
                  </summary>
                  <p className="mt-2 text-muted-foreground">
                    {getCuratedMove(move).description}
                  </p>
                </details>
              )}
              {(field.weather || field.mudSport || field.waterSport) && (
                <p className="text-xs text-muted-foreground">
                  {[
                    field.weather ? WEATHER_LABELS[field.weather.kind] : null,
                    field.mudSport ? "Mud Sport" : null,
                    field.waterSport ? "Water Sport" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  · se aplica automáticamente
                </p>
              )}
              {(manualReason || hitChance === null) && !reason && (
                <p className="rounded-xl border p-3 text-sm">
                  {manualReason ?? "Precisión sin automatizar."} Puedes
                  confirmar para registrar su uso. El efecto se aplica
                  manualmente.
                </p>
              )}
              {reason ? (
                <p role="alert" className="rounded-xl border p-3 text-sm">
                  {reason}
                </p>
              ) : (
                <dl className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-3 text-sm">
                  <dt>Acierto</dt>
                  <dd>
                    {moveId === 214
                      ? "Depende del movimiento elegido"
                      : hitChance === null
                        ? "—"
                        : percent(hitChance)}
                  </dd>
                  <dt>Crítico si acierta</dt>
                  <dd>
                    {moveId === 214
                      ? "Depende del movimiento elegido"
                      : move && !manualReason && hitChance !== null
                        ? percent(criticalChance(move) * 100)
                        : "Manual / no aplica"}
                  </dd>
                </dl>
              )}
              {move && (
                <PokemonMoveExecutionOptions
                  moveId={moveId}
                  value={options}
                  onChange={setOptions}
                />
              )}
              {optionsProblem(moveId, options) && (
                <p className="text-xs text-muted-foreground">
                  {optionsProblem(moveId, options)}
                </p>
              )}
              {needsConditionCheck && (
                <label className="flex items-start gap-2 rounded-xl border p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0"
                    checked={conditionsConfirmed}
                    onChange={(event) =>
                      setConditionsConfirmed(event.target.checked)
                    }
                  />
                  <span>
                    Ya resolví sus estados y confirmo que puede usar este
                    movimiento. Confusión, parálisis, sueño y otros impedimentos
                    se resuelven manualmente.
                  </span>
                </label>
              )}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  Alcance del cálculo
                </summary>
                <p className="mt-2">
                  Clima y efectos de campo se leen automáticamente. Habilidades,
                  objetos y los efectos marcados manuales se resuelven en el
                  tablero. Los cambios se guardan en este navegador.
                </p>
              </details>
            </>
          )}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t pt-3">
          <Button type="button" variant="outline" onClick={onClose}>
            {result ? "Cerrar" : "Cancelar"}
          </Button>
          {!result && (
            <Button
              type="button"
              onClick={confirm}
              disabled={
                !!reason ||
                !!optionsProblem(moveId, options) ||
                (needsConditionCheck && !conditionsConfirmed)
              }
            >
              Confirmar movimiento
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
