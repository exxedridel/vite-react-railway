/** Two independent trainer parties share one native Gen III battle and PRNG. */
import { Battle, Dex, toID } from "@pkmn/sim";
import type { Side, Pokemon as SimPokemon } from "@pkmn/sim";
import type { BattleResult } from "@/types/battle";
import { STATUS_OPTIONS } from "@/types/pokemon";
import { getCurrentHp, neutralBattleStages } from "@/lib/pokemonStats";
import { clearBattleConditions } from "@/lib/pokemonCondition";
import { installRollAudit } from "@/lib/emerald/audit";
import { turnHighlights } from "@/lib/emerald/highlights";
import {
  createEmeraldPokemonSet,
  applyEmeraldStats,
  applyEmeraldStages,
  readEmeraldStages,
  syncEmeraldStatus,
  readEmeraldStatus,
  readEmeraldRequest,
  chooseEmeraldAction,
  emeraldPublicLines,
  describeEmeraldLine,
} from "@/lib/emerald/engine";
import type {
  TrainerBattleSession,
  TrainerChoice,
  TrainerSide,
  TrainerTurnSummary,
} from "./types";
import { trainerSetupErrors } from "./model";

const dex = Dex.forGen(3);
const sides = ["a", "b"] as const;
const weatherIds = {
  rain: "raindance",
  sun: "sunnyday",
  sand: "sandstorm",
  hail: "hail",
} as const;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const actorKey = (value = "") => value.replace(/^p[12][a-z]?: /, "");
const FULL_RESTORE_EVENT = "trainerfullrestore";
const restoredVolatiles = [
  "confusion",
  "attract",
  "taunt",
  "torment",
  "flinch",
  "partiallytrapped",
  "trapped",
  "disable",
  "encore",
  "perishsong",
  "leechseed",
  "curse",
  "nightmare",
  "yawn",
  "foresight",
] as const;
function entries(session: TrainerBattleSession) {
  return sides.flatMap((side) =>
    session.teams[side].pokemons.map((capture, index) => ({
      key: `${side}${index}`,
      side,
      capture,
      label: `${capture.pokemon.name} (${session.teams[side].name})`,
    })),
  );
}
function simSide(battle: Battle, side: TrainerSide): Side {
  return side === "a" ? battle.p1 : battle.p2;
}
function prepareInitialRequests(battle: Battle) {
  for (const pokemon of battle.getAllActive()) {
    pokemon.maybeDisabled = pokemon.maybeLocked = false;
    for (const slot of pokemon.moveSlots) {
      slot.disabled = false;
      slot.disabledSource = "";
    }
    battle.runEvent("DisableMove", pokemon);
    for (const slot of pokemon.moveSlots)
      battle.singleEvent(
        "DisableMove",
        battle.dex.getActiveMove(slot.id),
        null,
        pokemon,
      );
    pokemon.trapped = pokemon.maybeTrapped = false;
    battle.runEvent("TrapPokemon", pokemon);
    if (!pokemon.knownType || battle.dex.getImmunity("trapped", pokemon))
      battle.runEvent("MaybeTrapPokemon", pokemon);
  }
  battle.makeRequest("move");
}
function orderedTeam(session: TrainerBattleSession, side: TrainerSide) {
  const team = entries(session).filter((entry) => entry.side === side);
  return [
    ...team.filter(
      (entry) =>
        entry.capture.captureId === session.teams[side].activeCaptureId,
    ),
    ...team.filter(
      (entry) =>
        entry.capture.captureId !== session.teams[side].activeCaptureId,
    ),
  ];
}
function initialPokemonSet(entry: ReturnType<typeof entries>[number]) {
  const set = createEmeraldPokemonSet(entry.capture, entry.key);
  const gender = entry.capture.trainerStatusContext?.gender;
  if (gender) set.gender = gender;
  return set;
}
function exportSession(
  session: TrainerBattleSession,
  battle: Battle,
  pending: Partial<Record<TrainerSide, TrainerChoice>>,
  serial: number,
) {
  const roster = entries(session);
  for (const side of sides) {
    const simulated = simSide(battle, side);
    for (const pokemon of simulated.pokemon) {
      const capture = roster.find(
        (entry) => entry.key === pokemon.set.name && entry.side === side,
      )?.capture;
      if (!capture)
        throw new Error(
          "El equipo cambió durante el combate. Vuelve a preparar la batalla.",
        );
      const hp = capture.pokemon.stats.find((stat) => stat.name === "hp");
      if (hp) hp.value = pokemon.hp;
      capture.pokemon.battleStages = readEmeraldStages(pokemon);
      readEmeraldStatus(pokemon, capture);
      // Native Perish Song uses duration; imported board counters use the same visible count.
      if (pokemon.volatiles.perishsong)
        capture.statusTurns = {
          ...capture.statusTurns,
          "perish-song": Math.max(
            1,
            Math.min(6, pokemon.volatiles.perishsong.duration ?? 1),
          ),
        };
    }
    session.teams[side].activeCaptureId =
      roster.find((entry) => entry.key === simulated.active[0]?.set.name)
        ?.capture.captureId ?? null;
  }
  const weather = Object.entries(weatherIds).find(
    ([, id]) => id === battle.field.weather,
  )?.[0] as keyof typeof weatherIds | undefined;
  session.weather = weather
    ? {
        kind: weather,
        turnsLeft: battle.field.weatherState.duration || 5,
        ...(!battle.field.weatherState.duration ? { permanent: true } : {}),
      }
    : null;
  const winner = !battle.ended
    ? null
    : battle.winner === battle.p1.name
      ? "a"
      : battle.winner === battle.p2.name
        ? "b"
        : "draw";
  session.phase = battle.ended ? "finished" : "battle";
  session.runtime = {
    engine: "",
    serial,
    turn: battle.turn,
    pending,
    requests: {
      a: readEmeraldRequest(battle.p1),
      b: readEmeraldRequest(battle.p2),
    },
    ended: battle.ended,
    winner,
  };
  if (battle.ended)
    for (const team of Object.values(session.teams))
      for (const capture of team.pokemons) clearBattleConditions(capture);
  // Logs live in bounded session summaries; retain all actual state, PP, move history and PRNG.
  battle.log.length = 0;
  battle.inputLog.length = 0;
  battle.messageLog.length = 0;
  battle.sentLogPos = 0;
  battle.lastMoveLine = -1;
  session.runtime.engine = JSON.stringify(battle.toJSON());
  return session;
}

