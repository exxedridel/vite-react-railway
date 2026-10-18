import { runEmeraldAction } from "../src/lib/emerald/engine";
import {
  createLeveledPokemon,
  neutralBattleStages,
  getCurrentHp,
} from "../src/lib/pokemonStats";
import { emptyBattleField } from "../src/lib/battleField";
import { getWildMove } from "../src/lib/emerald/moveInfo";
import type { CombatState } from "../src/lib/emerald/types";
function run() {
  const p = createLeveledPokemon(
    {
      id: 6,
      name: "charizard",
      image: null,
      types: ["fire", "flying"],
      stats: [
        "hp",
        "attack",
        "defense",
        "special-attack",
        "special-defense",
        "speed",
      ].map((name) => ({ name, value: 100 })),
    },
    undefined,
    50,
  );
  const f = createLeveledPokemon(
    { ...p, id: 143, name: "snorlax", types: ["normal"] },
    p.baseStats,
    50,
  );
  const mv = (id: number) => ({
    ...getWildMove({
      id,
      name: "",
      displayName: "",
      type: "normal",
      damageClass: "status",
      power: null,
      accuracy: null,
      pp: 20,
      priority: 0,
      description: "",
    }),
    source: "wild" as const,
  });
  const field = emptyBattleField();
  field.activeCaptureId = "012345678901234567890";
  let s: CombatState = {
    pokemons: [
      {
        captureId: field.activeCaptureId,
        pokemon: p,
        moves: [mv(19)],
        statuses: [],
      },
    ],
    opponent: {
      pokemon: f,
      kind: "wild",
      encounterId: "test",
      moves: [mv(150)],
      stages: neutralBattleStages(),
      statuses: [],
    },
    battleField: field,
  };
  const seed: [number, number, number, number] = [1, 2, 3, 4];
  s = runEmeraldAction(
    s,
    field.activeCaptureId,
    "player",
    { kind: "move", moveId: 19 },
    seed,
    "a",
  );
  s = runEmeraldAction(
    JSON.parse(JSON.stringify(s)),
    field.activeCaptureId,
    "opponent",
    { kind: "move", moveId: 150 },
    seed,
    "b",
  );
  if (!s.emerald?.requests.player.locked) throw new Error("Fly did not charge");
  const before = getCurrentHp(s.opponent!.pokemon);
  s = runEmeraldAction(
    JSON.parse(JSON.stringify(s)),
    field.activeCaptureId,
    "opponent",
    { kind: "move", moveId: 150 },
    seed,
    "c",
  );
  if (s.battleField?.turn !== 3 || getCurrentHp(s.opponent!.pokemon) >= before)
    throw new Error("Minified browser restore failed");
  return {
    turn: s.battleField.turn,
    hp: getCurrentHp(s.opponent!.pokemon),
    snapshotBytes: s.emerald!.engine.length,
  };
}
(
  globalThis as unknown as { emeraldBrowserSmoke: unknown }
).emeraldBrowserSmoke = run();
