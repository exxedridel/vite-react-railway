import type { CapturedPokemon, Pokemon } from "@/types/pokemon";
import type { BattleOpponent } from "./battleOpponent";
import type { EvolutionRule } from "./gen3Evolutions";
import {
  createLeveledPokemon,
  getCurrentHp,
  getMaxHp,
  isLeveled,
  preserveHpRatio,
  validBaseStats,
} from "./pokemonStats";

export function evolutionBattleActive(
  opponent: BattleOpponent | null | undefined,
): boolean {
  return (
    !!opponent &&
    (!isLeveled(opponent.pokemon) || getCurrentHp(opponent.pokemon) > 0)
  );
}

export function evolutionRequirements(rule: EvolutionRule): string[] {
  const p = rule.parameter;
  const item = String(p)
    .split("-")
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(" ");
  switch (rule.method) {
    case "level":
      return [`Subir de nivel y alcanzar al menos el nivel ${p}.`];
    case "item":
      return [
        `Usar ${item} en este Pokémon. Confirma el consumo del objeto o carta en el tablero.`,
      ];
    case "trade":
      return [
        "Intercambiar este Pokémon. Confirma que resolviste el intercambio en el tablero.",
      ];
    case "trade_item":
      return [
        `Intercambiarlo equipado con ${item}. El objeto se consume al evolucionar.`,
      ];
    case "friendship":
      return [
        "Amistad de al menos 220 y subir de nivel. La amistad y el evento se confirman manualmente.",
      ];
    case "friendship_day":
      return [
        "Amistad de al menos 220 y subir de nivel entre las 12:00 y las 23:59 (horario de evolución de Ruby/Sapphire/Emerald). Confirma el horario del juego y la amistad.",
      ];
    case "friendship_night":
      return [
        "Amistad de al menos 220 y subir de nivel entre las 00:00 y las 11:59 (horario de evolución de Ruby/Sapphire/Emerald). Confirma el horario del juego y la amistad.",
      ];
    case "beauty":
      return [
        `Belleza de al menos ${p} y subir de nivel. Confirma la belleza manualmente.`,
      ];
    case "level_atk_lt_def":
      return [
        `Subir de nivel desde el nivel ${p}, con Attack menor que Defense.`,
      ];
    case "level_atk_gt_def":
      return [
        `Subir de nivel desde el nivel ${p}, con Attack mayor que Defense.`,
      ];
    case "level_atk_eq_def":
      return [
        `Subir de nivel desde el nivel ${p}, con Attack igual a Defense.`,
      ];
    case "level_silcoon":
    case "level_cascoon":
      return [
        `Subir de nivel desde el nivel ${p}.`,
        "La rama depende de la personalidad en Gen 3. Como la app no guarda ese dato, resuelvan la rama una sola vez en el tablero con una tirada de 50% y seleccionen el resultado.",
      ];
    case "level_ninjask":
      return [
        `Subir de nivel desde el nivel ${p}.`,
        "Con un hueco libre también aparece Shedinja. En Emerald no requiere gastar una Poké Ball. La app lo agrega automáticamente si hay espacio.",
      ];
    default:
      return ["Requisito especial no reconocido."];
  }
}

export function evolutionLevelError(
  capture: CapturedPokemon,
  rule: EvolutionRule,
): string | null {
  if (!isLeveled(capture.pokemon))
    return "Primero deben cargarse el nivel y las estadísticas.";
  if (
    rule.method.startsWith("level") &&
    capture.pokemon.level < Number(rule.parameter)
  )
    return `Requiere al menos nivel ${rule.parameter}. Nivel actual: ${capture.pokemon.level}.`;
  if (rule.method.startsWith("level_atk")) {
    const attack = capture.pokemon.stats.find(
      (s) => s.name === "attack",
    )?.value;
    const defense = capture.pokemon.stats.find(
      (s) => s.name === "defense",
    )?.value;
    if (attack === undefined || defense === undefined)
      return "Faltan Attack o Defense.";
    const valid =
      rule.method === "level_atk_lt_def"
        ? attack < defense
        : rule.method === "level_atk_gt_def"
          ? attack > defense
          : attack === defense;
    if (!valid)
      return "La relación entre Attack y Defense no corresponde a esta evolución (se usan los stats sin modificadores temporales).";
  }
  return null;
}

export function replaceEvolvedPokemon(
  capture: CapturedPokemon,
  source: Pokemon,
): CapturedPokemon {
  if (
    !isLeveled(capture.pokemon) ||
    !validBaseStats(source.baseStats ?? source.stats)
  )
    throw new Error("Datos incompletos de evolución.");
  const evolved = createLeveledPokemon(
    source,
    source.baseStats ?? source.stats,
    capture.pokemon.level,
  );
  const oldMax = getMaxHp(capture.pokemon)!;
  const newMax = getMaxHp(evolved)!;
  evolved.stats.find((s) => s.name === "hp")!.value = preserveHpRatio(
    getCurrentHp(capture.pokemon),
    oldMax,
    newMax,
  );
  evolved.battleStages = { ...capture.pokemon.battleStages };
  return { ...capture, pokemon: evolved };
}
