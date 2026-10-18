import fs from "node:fs";
import { Dex } from "@pkmn/sim";
const dex = Dex.forGen(3);
const list = dex.moves
  .all()
  .filter((m) => m.num >= 1 && m.num <= 354 && !m.realMove)
  .sort((a, b) => a.num - b.num);
if (list.length !== 354 || new Set(list.map((m) => m.num)).size !== 354)
  throw new Error("Incomplete Gen III catalog");
const data = Object.fromEntries(
  list.map((m) => [
    m.num,
    {
      name: m.name,
      description: m.desc || m.shortDesc,
      shortDescription: m.shortDesc,
      type: m.type.toLowerCase(),
      damageClass: m.category.toLowerCase(),
      power: m.basePower || null,
      accuracy: m.accuracy === true ? null : m.accuracy,
      pp: m.pp,
      priority: m.priority,
    },
  ]),
);
fs.writeFileSync(
  "src/lib/emerald/moveData.json",
  JSON.stringify(data, null, 2) + "\n",
);
console.log(`${list.length} moves exported from @pkmn/sim 0.10.11 / Gen III`);
