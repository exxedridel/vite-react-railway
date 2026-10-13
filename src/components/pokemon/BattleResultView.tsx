import type { BattleResult } from "@/types/battle";
import type { PokemonStatus } from "@/types/pokemon";
import { STATUS_OPTIONS } from "@/types/pokemon";
import { WEATHER_LABELS } from "@/lib/battleField";
import { STAT_LABELS } from "@/lib/pokemonStats";

const percent = (value: number) => `${Number(value.toFixed(2))}%`;
const statusName = (id: PokemonStatus) =>
  STATUS_OPTIONS.find((s) => s.id === id)?.label ?? id;
const phrases: Record<PokemonStatus, string> = {
  burned: "is burned!",
  frozen: "is frozen!",
  paralyzed: "is paralyzed!",
  asleep: "is asleep!",
  poisoned: "is poisoned!",
  "badly-poisoned": "is badly poisoned!",
  confused: "is confused!",
  infatuated: "is infatuated!",
  taunted: "was taunted!",
  flinched: "flinched!",
  bound: "is bound!",
  trapped: "is trapped!",
  disabled: "was affected by Disable!",
  encored: "was affected by Encore!",
  "perish-song": "was affected by Perish Song!",
  "leech-seed": "was seeded!",
};
export default function BattleResultView({ result }: { result: BattleResult }) {
  const hit = result.outcome === "hit";
  const changedHp = result.hpChanges?.filter((c) => c.before !== c.after) ?? [];
  const effectiveness =
    hit && result.attack !== null && result.effectiveness > 1
      ? result.effectiveness > 2
        ? "It's extremely effective!"
        : "It's super effective!"
      : hit &&
          result.attack !== null &&
          result.effectiveness > 0 &&
          result.effectiveness < 1
        ? "It's not very effective..."
        : null;
  const statusChanges = result.statusChanges ?? [];
  // Los registros antiguos no contienen los nombres de stats; no se inventan.
  const attackLabel =
    result.attackStat === "special-attack"
      ? "Ataque SP usado"
      : result.attackStat === "attack"
        ? "Ataque físico usado"
        : "Ataque usado";
  const defenseLabel =
    result.defenseStat === "special-defense"
      ? "Defensa SP usada"
      : result.defenseStat === "defense"
        ? "Defensa física usada"
        : "Defensa usada";
  const weather = result.executionOptions?.weather;
  const hasStats = result.attack !== null && result.defense !== null;
  const showBurn = result.attackerBurned ?? result.burn !== 1;
  const headline =
    (hit && result.critical) || effectiveness || statusChanges.length > 0;
  return (
    <div className="space-y-3" aria-live="polite">
      <p className="text-sm text-muted-foreground capitalize">
        {result.attackerName} → {result.opponentName} · {result.moveName}
      </p>
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold"
        data-testid="result-headline"
      >
        {hit && result.critical && (
          <span className="text-yellow-600 dark:text-yellow-400">
            A critical hit!
          </span>
        )}
        {effectiveness && (
          <span
            className={
              result.effectiveness > 1
                ? "text-green-600 dark:text-green-400"
                : "text-orange-600 dark:text-orange-400"
            }
          >
            {effectiveness}
          </span>
        )}
        {statusChanges.map((c) => (
          <span key={`${c.role}:${c.status}`} className="text-foreground">
            <span className="capitalize">{c.name}</span> {phrases[c.status]}
          </span>
        ))}
        {!headline && <span>{hit ? "The move hit." : result.message}</span>}
        {headline && !hit && result.outcome !== "status" && (
          <span>{result.message}</span>
        )}
      </div>
      {hit && (
        <>
          <div className="rounded-xl bg-muted p-4 text-center">
            <p className="text-3xl font-bold tabular-nums">
              {result.damage} HP
            </p>
          </div>
          <details className="rounded-xl border p-3 text-xs">
            <summary className="cursor-pointer font-medium">
              Ver cálculo del daño
            </summary>
            <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2">
              <dt>Nivel</dt>
              <dd>{result.level}</dd>
              {hasStats && (
                <>
                  <dt>{attackLabel}</dt>
                  <dd className="tabular-nums">
                    {result.attack} · {result.attackStage ?? 0}{" "}
                    <span className="text-muted-foreground">modificador</span>
                  </dd>
                  <dt>{defenseLabel}</dt>
                  <dd className="tabular-nums">
                    {result.defense} · {result.defenseStage ?? 0}{" "}
                    <span className="text-muted-foreground">modificador</span>
                  </dd>
                </>
              )}
              {result.baseDamage !== null && (
                <>
                  <dt>
                    Daño base
                    {(result.hits?.length ?? 0) > 1 ? " · primer golpe" : ""}
                  </dt>
                  <dd>{result.baseDamage}</dd>
                </>
              )}
              {hasStats && (
                <>
                  <dt>STAB</dt>
                  <dd>×{result.stab}</dd>
                  <dt>Efectividad</dt>
                  <dd>×{result.effectiveness}</dd>
                </>
              )}
              {result.critical && (
                <>
                  <dt>Crítico</dt>
                  <dd>×{result.criticalMultiplier ?? 2}</dd>
                </>
              )}
              {showBurn && (
                <>
                  <dt>Quemadura</dt>
                  <dd>×{result.burn}</dd>
                </>
              )}
              {result.weatherMultiplier !== undefined &&
                result.weatherMultiplier !== 1 && (
                  <>
                    <dt>
                      Clima
                      {weather && weather !== "none"
                        ? ` · ${WEATHER_LABELS[weather]}`
                        : ""}
                    </dt>
                    <dd>×{result.weatherMultiplier}</dd>
                  </>
                )}
            </dl>
            {!hasStats && (
              <p className="mt-2 text-muted-foreground">
                Este movimiento usa un cálculo de daño especial; no utiliza la
                relación Ataque/Defensa.
              </p>
            )}
            {(result.hits?.length ?? 0) > 1 && (
              <p className="mt-2 text-muted-foreground">
                Stats y daño base corresponden al primer golpe. Los críticos se
                indican por golpe abajo.
              </p>
            )}
          </details>
        </>
      )}
      {changedHp.length > 0 && (
        <div className="space-y-2 text-sm">
          {changedHp.map((c) => (
            <p key={c.role}>
              HP de <span className="capitalize">{c.name}</span>: {c.before} →{" "}
              {c.after} ({c.after - c.before > 0 ? "+" : ""}
              {c.after - c.before} HP).
            </p>
          ))}
        </div>
      )}
      {!result.hpChanges &&
        result.targetHpBefore !== undefined &&
        result.targetHpAfter !== undefined &&
        result.targetHpBefore !== result.targetHpAfter && (
          <p className="text-sm">
            HP de {result.opponentName}: {result.targetHpBefore} →{" "}
            {result.targetHpAfter}.
          </p>
        )}
      {!result.hpChanges &&
        result.targetHpBefore === undefined &&
        result.wildHpBefore !== null &&
        result.wildHpAfter !== null &&
        result.wildHpBefore !== result.wildHpAfter && (
          <p className="text-sm">
            HP de {result.opponentName}: {result.wildHpBefore} →{" "}
            {result.wildHpAfter}.
          </p>
        )}
      {!!result.hits?.length && result.hits.length > 1 && (
        <p className="text-sm">
          {result.hits.length} golpes:{" "}
          {result.hits
            .map(
              (h, i) =>
                `${i + 1}: ${h.damage} HP${h.critical ? " (critical hit)" : ""}`,
            )
            .join(" · ")}
        </p>
      )}
      {!!result.effectMessages?.length && (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {result.effectMessages.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      )}
      <div className="space-y-1 text-xs text-muted-foreground">
        {result.hitChance !== null && (
          <p>
            Probabilidad de acierto: {percent(result.hitChance)}.
            {result.accuracyRoll !== null &&
              ` Tirada: ${percent(result.accuracyRoll)} (acierta si es menor).`}
          </p>
        )}
        {result.criticalRoll !== null && (
          <p>
            Probabilidad de crítico: {percent(result.criticalChance * 100)}.
            Tirada: {percent(result.criticalRoll * 100)}.
          </p>
        )}
        {result.effectRolls?.map((effect, i) => {
          const label = effect.statuses?.length
            ? effect.statuses.map(statusName).join(" / ")
            : Object.entries(effect.stages ?? {})
                .map(
                  ([stat, delta]) =>
                    `${STAT_LABELS[stat] ?? stat} ${delta! > 0 ? "+" : ""}${delta}`,
                )
                .join(", ") || "efecto";
          return (
            <p key={i}>
              Probabilidad de {label}: {percent(effect.chance)}. Tirada:{" "}
              {percent(effect.roll)}.{" "}
              {effect.applied
                ? "Aplicado"
                : effect.passed
                  ? "Tirada favorable; efecto no aplicado"
                  : "No aplicado: tirada fallida"}{" "}
              · <span className="capitalize">{effect.name}</span>
              {effect.hit > 1 ? ` · golpe ${effect.hit}` : ""}.
              {effect.selectedStatus &&
                ` Seleccionado: ${statusName(effect.selectedStatus)}.`}
            </p>
          );
        })}
      </div>
      {result.manualEffect && (
        <p className="rounded-xl border p-3 text-sm">{result.manualEffect}</p>
      )}
    </div>
  );
}
