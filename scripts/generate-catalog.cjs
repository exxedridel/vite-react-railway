// npm dependency for regeneration only: @pkmn/dex@0.10.11 (MIT).
const { Dex } = require("@pkmn/dex");
const fs = require("node:fs");
const unique = new Map();
for (const m of Dex.forGen(3).moves.all())
  if (m.num >= 1 && m.num <= 354 && !unique.has(m.num)) unique.set(m.num, m);
const stages = {
  atk: "attack",
  def: "defense",
  spa: "special-attack",
  spd: "special-defense",
  spe: "speed",
  accuracy: "accuracy",
  evasion: "evasiveness",
};
const statuses = {
  brn: "burned",
  frz: "frozen",
  par: "paralyzed",
  slp: "asleep",
  psn: "poisoned",
  tox: "badly-poisoned",
  confusion: "confused",
  flinch: "flinched",
  partiallytrapped: "bound",
  trapped: "trapped",
  leechseed: "leech-seed",
  taunt: "taunted",
  disable: "disabled",
  encore: "encored",
  attract: "infatuated",
};
const preparation = {
  13: "Confirma que ya gastaste el turno de preparación de Razor Wind.",
  19: "Confirma que ya gastaste el turno de Fly en el aire.",
  76: "Confirma que ya gastaste el turno de carga de Solar Beam (con sol no hace falta).",
  91: "Confirma que ya gastaste el turno de Dig bajo tierra.",
  130: "Confirma que ya gastaste el turno de Skull Bash y aplicaste +1 Defense durante la carga. No se vuelve a sumar aquí.",
  143: "Confirma que ya gastaste el turno de carga de Sky Attack.",
  291: "Confirma que ya gastaste el turno de Dive bajo el agua.",
  340: "Confirma que ya gastaste el turno de Bounce en el aire.",
};
const handler = {
  228: "pursuit",
  279: "revenge",
  215: "healParty",
  312: "healParty",
  49: "fixed20",
  82: "fixed40",
  69: "level",
  101: "level",
  149: "psywave",
  162: "halfHp",
  283: "endeavor",
  175: "flail",
  179: "flail",
  284: "eruption",
  323: "eruption",
  263: "facade",
  265: "smellingSalts",
  222: "magnitude",
  217: "present",
  67: "weight",
  216: "return",
  218: "frustration",
  210: "furyCutter",
  205: "rollout",
  301: "rollout",
  255: "spitUp",
  256: "swallow",
  311: "weatherBall",
  12: "ohko",
  32: "ohko",
  90: "ohko",
  329: "ohko",
  214: "sleepTalk",
  156: "rest",
  187: "bellyDrum",
  114: "haze",
  244: "psychUp",
  220: "painSplit",
  287: "refresh",
  150: "splash",
  229: "rapidSpin",
  206: "falseSwipe",
  234: "weatherHeal",
  235: "weatherHeal",
  236: "weatherHeal",
  68: "counter",
  243: "mirrorCoat",
  117: "bide",
  26: "crash",
  136: "crash",
};
const manual = {
  268: "Charge duplica el siguiente ataque Electric, pero no sube Special Defense en Gen 3. Falta guardar/consumir esa carga.",
  118: "Metronome requiere seleccionar y resolver otro movimiento de todo el catálogo.",
  274: "Assist necesita el equipo completo y el filtrado de movimientos invocables.",
  251: "Beat Up necesita los participantes sanos del equipo y sus stats base.",
  237: "Hidden Power necesita tipo y potencia derivados de IVs, que esta app no modela.",
  248: "Future Sight necesita guardar el ataque pendiente y sus stats de lanzamiento durante dos turnos.",
  353: "Doom Desire necesita guardar el ataque pendiente y sus stats de lanzamiento durante dos turnos.",
  102: "Mimic requiere historial del último movimiento y un reemplazo temporal.",
  119: "Mirror Move requiere el último movimiento dirigido al usuario y las reglas de invocación.",
  166: "Sketch requiere elegir y copiar permanentemente el último movimiento rival.",
  144: "Transform requiere una copia temporal de especie, stats, movimientos y PP.",
};
const notes = {
  229: "Retira Bound y Leech Seed automáticamente; retira Spikes del tablero manualmente. No sube Speed en Gen 3.",
  156: "El sueño de Rest dura dos turnos: el contador y despertar se resuelven manualmente.",
  214: "La selección y resolución del movimiento invocado son automáticas si está soportado; sus PP y cualquier dato adicional se verifican manualmente.",
  215: "Cura estados principales del equipo. Soundproof y otras habilidades se resuelven manualmente.",
  312: "Cura estados principales del equipo.",
  169: "Trapped se mantiene mientras el usuario siga en combate; quítalo cuando corresponda.",
  212: "Trapped se mantiene mientras el usuario siga en combate; quítalo cuando corresponda.",
  335: "Trapped se mantiene mientras el usuario siga en combate; quítalo cuando corresponda.",
  290: "Efecto implementado para terreno normal; otros terrenos se resuelven manualmente.",
  228: "Declara si el objetivo está retirándose para duplicar potencia y omitir precisión.",
  279: "Declara si el objetivo fue el último que dañó al usuario este turno para duplicar potencia.",
  6: "Entrega las monedas de Pay Day en el tablero.",
  20: "Bound dura 2–5 turnos; descuenta su daño residual al final del turno manualmente.",
  35: "Bound dura 2–5 turnos; daño residual manual.",
  83: "Bound dura 2–5 turnos; daño residual manual.",
  128: "Bound dura 2–5 turnos; daño residual manual.",
  250: "Bound dura 2–5 turnos; daño residual manual.",
  328: "Bound dura 2–5 turnos; daño residual manual.",
  37: "Repite el ataque 2–3 turnos. Al terminar, aplica Confusion manualmente.",
  80: "Repite el ataque 2–3 turnos. Al terminar, aplica Confusion manualmente.",
  200: "Repite el ataque 2–3 turnos. Al terminar, aplica Confusion manualmente.",
  63: "Después de acertar debes gastar el siguiente turno recargando.",
  307: "Después de acertar debes gastar el siguiente turno recargando.",
  308: "Después de acertar debes gastar el siguiente turno recargando.",
  338: "Después de acertar debes gastar el siguiente turno recargando.",
  99: "Mientras Rage siga activo, aumenta Attack en 1 etapa después de recibir un ataque; ese seguimiento es manual.",
  168: "El robo de objeto se resuelve en el tablero.",
  343: "El robo de objeto se resuelve en el tablero.",
  282: "La retirada del objeto se resuelve en el tablero.",
  280: "Retira Reflect y Light Screen del objetivo en el tablero antes del daño; la app no guarda pantallas.",
  253: "Mantén Uproar durante 2–5 turnos y resuelve su prevención de sueño manualmente.",
  16: "Si el objetivo está en Fly/Bounce duplica la potencia; ese estado aéreo no está modelado.",
  89: "Si el objetivo está en Dig duplica la potencia; ese estado no está modelado.",
  57: "Si el objetivo está en Dive duplica la potencia; ese estado no está modelado.",
  222: "Contra Dig duplica la potencia manualmente; no se guarda la posición subterránea.",
  239: "Contra Fly/Bounce duplica la potencia manualmente; no se guarda la posición aérea.",
  23: "Contra Minimize duplica el daño; la app no guarda el origen de Evasiveness.",
  302: "Contra Minimize duplica el daño; la app no guarda el origen de Evasiveness.",
  50: "Selecciona manualmente el movimiento deshabilitado y cuenta 2–5 turnos.",
  227: "Selecciona manualmente el movimiento obligado y cuenta 3–6 turnos.",
  269: "Taunt dura 2 turnos en Gen 3; quítalo al terminar.",
  73: "Leech Seed se marca; resuelve drenaje y curación al final de cada turno manualmente.",
  252: "Solo se permite durante el primer turno activo del usuario.",
  264: "Solo se permite si no recibió daño de un ataque antes de actuar.",
  67: "Introduce el peso del objetivo en kilogramos.",
  216: "Introduce la amistad del usuario (0–255).",
  218: "Introduce la amistad del usuario (0–255).",
  210: "Introduce el número de golpes consecutivos exitosos incluyendo este (1–5). Reinicia tras fallar/cambiar.",
  205: "Introduce el golpe de Rollout (1–5). Defense Curl y seguimiento entre turnos se resuelven manualmente.",
  301: "Introduce el golpe de Ice Ball (1–5). Defense Curl y seguimiento entre turnos se resuelven manualmente.",
  255: "Introduce las cargas Stockpile (1–3); al acertar, consume todas.",
  256: "Introduce las cargas Stockpile (1–3); después de curarte consume todas.",
  68: "Introduce solo el daño físico recibido este turno del objetivo; no daño residual ni especial.",
  243: "Introduce solo el daño especial recibido este turno del objetivo.",
  117: "Confirma que ya terminaron los dos turnos de Bide e introduce el daño recibido acumulado.",
};
const confirmations = {
  290: "El combate ocurre en terreno normal: Secret Power tiene 30% de parálisis.",
  252: "Es el primer turno activo de este Pokémon.",
  264: "El usuario no ha recibido daño de un movimiento antes de actuar este turno.",
  117: "Ya se completaron los dos turnos de acumulación de Bide.",
};
function effect(m, recipient, chance = 100) {
  let e = { chance, recipient };
  const st = m.status || m.volatileStatus;
  if (statuses[st]) e.status = statuses[st];
  if (m.boosts)
    e.stages = Object.fromEntries(
      Object.entries(m.boosts)
        .filter(([s]) => stages[s])
        .map(([s, v]) => [stages[s], v]),
    );
  return e.status || e.stages ? e : null;
}
let entries = {};
for (const m of [...unique.values()].sort((a, b) => a.num - b.num)) {
  const effects = [];
  if ([169, 212, 335].includes(m.num))
    effects.push({ chance: 100, recipient: "target", status: "trapped" });
  const main = effect(m, m.target === "self" ? "attacker" : "target");
  if (main) effects.push(main);
  if (m.self) {
    const e = effect(m.self, "attacker");
    if (e) effects.push(e);
  }
  for (const sec of m.secondaries || []) {
    const e = effect(sec, "target", sec.chance ?? 100);
    if (e) effects.push(e);
    if (sec.self) {
      const e = effect(sec.self, "attacker", sec.chance ?? 100);
      if (e) effects.push(e);
    }
  }
  // Historical removals not represented by client-only callback metadata.
  if ([127, 229, 268, 344].includes(m.num)) effects.length = 0;
  if (m.num === 161)
    effects.push({
      chance: 20,
      recipient: "target",
      randomStatus: ["burned", "frozen", "paralyzed"],
    });
  let e = {
    id: m.num,
    name: m.name,
    revision: 2,
    automation: "automatic",
    description: "",
    notes: notes[m.num] ? [notes[m.num]] : [],
    parameters: {
      type: m.type.toLowerCase(),
      damageClass: m.category.toLowerCase(),
      power: m.basePower || null,
      accuracy: m.accuracy === true ? null : m.accuracy,
      pp: m.pp,
      priority: m.priority,
    },
    target: m.target,
    critStage: Math.max(0, (m.critRatio || 1) - 1),
    effects,
  };
  if (m.drain) e.drain = m.drain;
  if (m.recoil) e.recoil = m.recoil;
  if (m.heal) e.heal = m.heal;
  if (m.multihit) e.multihit = m.multihit;
  if (m.selfdestruct) e.selfDestruct = m.selfdestruct;
  if (preparation[m.num]) e.preparation = preparation[m.num];
  if (confirmations[m.num]) e.confirmation = confirmations[m.num];
  if (handler[m.num]) e.handler = handler[m.num];
  if ([173, 214].includes(m.num)) e.sleepOnly = true;
  if (m.num === 138) e.targetSleepOnly = true;
  if (
    manual[m.num] ||
    (m.category === "Status" &&
      !effects.length &&
      !m.heal &&
      !handler[m.num]) ||
    (m.category !== "Status" && !m.basePower && !handler[m.num])
  ) {
    e.automation = "manual";
    e.manualReason =
      manual[m.num] ||
      "El efecto necesita un estado de campo, equipo, objetos, historial o contador que todavía no modela este motor. Se registra el uso para resolverlo manualmente.";
  }
  if (e.effects.some((f) => f.status === "flinched"))
    e.notes.push(
      "Flinch solo funciona antes de que el objetivo actúe; declara su turno y retira el estado al finalizarlo.",
    );
  if (
    e.automation !== "manual" &&
    (e.notes.length || e.preparation || e.confirmation)
  )
    e.automation = "assisted";
  if (m.num === 213) {
    e.automation = "assisted";
    e.confirmation = "Ambos Pokémon tienen género y son de géneros opuestos.";
  }
  if (m.num === 174) {
    e.automation = "manual";
    e.manualReason =
      "Curse depende del tipo Ghost y de un efecto residual no modelado.";
  }
  const text = [];
  if (e.automation === "manual") text.push(e.manualReason);
  if (e.sleepOnly)
    text.push(
      "Solo se puede usar si el usuario está dormido (Asleep); si no, falla.",
    );
  if (e.targetSleepOnly)
    text.push("Solo funciona contra un objetivo dormido (Asleep).");
  if (e.preparation) text.push(e.preparation);
  if (e.parameters.power)
    text.push(
      `Potencia ${e.parameters.power}; ${e.parameters.damageClass === "physical" ? "físico" : "especial"} en Gen 3.`,
    );
  if (e.drain)
    text.push(
      `Recupera ${(100 * e.drain[0]) / e.drain[1]}% del daño real causado, hasta el HP máximo.`,
    );
  if (e.recoil)
    text.push(
      `Retroceso: ${e.recoil[0]}/${e.recoil[1]} del daño real causado.`,
    );
  for (const fx of effects)
    text.push(
      `${fx.chance}%: ${fx.recipient === "attacker" ? "usuario" : "objetivo"} ${fx.status || fx.randomStatus?.join(" / ") || JSON.stringify(fx.stages)}.${fx.status === "flinched" ? " Solo si el objetivo aún no actuó; quitar al terminar el turno." : ""}`,
    );
  if (e.heal) text.push(`Recupera ${e.heal[0]}/${e.heal[1]} del HP máximo.`);
  if (e.selfDestruct)
    text.push(
      e.selfDestruct === "always"
        ? "El usuario queda debilitado incluso si falla o el objetivo es inmune."
        : "El usuario se debilita si el movimiento tiene efecto.",
    );
  if (e.handler === "sleepTalk")
    text.push(
      "Elige al azar otro movimiento aprendido permitido en Gen 3 y lo resuelve. No puede llamar movimientos de dos turnos, Assist, Bide, Focus Punch, Metronome, Mirror Move, Sleep Talk ni Uproar. Los PP actuales se comprueban en el tablero.",
    );
  if (e.handler === "healParty")
    text.push(
      "Cura los estados principales de todos los Pokémon de tu equipo. Del rival solo se conoce el combatiente seleccionado.",
    );
  if (e.handler === "rest")
    text.push(
      "Falla con HP completo o si ya duerme. Cura todo el HP, sustituye el estado principal por Asleep; cuenta dos turnos de sueño manualmente.",
    );
  if (e.handler === "falseSwipe")
    text.push("Deja al objetivo con al menos 1 HP.");
  if (e.handler === "painSplit")
    text.push(
      "Iguala ambos HP al promedio entero de sus HP actuales, limitado por sus máximos.",
    );
  if (e.handler === "bellyDrum")
    text.push(
      "Gasta la mitad del HP máximo y establece Attack en +6. Falla sin suficiente HP.",
    );
  if (e.handler === "haze") text.push("Reinicia las etapas de ambos Pokémon.");
  if (e.handler === "psychUp") text.push("Copia las etapas del objetivo.");
  if (e.handler === "refresh")
    text.push("Cura Burned, Poisoned, Badly poisoned y Paralyzed del usuario.");
  if (e.handler === "splash") text.push("Se registra el uso sin efecto.");
  text.push(...e.notes);
  if (
    e.handler &&
    ![
      "sleepTalk",
      "rest",
      "falseSwipe",
      "painSplit",
      "bellyDrum",
      "haze",
      "psychUp",
      "refresh",
      "splash",
    ].includes(e.handler)
  )
    text.push(`Referencia Gen 3: ${m.shortDesc}`);
  if (e.automation === "manual") text.push(`Referencia Gen 3: ${m.desc}`);
  e.description = text.join(" ") || "Ataque directo sin efecto adicional.";
  entries[m.num] = e;
}
if (Object.keys(entries).length !== 354) throw Error("Expected 354");
fs.writeFileSync(
  "gen3-moves-update/src/lib/gen3MoveData.ts",
  '// Generated from @pkmn/dex@0.10.11, Dex.forGen(3). MIT; see THIRD_PARTY_LICENSES.txt.\nimport type { CuratedMove } from "./moveCatalogTypes";\nexport const GEN3_MOVE_DATA: Readonly<Record<number, CuratedMove>> = ' +
    JSON.stringify(entries, null, 2) +
    ";\n",
);
fs.writeFileSync("/tmp/gen3-audit.json", JSON.stringify(entries, null, 2));
console.log(
  Object.values(entries).reduce(
    (a, e) => ((a[e.automation] = (a[e.automation] || 0) + 1), a),
    {},
  ),
);