export function startTrainerBattle(
  input: TrainerBattleSession,
  seed: [number, number, number, number],
): TrainerBattleSession {
  if (input.phase !== "setup")
    throw new Error("Vuelve a la preparación antes de iniciar otra batalla.");
  const session = clone(input);
  const errors = trainerSetupErrors(session);
  if (errors.length) throw new Error(errors.join(" "));
  const battle = new Battle({
    formatid: toID("gen3customgame"),
    seed: seed.join(",") as `${number},${string}`,
    // Unique simulator names keep winner attribution reliable even when trainers share a name.
    p1: {
      name: "Entrenador A",
      team: orderedTeam(session, "a").map(initialPokemonSet),
    },
    p2: {
      name: "Entrenador B",
      team: orderedTeam(session, "b").map(initialPokemonSet),
    },
  });
  const roster = entries(session);
  for (const side of sides) {
    const simulated = simSide(battle, side);
    for (const pokemon of simulated.pokemon) {
      const capture = roster.find(
        (entry) => entry.key === pokemon.set.name,
      )!.capture;
      applyEmeraldStats(pokemon, capture.pokemon);
      applyEmeraldStages(pokemon, capture.pokemon.battleStages);
      const fainted = pokemon.hp === 0;
      // Imported board state can retain primary conditions on a fainted reserve.
      // Seed those conditions before restoring its KO flag; it remains unavailable.
      if (fainted) {
        pokemon.hp = 1;
        pokemon.fainted = false;
      }
      syncEmeraldStatus(
        pokemon,
        {
          ...capture,
          statuses: capture.statuses?.filter(
            (status) => status !== "disabled" && status !== "encored",
          ),
        },
        undefined,
        simulated.foe.active[0],
      );
      // Pre-existing Disable and Encore target explicit moves, which may differ.
      for (const [status, effect, moveId] of [
        ["disabled", "disable", capture.trainerStatusContext?.disabledMoveId],
        ["encored", "encore", capture.trainerStatusContext?.encoredMoveId],
      ] as const) {
        if (!capture.statuses?.includes(status) || moveId === undefined)
          continue;
        const move = dex.moves
          .all()
          .find((move) => move.num === moveId && !move.realMove);
        if (!move)
          throw new Error("El movimiento afectado no pertenece a Gen III.");
        pokemon.lastMove = dex.getActiveMove(move.id);
        pokemon.addVolatile(
          effect,
          simulated.foe.active[0],
          dex.getActiveMove(effect),
        );
        const state = pokemon.volatiles[effect];
        const turns = capture.statusTurns?.[status];
        if (state && turns !== undefined) state.duration = turns;
      }
      const represented: Parameters<typeof readEmeraldStatus>[1] = {};
      readEmeraldStatus(pokemon, represented);
      const missing =
        capture.statuses?.filter(
          (status) => !represented.statuses?.includes(status),
        ) ?? [];
      if (missing.length) {
        const labels = missing
          .map(
            (status) =>
              STATUS_OPTIONS.find((option) => option.id === status)?.label ??
              status,
          )
          .join(", ");
        throw new Error(
          `${capture.pokemon.name}: ${labels} requiere un contexto previo compatible. Retira ese estado de la preparación y aplícalo mediante movimientos durante el combate.`,
        );
      }
      if (pokemon.volatiles.perishsong && capture.statusTurns?.["perish-song"])
        pokemon.volatiles.perishsong.duration =
          capture.statusTurns["perish-song"];
      if (fainted) {
        pokemon.hp = 0;
        pokemon.fainted = true;
      }
      for (const slot of pokemon.moveSlots)
        slot.pp = slot.maxpp = dex.moves.get(slot.id).pp;
    }
    simulated.pokemonLeft = simulated.pokemon.filter(
      (pokemon) => pokemon.hp > 0,
    ).length;
  }
  if (session.weather) {
    battle.field.setWeather(
      weatherIds[session.weather.kind],
      battle.p1.active[0],
    );
    battle.field.weatherState.duration = session.weather.permanent
      ? 0
      : session.weather.turnsLeft;
  }
  prepareInitialRequests(battle);
  session.history = [];
  return exportSession(session, battle, {}, 0);
}

