import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import TrainerBattleView from "../src/components/admin/TrainerBattleView";
import { trainerMoves, trainerSpecies } from "../src/lib/trainerBattle/catalog";
import {
  startTrainerBattle,
  chooseTrainerAction,
  cancelTrainerAction,
} from "../src/lib/trainerBattle/engine";
import { createTrainerBattleSession } from "../src/lib/trainerBattle/model";
import { createLeveledPokemon } from "../src/lib/pokemonStats";
import type {
  TrainerBattleSession,
  TrainerPokemon,
  TrainerSide,
} from "../src/lib/trainerBattle/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function member(
  captureId: string,
  speciesId: number,
  moveId: number,
): TrainerPokemon {
  const species = trainerSpecies.find(
    (candidate) => candidate.id === speciesId,
  )!;
  return {
    captureId,
    pokemon: createLeveledPokemon(
      {
        id: speciesId,
        name: species.name,
        image: null,
        types: [...species.types],
        stats: clone(species.baseStats),
      },
      undefined,
      50,
    ),
    moves: [clone(trainerMoves.find((candidate) => candidate.id === moveId)!)],
    statuses: [],
    statusTurns: {},
  };
}
const setup = createTrainerBattleSession();
setup.id = "privacy-render-regression";
setup.teams = {
  a: {
    name: "Ana",
    activeCaptureId: "a-active",
    pokemons: [member("a-active", 25, 85), member("a-reserve", 131, 57)],
  },
  b: {
    name: "Bruno",
    activeCaptureId: "b-active",
    pokemons: [member("b-active", 4, 53), member("b-reserve", 94, 94)],
  },
};
// Every item target has a condition to cure; queueing must still leave it private.
for (const team of Object.values(setup.teams)) {
  for (const capture of team.pokemons) {
    const hp = capture.pokemon.stats.find((stat) => stat.name === "hp")!;
    hp.value = Math.max(1, hp.value - 10);
    capture.statuses = ["poisoned"];
  }
}
const started = startTrainerBattle(setup, [1, 2, 3, 4]);
function render(session: TrainerBattleSession) {
  return renderToStaticMarkup(
    <TrainerBattleView
      session={session}
      onChange={() => {}}
      onEditSetup={() => {}}
    />,
  );
}
/** Select the actual public control section; all assertions inspect rendered DOM markup. */
function controls(markup: string, side: TrainerSide) {
  const label = `aria-label="Controles de ${started.teams[side].name}"`;
  const labelPosition = markup.indexOf(label);
  assert(labelPosition >= 0, `${side}: rendered controls must exist`);
  const start = markup.lastIndexOf("<section", labelPosition);
  const end = markup.indexOf("</section>", labelPosition);
  assert(
    start >= 0 && end > labelPosition,
    `${side}: controls must be a complete section`,
  );
  return markup.slice(start, end + "</section>".length);
}
function assertOptionsAvailable(markup: string, side: TrainerSide) {
  const panel = controls(markup, side);
  assert(
    panel.includes(`aria-label="Movimientos de ${started.teams[side].name}"`),
    `${side}: move options must be available`,
  );
  assert(
    panel.includes("cambiar Pokémon"),
    `${side}: party switching must be available`,
  );
  assert(
    panel.includes(started.teams[side].pokemons[1].pokemon.name),
    `${side}: reserve must be available`,
  );
  assert(
    panel.includes("Estados y stats de combate"),
    `${side}: combat details must be available`,
  );
  return panel;
}
const baseline = render(started);
for (const side of ["a", "b"] as const) assertOptionsAvailable(baseline, side);

for (const side of ["a", "b"] as const) {
  const other = side === "a" ? "b" : "a";
  const move = started.teams[side].pokemons[0].moves![0];
  const active = started.teams[side].pokemons[0];
  const reserve = started.teams[side].pokemons[1];
  const queuedMove = chooseTrainerAction(started, side, {
    kind: "move",
    moveId: move.id,
  });
  const queuedSwitch = chooseTrainerAction(started, side, {
    kind: "switch",
    captureId: reserve.captureId,
  });
  const queuedActiveItem = chooseTrainerAction(started, side, {
    kind: "item",
    item: "full-restore",
    captureId: active.captureId,
  });
  const queuedReserveItem = chooseTrainerAction(started, side, {
    kind: "item",
    item: "full-restore",
    captureId: reserve.captureId,
  });
  const privatePanels: string[] = [];
  for (const pending of [
    queuedMove,
    queuedSwitch,
    queuedActiveItem,
    queuedReserveItem,
  ]) {
    const markup = render(pending);
    const panel = controls(markup, side);
    assert(
      panel.includes("Acción elegida"),
      `${side}: only the generic pending message should remain`,
    );
    assert(
      panel.includes("Cancelar elección"),
      `${side}: the pending choice must remain cancellable`,
    );
    assert(
      !panel.includes("Movimientos de"),
      `${side}: pending moves must not be in the DOM`,
    );
    assert(
      !panel.includes("cambiar Pokémon"),
      `${side}: pending party selector must not be in the DOM`,
    );
    assert(
      !panel.includes("Estados y stats de combate"),
      `${side}: pending combat details must not be in the DOM`,
    );
    assert(
      !panel.includes(move.displayName),
      `${side}: the chosen move must not be disclosed`,
    );
    assert(
      !/full restore|full-restore/i.test(panel),
      `${side}: the pending item and its controls must not be disclosed`,
    );
    assert(
      !panel.includes(active.captureId) && !panel.includes(reserve.captureId),
      `${side}: neither private item target identifier may appear in pending controls`,
    );
    assert(
      !markup.includes(reserve.pokemon.name),
      `${side}: reserve names must not leak elsewhere in the DOM`,
    );
    assertOptionsAvailable(markup, other);
    assert.deepEqual(
      pending.teams,
      started.teams,
      `${side}: pending choices must not apply item HP/status changes or reveal their target`,
    );
    privatePanels.push(panel);

    const restored = clone(pending);
    assert.equal(
      controls(render(restored), side),
      panel,
      `${side}: restoring pending JSON must preserve privacy`,
    );
    assert.deepEqual(
      restored.runtime!.pending[side],
      pending.runtime!.pending[side],
      `${side}: JSON reload must retain the exact queued action and item target`,
    );
    const cancelled = cancelTrainerAction(restored, side);
    const cancelledMarkup = render(cancelled);
    assert.equal(
      controls(cancelledMarkup, side),
      controls(baseline, side),
      `${side}: cancellation must restore the original controls`,
    );
    assertOptionsAvailable(cancelledMarkup, other);
    assert.deepEqual(
      cancelled.teams,
      started.teams,
      `${side}: cancellation must leave HP and statuses untouched`,
    );
  }
  for (const panel of privatePanels.slice(1))
    assert.equal(
      panel,
      privatePanels[0],
      `${side}: pending move, switch, active item and reserve item must render identical controls`,
    );
}

export const trainerPrivacySmoke = {
  pendingScenarios: 8,
  queuedItemTargets: 4,
  jsonReloads: 8,
  cancellations: 8,
  identicalMoveSwitchAndItemPanels: 2,
};
