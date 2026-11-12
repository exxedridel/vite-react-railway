import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SHOP_ITEMS,
  maximumShopQuantity,
  parseShopQuantity,
  quoteShopPurchase,
  readShopColors,
  shopPlayerColor,
  writeShopColors,
} from "../src/lib/adminShop";

test("600 Pokedollars buys at most two Great Balls with an exact debit quote", () => {
  const greatBall = SHOP_ITEMS.find((item) => item.id === "great-ball")!;
  assert.equal(greatBall.price, 300);
  assert.equal(maximumShopQuantity(600, greatBall.price), 2);
  assert.deepEqual(quoteShopPurchase(600, greatBall.price, 2), {
    total: 600,
    remaining: 0,
  });
  assert.equal(quoteShopPurchase(600, greatBall.price, 3), null);
  assert.equal(quoteShopPurchase(299, greatBall.price, 1), null);
  assert.equal(maximumShopQuantity(0, greatBall.price), 0);
});

test("purchase quantities reject fractions, zero, non-finite values and amounts above the transaction cap", () => {
  for (const input of [
    "",
    "0",
    "1.5",
    "-2",
    "NaN",
    "1e2",
    "100",
    "9007199254740992",
  ])
    assert.equal(parseShopQuantity(input), null, input);
  assert.equal(parseShopQuantity("2"), 2);
  assert.equal(maximumShopQuantity(100000, 150), 99);
  for (const quantity of [0, -1, 1.5, 100, Infinity, NaN])
    assert.equal(quoteShopPurchase(100000, 150, quantity), null);
  for (const balance of [-1, 0.5, NaN, Infinity])
    assert.equal(maximumShopQuantity(balance, 150), 0);
  assert.equal(maximumShopQuantity(500, 0), 0);
});

test("display catalog includes PP recovery items at the agreed prices", () => {
  assert.deepEqual(
    SHOP_ITEMS.map(({ id, price }) => [id, price]),
    [
      ["poke-ball", 150],
      ["great-ball", 300],
      ["ultra-ball", 450],
      ["full-restore", 350],
      ["max-ether", 350],
      ["max-elixir", 700],
      ["tm", 500],
      ["bicycle", 1200],
    ],
  );
});

test("color preferences are scoped per administrator, independent from player count and currency", () => {
  const rows = new Map<string, string>();
  const storage = {
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => {
      rows.set(key, value);
    },
  };
  const colors = Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => [
      String(index + 1),
      index % 2 ? "green" : "pink",
    ]),
  ) as Record<string, "green" | "pink">;
  writeShopColors(storage, 10, colors);
  assert.deepEqual(readShopColors(storage, 10), colors);
  assert.deepEqual(readShopColors(storage, 11), {});
  assert.equal(shopPlayerColor(readShopColors(storage, 10), 20), "green");
  assert.equal(shopPlayerColor({}, 30), shopPlayerColor({}, 30));
  const key = [...rows.keys()][0];
  rows.set(
    key,
    JSON.stringify({
      1: "cyan",
      2: "unknown",
      "not-a-user": "pink",
      "3": 1000000,
    }),
  );
  assert.deepEqual(readShopColors(storage, 10), { 1: "cyan" });
  assert.throws(() => writeShopColors(storage, 0, colors));
});