function loadBattle(input: TrainerBattleSession) {
  if (input.phase !== "battle" || !input.runtime || input.runtime.ended)
    throw new Error("No hay un combate activo.");
  return Battle.fromJSON(input.runtime.engine);
}

function chooseTrainerItem(
  session: TrainerBattleSession,
  battle: Battle,
  side: TrainerSide,
  choice: Extract<TrainerChoice, { kind: "item" }>,
) {
  const simulated = simSide(battle, side);
  const request = readEmeraldRequest(simulated);
  if (choice.item !== "full-restore")
    throw new Error("Este objeto no está disponible.");
  if (battle.requestState !== "move" || request.forceSwitch || request.waiting)
    throw new Error("Elige el reemplazo obligatorio antes de usar un objeto.");
  if (request.locked)
    throw new Error(
      "Debes completar el movimiento forzado o la recarga antes de usar un objeto.",
    );
  if (
    !session.teams[side].pokemons.some(
      (capture) => capture.captureId === choice.captureId,
    )
  )
    throw new Error("El objeto solo puede usarse en un Pokémon de tu equipo.");
  simulated.clearChoice();
  // The native queue accepts serializable event actions. Side's public choice
  // type is narrower than the queue's supported ActionChoice union.
  const action = {
    choice: "event",
    event: FULL_RESTORE_EVENT,
    pokemon: simulated.active[0],
    order: 102,
    priority: 8,
  };
  simulated.choice.actions.push(
    action as unknown as (typeof simulated.choice.actions)[number],
  );
}

function applyTrainerFullRestore(
  session: TrainerBattleSession,
  battle: Battle,
  actingPokemon: SimPokemon,
  pending: Partial<Record<TrainerSide, TrainerChoice>>,
) {
  const side: TrainerSide = actingPokemon.side.id === "p1" ? "a" : "b";
  const choice = pending[side];
  if (choice?.kind !== "item" || choice.item !== "full-restore")
    throw new Error("El objeto pendiente ya no es válido.");
  const entry = entries(session).find(
    (entry) =>
      entry.side === side && entry.capture.captureId === choice.captureId,
  );
  const target = actingPokemon.side.pokemon.find(
    (pokemon) => pokemon.set.name === entry?.key,
  );
  if (!entry || !target)
    throw new Error("El objetivo del objeto ya no pertenece al equipo.");
  battle.add(
    "message",
    `${session.teams[side].name} usó Full restore en ${entry.capture.pokemon.name}.`,
  );
  target.hp = target.maxhp;
  target.fainted = false;
  target.faintQueued = false;
  target.subFainted = false;
  const oldStatus = target.status;
  target.clearStatus();
  if (oldStatus)
    battle.add("-curestatus", target, oldStatus, "[from] item: Full restore");
  for (const effect of restoredVolatiles) {
    if (!target.volatiles[effect]) continue;
    // These native End callbacks apply the condition's harm instead of curing it.
    if (effect === "perishsong" || effect === "yawn")
      delete target.volatiles[effect];
    else target.removeVolatile(effect);
  }
  applyEmeraldStages(target, neutralBattleStages());
  actingPokemon.side.pokemonLeft = actingPokemon.side.pokemon.filter(
    (pokemon) => pokemon.hp > 0 && !pokemon.fainted,
  ).length;
  battle.add(
    "-heal",
    target,
    `${target.hp}/${target.maxhp}`,
    "[from] item: Full restore",
  );
  battle.add("-clearboost", target, "[from] item: Full restore");
  battle.add(
    "message",
    `${entry.capture.pokemon.name}: estados negativos y contadores eliminados; todos los modificadores de combate restablecidos a 0.`,
  );
  battle.add("boardend");
}

