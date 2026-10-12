import type { CapturedPokemon, Pokemon, BattleStages } from "@/types/pokemon";
import { STATUS_OPTIONS } from "@/types/pokemon";
import type { BattleOpponent } from "@/lib/battleOpponent";
import type { BattleResult } from "@/types/battle";
import type { ActivityDraft } from "@/types/activity";
import { getCurrentHp, STAT_LABELS } from "@/lib/pokemonStats";
import { normalizeStages } from "@/lib/battleModifiers";
type Snapshot = {
  pokemons: CapturedPokemon[];
  opponent: BattleOpponent | null;
  lastBattleResult?: BattleResult | null;
};
function statsChanges(before: Pokemon, after: Pokemon): string[] {
  return after.stats.flatMap((stat) => {
    const old = before.stats.find((s) => s.name === stat.name)?.value;
    return old !== stat.value
      ? [
          `${STAT_LABELS[stat.name] ?? stat.name}: ${old ?? "—"} → ${stat.value}`,
        ]
      : [];
  });
}
function stageChanges(
  before?: Partial<BattleStages>,
  after?: Partial<BattleStages>,
): string[] {
  const a = normalizeStages(before),
    b = normalizeStages(after);
  return (Object.keys(b) as (keyof BattleStages)[]).flatMap((key) =>
    a[key] !== b[key]
      ? [`${STAT_LABELS[key] ?? key}: etapa ${a[key]} → ${b[key]}`]
      : [],
  );
}
function hpDetail(before: Pokemon, after: Pokemon): string {
  const a = getCurrentHp(before),
    b = getCurrentHp(after),
    delta = b - a;
  return `HP: ${a} → ${b} (${delta >= 0 ? "+" : ""}${delta})`;
}
function statusNames(capture: CapturedPokemon): string {
  return (
    (capture.statuses ?? [])
      .map((id) => STATUS_OPTIONS.find((s) => s.id === id)?.label ?? id)
      .join(", ") || "Sin estados"
  );
}
function describeCapture(capture: CapturedPokemon): string[] {
  return [
    `Nivel ${capture.pokemon.level ?? 50} · HP ${getCurrentHp(capture.pokemon)}`,
    `Movimientos: ${capture.moves?.map((m) => m.displayName).join(", ") || "Sin movimientos"}`,
  ];
}
// Compara cambios efectivamente aplicados. No registra clics, renderizados ni consultas.
export function describePartyActivity(
  actionType: string,
  before: Snapshot,
  after: Snapshot,
): ActivityDraft | null {
  if (actionType === "party/resetGame") {
    return {
      kind: "reset",
      title: "Partida reiniciada",
      details: [
        `Se retiraron ${before.pokemons.length} Pokémon del equipo.`,
        before.opponent
          ? `Oponente retirado: ${before.opponent.pokemon.name}.`
          : "No había oponente seleccionado.",
        "El historial se conserva; puedes escoger un nuevo inicial.",
      ],
    };
  }
  if (actionType === "party/executePokemonMove") {
    const battle = after.lastBattleResult;
    if (
      !battle ||
      battle === before.lastBattleResult ||
      battle.id === before.lastBattleResult?.id
    )
      return null;
    const didExecute = ["hit", "miss", "immune", "status", "manual"].includes(
      battle.outcome,
    );
    return {
      kind: "move",
      captureId: battle.captureId,
      title: `${battle.attackerName} · ${battle.moveName}`,
      details: [
        `Origen: ${battle.actorSide === "opponent" ? "Encuentro salvaje" : "Tu equipo"}`,
        `Objetivo: ${battle.opponentName}`,
        ...(battle.effectMessages ?? []),
        `${didExecute ? "Resultado" : "No ejecutado"}: ${battle.message}`,
        ...(battle.outcome === "hit"
          ? [`Daño: ${battle.damage} HP${battle.critical ? " · Crítico" : ""}`]
          : []),
        ...(battle.manualEffect
          ? [`Efecto manual: ${battle.manualEffect}`]
          : []),
        ...(battle.hpChanges ?? []).map(
          (change) =>
            `HP de ${change.name}: ${change.before} → ${change.after} (${change.after - change.before >= 0 ? "+" : ""}${change.after - change.before} HP)`,
        ),
        ...(battle.appliedHealing !== undefined
          ? [
              `Curación: ${battle.appliedHealing} HP (solicitada: ${battle.requestedHealing} HP, limitada por HP máximo).`,
            ]
          : []),
        ...(!battle.hpChanges &&
        battle.actorSide === "opponent" &&
        battle.outcome === "hit"
          ? [
              battle.targetHpBefore !== undefined
                ? `HP de tu Pokémon: ${battle.targetHpBefore} → ${battle.targetHpAfter} (−${battle.appliedDamage})`
                : "Daño pendiente de descontar manualmente en tu Pokémon.",
            ]
          : []),
        ...(battle.wildHpBefore !== null
          ? [
              `HP salvaje: ${battle.wildHpBefore} → ${battle.wildHpAfter} (−${battle.appliedDamage})`,
            ]
          : []),
      ],
      battle,
    };
  }
  if (actionType === "party/setBattleOpponent") {
    const a = before.opponent,
      b = after.opponent;
    if (!a && !b) return null;
    if (!b)
      return {
        kind: "opponent",
        title: `Oponente retirado: ${a!.pokemon.name}`,
        details: [],
      };
    if (
      !a ||
      a.pokemon.id !== b.pokemon.id ||
      a.encounterId !== b.encounterId ||
      a.kind !== b.kind
    ) {
      return {
        kind: "opponent",
        title: `${b.kind === "wild" ? "Encuentro salvaje" : "Oponente seleccionado"}: ${b.pokemon.name}`,
        details: [
          ...(a ? [`Sustituye a ${a.pokemon.name}.`] : []),
          `Nivel ${b.pokemon.level ?? 50} · HP ${getCurrentHp(b.pokemon)}`,
          ...(b.moves?.length
            ? [`Movimientos: ${b.moves.map((m) => m.displayName).join(", ")}`]
            : []),
        ],
      };
    }
    const details: string[] = [];
    const beforeStatuses = (a.statuses ?? []).join(", ");
    const afterStatuses = (b.statuses ?? []).join(", ");
    if (beforeStatuses !== afterStatuses)
      details.push(
        `Estados: ${beforeStatuses || "Sin estados"} → ${afterStatuses || "Sin estados"}`,
      );
    if (a.pokemon.level !== b.pokemon.level)
      details.push(
        `Nivel: ${a.pokemon.level ?? 50} → ${b.pokemon.level ?? 50}`,
      );
    details.push(
      ...statsChanges(a.pokemon, b.pokemon),
      ...stageChanges(a.stages, b.stages),
    );
    if (a.pokemon.types.join(",") !== b.pokemon.types.join(","))
      details.push(
        `Tipos: ${a.pokemon.types.join(" / ")} → ${b.pokemon.types.join(" / ")}`,
      );
    if (JSON.stringify(a.moves ?? []) !== JSON.stringify(b.moves ?? []))
      details.push(
        `Movimientos: ${b.moves?.map((m) => m.displayName).join(", ") || "Sin movimientos"}`,
      );
    return details.length
      ? {
          kind: "opponent",
          title: `Oponente modificado: ${b.pokemon.name}`,
          details,
        }
      : null;
  }
  if (["party/addPokemon", "party/captureWildOpponent"].includes(actionType)) {
    const added = after.pokemons.find(
      (p) => !before.pokemons.some((old) => old.captureId === p.captureId),
    );
    if (!added) return null;
    return {
      kind: added.origin === "starter" ? "starter" : "capture",
      captureId: added.captureId,
      title: `${added.origin === "starter" ? "Inicial elegido" : "Pokémon capturado"}: ${added.pokemon.name}`,
      details: describeCapture(added),
    };
  }
  if (actionType === "party/removePokemon") {
    const removed = before.pokemons.find(
      (p) => !after.pokemons.some((next) => next.captureId === p.captureId),
    );
    return removed
      ? {
          kind: "release",
          captureId: removed.captureId,
          title: `Pokémon liberado: ${removed.pokemon.name}`,
          details: describeCapture(removed),
        }
      : null;
  }
  // Las migraciones y la carga automática del catálogo no son acciones del jugador.
  const tracked = [
    "setPokemonLevel",
    "changePokemonHp",
    "updatePokemonStats",
    "learnPokemonMoveWithTm",
    "learnInitialMove",
    "changePokemonBattleStage",
    "resetPokemonBattleStages",
    "togglePokemonStatus",
    "clearPokemonStatuses",
  ];
  if (!tracked.some((name) => actionType === `party/${name}`)) return null;
  const changed = after.pokemons.find((p) => {
    const old = before.pokemons.find((a) => a.captureId === p.captureId);
    return old && old !== p;
  });
  if (!changed) return null;
  const old = before.pokemons.find((p) => p.captureId === changed.captureId)!;
  const common = { captureId: changed.captureId };
  const name = changed.pokemon.name;
  if (actionType === "party/setPokemonLevel") {
    if (old.pokemon.level === changed.pokemon.level) return null;
    return {
      ...common,
      kind: "level",
      title: `Nivel modificado: ${name}`,
      details: [
        `Nivel: ${old.pokemon.level ?? 50} → ${changed.pokemon.level ?? 50}`,
        ...statsChanges(old.pokemon, changed.pokemon),
      ],
    };
  }
  if (
    ["party/changePokemonHp", "party/updatePokemonStats"].includes(actionType)
  ) {
    const delta = getCurrentHp(changed.pokemon) - getCurrentHp(old.pokemon);
    return delta
      ? {
          ...common,
          kind: "hp",
          title: `${delta > 0 ? "HP recuperados" : "HP restados"}: ${name}`,
          details: [hpDetail(old.pokemon, changed.pokemon)],
        }
      : null;
  }
  if (
    ["party/learnPokemonMoveWithTm", "party/learnInitialMove"].includes(
      actionType,
    )
  ) {
    const learned = changed.moves?.find(
      (m) => !old.moves?.some((o) => o.id === m.id),
    );
    if (!learned) return null;
    const replaced = old.moves?.find(
      (m) => !changed.moves?.some((n) => n.id === m.id),
    );
    const tm = actionType === "party/learnPokemonMoveWithTm";
    return {
      ...common,
      kind: tm ? "tm" : "learn",
      title: `${tm ? "TM utilizada" : "Movimiento inicial aprendido"}: ${name}`,
      details: [
        replaced
          ? `${replaced.displayName} → ${learned.displayName}`
          : `Aprendió ${learned.displayName}.`,
        tm
          ? "Uso de 1 carta TM declarado por el jugador."
          : "Elección gratuita del inicial.",
      ],
    };
  }
  if (
    [
      "party/changePokemonBattleStage",
      "party/resetPokemonBattleStages",
    ].includes(actionType)
  ) {
    const details = stageChanges(
      old.pokemon.battleStages,
      changed.pokemon.battleStages,
    );
    return details.length
      ? {
          ...common,
          kind: "stages",
          title: `Modificadores de combate: ${name}`,
          details,
        }
      : null;
  }
  const oldStatuses = statusNames(old),
    newStatuses = statusNames(changed);
  return oldStatuses !== newStatuses
    ? {
        ...common,
        kind: "status",
        title: `Estados modificados: ${name}`,
        details: [`${oldStatuses} → ${newStatuses}`],
      }
    : null;
}
