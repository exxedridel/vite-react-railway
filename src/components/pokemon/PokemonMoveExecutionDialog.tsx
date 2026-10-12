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
import type { BattleResult } from "@/types/battle";
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
export function BattleResultView({ result }: { result: BattleResult }) {
  return (
    <div className="space-y-3" aria-live="polite">
      <p className="text-sm text-muted-foreground capitalize">
        {result.attackerName} → {result.opponentName} · {result.moveName}
      </p>
      <p className="font-semibold">{result.message}</p>
      {result.outcome === "hit" && (
        <>
          <div className="rounded-xl bg-muted p-4 text-center">
            <p className="text-3xl font-bold tabular-nums">
              {result.damage} HP
            </p>
            <p className="text-sm">
              {result.critical ? "Crítico ×1.5" : "Daño sin crítico"}
            </p>
          </div>
          {result.wildHpBefore !== null ? (
            <p className="text-sm">
              HP del salvaje: {result.wildHpBefore} → {result.wildHpAfter}. Se
              descontaron {result.appliedDamage} HP automáticamente.
            </p>
          ) : (
            <p className="text-sm">
              {result.actorSide === "opponent"
                ? result.targetHpBefore !== undefined
                  ? `HP de ${result.opponentName}: ${result.targetHpBefore} → ${result.targetHpAfter}. Se descontaron ${result.appliedDamage} HP automáticamente.`
                  : `Registro anterior: resta manualmente ${result.damage} HP a ${result.opponentName}.`
                : `El otro jugador debe restar ${result.damage} HP en su celular, hasta un mínimo de 0.`}
            </p>
          )}
          <details className="rounded-xl border p-3 text-xs">
            <summary className="cursor-pointer font-medium">
              Ver cálculo del daño
            </summary>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <dt>Nivel</dt>
              <dd>{result.level}</dd>
              <dt>Ataque usado · etapa</dt>
              <dd>
                {result.attack} · {result.attackStage}
              </dd>
              <dt>Defensa usada · etapa</dt>
              <dd>
                {result.defense} · {result.defenseStage}
              </dd>
              <dt>Daño base</dt>
              <dd>{result.baseDamage}</dd>
              <dt>STAB</dt>
              <dd>×{result.stab}</dd>
              <dt>Efectividad</dt>
              <dd>×{result.effectiveness}</dd>
              <dt>Crítico</dt>
              <dd>×{result.critical ? 1.5 : 1}</dd>
              <dt>Quemadura</dt>
              <dd>×{result.burn}</dd>
            </dl>
          </details>
        </>
      )}
      {result.hitChance !== null && (
        <p className="text-xs text-muted-foreground">
          Probabilidad de acierto: {percent(result.hitChance)}.
          {result.accuracyRoll !== null &&
            ` Tirada: ${percent(result.accuracyRoll)} (acierta si es menor).`}
        </p>
      )}
      {result.criticalRoll !== null && (
        <p className="text-xs text-muted-foreground">
          Probabilidad de crítico: {percent(result.criticalChance * 100)}.
          {` Tirada: ${percent(result.criticalRoll * 100)}.`}
        </p>
      )}
      {result.manualEffect && (
        <p className="rounded-xl border p-3 text-sm">{result.manualEffect}</p>
      )}
    </div>
  );
}
export default function PokemonMoveExecutionDialog({
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
  const [commandId] = useState(() => nanoid());
  const [expectedContext] = useState(() =>
    capture && opponent ? battleContextKey(capture, opponent) : "",
  );
  const [conditionsConfirmed, setConditionsConfirmed] = useState(false);
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
  const move = (
    actorSide === "opponent" ? opponent?.moves : capture?.moves
  )?.find((m) => m.id === moveId);
  const needsConditionCheck =
    !!participants && requiresConditionCheck(participants.attacker);
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
    if (!reason && battleContextKey(capture, opponent) !== expectedContext)
      reason =
        "Los datos del combate cambiaron. Cierra esta ventana y vuelve a elegir el movimiento.";
    if (!reason) {
      try {
        hitChance = moveHitChance(
          participants!.attacker,
          participants!.defender,
          move,
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
                <p className="text-sm text-muted-foreground">
                  {move.description}
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
                  <dd>{hitChance === null ? "—" : percent(hitChance)}</dd>
                  <dt>Crítico si acierta</dt>
                  <dd>
                    {move && !manualReason && hitChance !== null
                      ? percent(criticalChance(move) * 100)
                      : "Manual / no aplica"}
                  </dd>
                </dl>
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
              <p className="text-xs text-muted-foreground">
                El cálculo contempla tipos, nivel, etapas de stats, quemadura y
                crítico. No contempla habilidades, objetos, clima ni terreno.
                Los efectos adicionales y los PP se controlan manualmente.
              </p>
              <p className="text-xs text-muted-foreground">
                {actorSide === "opponent"
                  ? "El daño directo se descontará automáticamente del Pokémon abierto en combate, una sola vez."
                  : opponent?.kind === "wild"
                    ? "El daño directo se descontará del HP del salvaje una sola vez."
                    : "El resultado indicará cuánto debe restar el rival en su propio celular."}
              </p>
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
                !!reason || (needsConditionCheck && !conditionsConfirmed)
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