function resultsFrom(
  lines: string[],
  before: TrainerBattleSession,
  id: string,
): BattleResult[] {
  const roster = entries(before);
  const names = Object.fromEntries(
    roster.map((entry) => [entry.key, entry.label]),
  );
  const hp = Object.fromEntries(
    roster.map((entry) => [entry.key, getCurrentHp(entry.capture.pokemon)]),
  );
  const active: Record<TrainerSide, string> = {
    a: roster.find(
      (entry) =>
        entry.side === "a" &&
        entry.capture.captureId === before.teams.a.activeCaptureId,
    )!.key,
    b: roster.find(
      (entry) =>
        entry.side === "b" &&
        entry.capture.captureId === before.teams.b.activeCaptureId,
    )!.key,
  };
  const output: BattleResult[] = [];
  let current: BattleResult | undefined;
  let attacker = "";
  for (const line of lines) {
    const values = line.split("|");
    const event = values[1];
    if (["switch", "drag"].includes(event)) {
      active[values[2].startsWith("p1") ? "a" : "b"] = actorKey(values[2]);
      current = undefined;
    }
    if (event === "move" || event === "cant") {
      if (
        event === "move" &&
        values.some((value) => value.startsWith("[from] move:")) &&
        current
      ) {
        current.effectMessages!.push(`Movimiento invocado: ${values[3]}.`);
        continue;
      }
      const side = values[2].startsWith("p1") ? "a" : "b";
      attacker = actorKey(values[2]);
      const target =
        values[3] && event === "move"
          ? actorKey(values[4])
          : active[side === "a" ? "b" : "a"];
      const defender = names[target]
        ? target
        : active[side === "a" ? "b" : "a"];
      const move = event === "move" ? dex.moves.get(values[3]) : undefined;
      current = {
        id: `${id}:${output.length}`,
        captureId: roster.find((entry) => entry.key === attacker)!.capture
          .captureId,
        actorSide: side === "a" ? "player" : "opponent",
        attackerName: names[attacker],
        opponentName: names[defender],
        moveId: move?.num ?? 0,
        moveName: move?.name ?? "Acción impedida",
        outcome: event === "cant" ? "blocked" : "status",
        message:
          event === "cant"
            ? `No pudo actuar: ${values[3]}`
            : values.includes("[still]")
              ? "Preparando movimiento"
              : "Movimiento ejecutado",
        hitChance: null,
        accuracyRoll: null,
        criticalChance: 0,
        criticalRoll: null,
        critical: false,
        damage: 0,
        appliedDamage: 0,
        wildHpBefore: null,
        wildHpAfter: null,
        level:
          roster.find((entry) => entry.key === attacker)!.capture.pokemon
            .level ?? 5,
        attack: null,
        defense: null,
        attackStage: null,
        defenseStage: null,
        baseDamage: null,
        stab: 1,
        effectiveness: 1,
        burn: 1,
        manualEffect: null,
        engine: "emerald",
        protocol: [],
        effectMessages: [],
        hpChanges: [],
      };
      output.push(current);
    }
    if (["boardend", "upkeep", "turn", "win", "tie"].includes(event))
      current = undefined;
    if (event === "-damage" || event === "-heal") {
      const target = actorKey(values[2]);
      const old = hp[target] ?? 0;
      const next = parseInt(values[3], 10);
      hp[target] = next;
      if (current) {
        const role = target === attacker ? "attacker" : "target";
        const change = current.hpChanges!.find(
          (entry) => entry.role === role && entry.name === names[target],
        );
        if (change) change.after = next;
        else
          current.hpChanges!.push({
            role,
            name: names[target] ?? target,
            before: old,
            after: next,
          });
        if (
          event === "-damage" &&
          role === "target" &&
          !values.some((value) => value.startsWith("[from]"))
        ) {
          current.appliedDamage = current.damage += Math.max(0, old - next);
          current.outcome = "hit";
        }
      }
    }
    if (!current) continue;
    current.protocol!.push(line);
    if (event === "-crit") current.critical = true;
    if (event === "-immune") current.outcome = "immune";
    if (event === "-fail" || event === "-miss") {
      current.outcome = "miss";
      current.message = "El movimiento falló.";
    }
    const description = describeEmeraldLine(line, names);
    if (description) current.effectMessages!.push(description);
  }
  return output;
}

