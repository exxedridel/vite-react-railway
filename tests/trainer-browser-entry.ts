import {
  createTrainerBattleSession,
  readTrainerBattleSession,
  writeTrainerBattleSession,
} from "../src/lib/trainerBattle/model";
import { trainerMoves, trainerSpecies } from "../src/lib/trainerBattle/catalog";
import {
  startTrainerBattle,
  chooseTrainerAction,
} from "../src/lib/trainerBattle/engine";
import {
  createLeveledPokemon,
  getCurrentHp,
  getMaxHp,
} from "../src/lib/pokemonStats";
import type { TrainerPokemon } from "../src/lib/trainerBattle/types";

function member(id: number, captureId: string): TrainerPokemon {
  const species = trainerSpecies.find((s) => s.id === id)!;
  return {
    captureId,
    pokemon: createLeveledPokemon(
      {
        id,
        name: species.name,
        image: null,
        types: species.types,
        stats: species.baseStats,
      },
      species.baseStats,
      50,
    ),
    moves: [33, 150].map((id) => trainerMoves.find((move) => move.id === id)!),
    statuses: [],
    statusTurns: {},
  };
}

const draft = createTrainerBattleSession();
draft.teams.a.pokemons = [member(143, "a-main"), member(242, "a-bench")];
draft.teams.b.pokemons = [member(143, "b-main"), member(242, "b-bench")];
draft.teams.a.activeCaptureId = "a-main";
draft.teams.b.activeCaptureId = "b-main";
draft.teams.a.pokemons[0].statuses = ["poisoned"];
const initial = startTrainerBattle(draft, [1, 2, 3, 4]);
const pending = chooseTrainerAction(initial, "a", { kind: "move", moveId: 33 });
let saved = "";
const storage = {
  getItem: () => saved,
  setItem: (_key: string, value: string) => {
    saved = value;
  },
};
writeTrainerBattleSession(storage, pending);
const loaded = readTrainerBattleSession(storage)!;
let session = chooseTrainerAction(loaded, "b", { kind: "move", moveId: 150 });
if (session.runtime?.turn !== 2 || session.history.length !== 1)
  throw new Error("Trainer browser reload failed to resolve the queued turn.");
const outgoingHp = getCurrentHp(session.teams.a.pokemons[0].pokemon);
session = chooseTrainerAction(session, "a", {
  kind: "switch",
  captureId: "a-bench",
});
session = chooseTrainerAction(session, "b", { kind: "move", moveId: 33 });
if (
  session.teams.a.activeCaptureId !== "a-bench" ||
  session.runtime?.turn !== 3
)
  throw new Error("Trainer browser switch did not consume an action.");
if (
  getCurrentHp(session.teams.a.pokemons[0].pokemon) !== outgoingHp ||
  !session.teams.a.pokemons[0].statuses?.includes("poisoned")
)
  throw new Error("Trainer browser switch lost HP or primary conditions.");
writeTrainerBattleSession(storage, session);
if (
  JSON.stringify(readTrainerBattleSession(storage)) !== JSON.stringify(session)
)
  throw new Error("Trainer browser persistence did not retain both parties.");
const beforeItem = JSON.stringify(session.teams);
session = chooseTrainerAction(session, "a", {
  kind: "item",
  item: "full-restore",
  captureId: "a-main",
});
if (JSON.stringify(session.teams) !== beforeItem)
  throw new Error(
    "Trainer browser item leaked its effect before both choices.",
  );
writeTrainerBattleSession(storage, session);
session = chooseTrainerAction(readTrainerBattleSession(storage)!, "b", {
  kind: "move",
  moveId: 150,
});
if (
  session.runtime?.turn !== 4 ||
  getCurrentHp(session.teams.a.pokemons[0].pokemon) !==
    getMaxHp(session.teams.a.pokemons[0].pokemon) ||
  session.teams.a.pokemons[0].statuses?.length
)
  throw new Error(
    "Trainer browser item reload failed to heal the reserve and consume its turn.",
  );
writeTrainerBattleSession(storage, session);
const futureSetup = createTrainerBattleSession();
futureSetup.teams.a = {
  name: "Source",
  activeCaptureId: "future-source",
  pokemons: [member(65, "future-source")],
};
futureSetup.teams.b = {
  name: "Target",
  activeCaptureId: "future-target",
  pokemons: [member(143, "future-target")],
};
futureSetup.teams.a.pokemons[0].moves = [248, 150].map(
  (id) => trainerMoves.find((move) => move.id === id)!,
);
// Fixed seed with a successful native 90% Future Sight accuracy check.
let futureSession = startTrainerBattle(futureSetup, [1, 2, 3, 5]);
const futureInitialHp = getCurrentHp(futureSession.teams.b.pokemons[0].pokemon);
for (let turn = 1; turn <= 3; turn++) {
  futureSession = chooseTrainerAction(futureSession, "a", {
    kind: "move",
    moveId: turn === 1 ? 248 : 150,
  });
  writeTrainerBattleSession(storage, futureSession);
  futureSession = chooseTrainerAction(readTrainerBattleSession(storage)!, "b", {
    kind: "move",
    moveId: 150,
  });
  if (
    turn < 3 &&
    getCurrentHp(futureSession.teams.b.pokemons[0].pokemon) !== futureInitialHp
  )
    throw new Error(
      "Future Sight hit before its delayed turn in the minified browser engine.",
    );
}
const futureImpact = futureSession.history[0].results.find(
  (result) => result.moveId === 248,
);
if (
  !futureImpact ||
  futureImpact.appliedDamage <= 0 ||
  futureImpact.appliedDamage !==
    futureInitialHp - getCurrentHp(futureSession.teams.b.pokemons[0].pokemon)
)
  throw new Error(
    "Minified browser Future Sight delayed result: " +
      JSON.stringify({
        before: futureInitialHp,
        after: getCurrentHp(futureSession.teams.b.pokemons[0].pokemon),
        results: futureSession.history[0].results.map((result) => ({
          moveId: result.moveId,
          outcome: result.outcome,
          damage: result.appliedDamage,
          message: result.message,
        })),
      }),
  );
Object.assign(globalThis, {
  trainerBrowserSmoke: {
    turn: session.runtime.turn,
    teams: [session.teams.a.pokemons.length, session.teams.b.pokemons.length],
    savedBytes: saved.length,
    futureSightDamage: futureImpact.appliedDamage,
  },
});
