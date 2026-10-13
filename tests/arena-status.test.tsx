import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import reducer from "../src/slices/partySlice";
import {
  createLeveledPokemon,
  neutralBattleStages,
} from "../src/lib/pokemonStats";
import { emptyBattleField } from "../src/lib/battleField";
import { findSpriteBounds } from "../src/lib/spriteBounds";
import type { BattleOpponent } from "../src/lib/battleOpponent";
import Arena from "../src/components/pokemon/PokemonBattleArena";
import Own from "../src/components/pokemon/PokemonStatusControl";
import Rival from "../src/components/pokemon/PokemonOpponentStatusControl";
import Picker from "../src/components/pokemon/PokemonStatusPicker";
const pokemon = createLeveledPokemon({
  id: 4,
  name: "charmander",
  image: null,
  types: ["fire"],
  stats: [
    "hp",
    "attack",
    "defense",
    "special-attack",
    "special-defense",
    "speed",
  ].map((name) => ({ name, value: 60 })),
});
const capture = { captureId: "own", pokemon, statuses: [] };
const rival: BattleOpponent = {
  pokemon: { ...pokemon, id: 149, name: "dragonite" },
  statuses: [],
  stages: neutralBattleStages(),
  kind: "wild",
  encounterId: "rival",
};
const makeStore = () =>
  configureStore({
    reducer: { party: reducer },
    preloadedState: {
      party: {
        ...reducer(undefined, { type: "init" }),
        pokemons: [capture],
        opponent: rival,
      },
    },
  });
test("alpha bounds remove transparent padding, including last visible pixel", () => {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let y = 2; y <= 5; y++)
    for (let x = 1; x <= 3; x++) data[(y * 8 + x) * 4 + 3] = 255;
  assert.deepEqual(findSpriteBounds(data, 8, 8), {
    x: 1,
    y: 2,
    width: 3,
    height: 4,
    imageWidth: 8,
    imageHeight: 8,
  });
});
test("empty or invalid images retain fallback", () => {
  assert.equal(findSpriteBounds(new Uint8ClampedArray(16), 2, 2), null);
  assert.equal(findSpriteBounds(new Uint8ClampedArray(0), 4, 4), null);
});
test("opaque edges are preserved", () => {
  const data = new Uint8ClampedArray(4 * 4 * 4).fill(255);
  assert.deepEqual(findSpriteBounds(data, 4, 4), {
    x: 0,
    y: 0,
    width: 4,
    height: 4,
    imageWidth: 4,
    imageHeight: 4,
  });
});
test("own selector changes own states and enforces primary exclusivity", () => {
  const store = makeStore();
  let root: TestRenderer.ReactTestRenderer;
  act(() => {
    root = TestRenderer.create(
      <Provider store={store}>
        <Own capturedPokemon={capture} />
      </Provider>,
    );
  });
  const picker = root!.root.findByType(Picker);
  act(() => picker.props.onToggle("asleep"));
  act(() => picker.props.onToggle("burned"));
  act(() => picker.props.onToggle("confused"));
  assert.deepEqual(store.getState().party.pokemons[0].statuses, [
    "burned",
    "confused",
  ]);
  assert.deepEqual(store.getState().party.opponent?.statuses, []);
  act(() => picker.props.onClear());
  assert.deepEqual(store.getState().party.pokemons[0].statuses, []);
  act(() => root!.unmount());
});
test("rival uses the same picker and preserves exclusivity", () => {
  let current: BattleOpponent | null = rival;
  let root: TestRenderer.ReactTestRenderer;
  act(() => {
    root = TestRenderer.create(
      <Rival
        opponent={rival}
        onChange={(update) => {
          current = typeof update === "function" ? update(current) : update;
        }}
      />,
    );
  });
  const picker = root!.root.findByType(Picker);
  act(() => picker.props.onToggle("asleep"));
  act(() => picker.props.onToggle("paralyzed"));
  act(() => picker.props.onToggle("confused"));
  assert.deepEqual(current!.statuses, ["paralyzed", "confused"]);
  act(() => picker.props.onClear());
  assert.deepEqual(current!.statuses, []);
  act(() => root!.unmount());
});
test("stale rival popover cannot modify a different encounter", () => {
  let current: BattleOpponent | null = { ...rival, encounterId: "new" };
  let root: TestRenderer.ReactTestRenderer;
  act(() => {
    root = TestRenderer.create(
      <Rival
        opponent={rival}
        onChange={(update) => {
          current = typeof update === "function" ? update(current) : update;
        }}
      />,
    );
  });
  act(() => root!.root.findByType(Picker).props.onToggle("burned"));
  assert.deepEqual(current!.statuses, []);
  act(() => root!.unmount());
});
for (const view of [false, true])
  test(`HP and status controls follow combatants: rival view ${view}`, () => {
    const store = makeStore(),
      opened: string[] = [];
    let root: TestRenderer.ReactTestRenderer;
    act(() => {
      root = TestRenderer.create(
        <Provider store={store}>
          <Arena
            capturedPokemon={capture}
            opponent={rival}
            field={emptyBattleField()}
            opponentView={view}
            onTogglePerspective={() => {}}
            onPlayCry={() => {}}
            onOpenHp={(side) => opened.push(side)}
            rivalStatusControl={<Rival opponent={rival} onChange={() => {}} />}
          />
        </Provider>,
      );
    });
    for (const side of ["player", "opponent"]) {
      const hud = root!.root
        .findAllByType("div")
        .find((n) => n.props["data-side"] === side)!;
      assert.ok(
        hud.props.className.includes(
          (side === "player") !== view ? "hud--near" : "hud--far",
        ),
      );
      const picker = hud.findByType(Picker);
      assert.equal(
        picker.props.name,
        side === "player" ? "charmander" : "dragonite",
      );
      act(() =>
        hud
          .findAllByType("button")
          .find((n) => n.props["data-side"] === side)!
          .props.onClick(),
      );
    }
    assert.deepEqual(opened, ["player", "opponent"]);
    act(() => root!.unmount());
  });