export function chooseTrainerAction(
  input: TrainerBattleSession,
  side: TrainerSide,
  choice: TrainerChoice,
): TrainerBattleSession {
  const session = clone(input);
  const battle = loadBattle(session);
  const runtime = session.runtime!;
  const simulated = simSide(battle, side);
  if (runtime.pending[side])
    throw new Error("Este jugador ya eligió una acción. Cancélala primero.");
  if (readEmeraldRequest(simulated).waiting)
    throw new Error("Este jugador debe esperar el reemplazo rival.");
  const pending = clone(runtime.pending);
  if (choice.kind === "item") chooseTrainerItem(session, battle, side, choice);
  else {
    let internal = choice;
    if (choice.kind === "switch") {
      const entry = entries(session).find(
        (entry) =>
          entry.side === side && entry.capture.captureId === choice.captureId,
      );
      if (!entry) throw new Error("El reemplazo no pertenece al equipo.");
      internal = { kind: "switch", captureId: entry.key };
    }
    chooseEmeraldAction(battle, simulated, internal);
  }
  pending[side] = clone(choice);
  for (const forcedSide of sides) {
    const player = simSide(battle, forcedSide);
    const request = readEmeraldRequest(player);
    if (
      !pending[forcedSide] &&
      request.locked &&
      !request.forceSwitch &&
      !request.waiting &&
      request.moves.length === 1 &&
      !request.moves[0].disabled
    ) {
      const forced: TrainerChoice = {
        kind: "move",
        moveId: request.moves[0].id,
      };
      chooseEmeraldAction(battle, player, forced);
      pending[forcedSide] = forced;
    }
  }
  const committed = battle.allChoicesDone();
  const turn = battle.turn;
  const start = battle.log.length;
  if (committed) {
    const original = battle.runAction;
    battle.runAction = function (action) {
      if (action.choice === "event" && action.event === FULL_RESTORE_EVENT)
        applyTrainerFullRestore(session, this, action.pokemon, pending);
      const result = original.call(this, action);
      if (action.choice === "move") this.add("boardend");
      return result;
    };
    const uninstall = installRollAudit(battle);
    try {
      battle.commitChoices();
    } finally {
      uninstall();
      Reflect.deleteProperty(battle, "runAction");
    }
    delete pending.a;
    delete pending.b;
  }
  const raw = emeraldPublicLines(battle.log.slice(start));
  if (committed) {
    const id = `${session.id}:${runtime.serial + 1}`;
    const roster = entries(input);
    const names = Object.fromEntries(
      roster.map((entry) => [entry.key, entry.label]),
    );
    const initialHp = Object.fromEntries(
      roster.map((entry) => [entry.key, getCurrentHp(entry.capture.pokemon)]),
    );
    const summary: TrainerTurnSummary = {
      id,
      turn,
      completed: true,
      results: resultsFrom(raw, input, id),
      events: raw
        .map((line) => describeEmeraldLine(line, names))
        .filter((event): event is string => !!event),
      highlights: turnHighlights(raw, names, initialHp),
    };
    session.history = [summary, ...session.history].slice(0, 50);
  }
  return exportSession(session, battle, pending, runtime.serial + 1);
}

export function cancelTrainerAction(
  input: TrainerBattleSession,
  side: TrainerSide,
): TrainerBattleSession {
  const session = clone(input);
  const battle = loadBattle(session);
  const runtime = session.runtime!;
  if (!runtime.pending[side]) return session;
  const player = simSide(battle, side);
  battle.undoChoice(side === "a" ? "p1" : "p2");
  if (player.choice.actions.length)
    throw new Error("Esta acción ya no se puede cancelar.");
  const pending = clone(runtime.pending);
  delete pending[side];
  return exportSession(session, battle, pending, runtime.serial + 1);
}
