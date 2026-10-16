/** Cambia esta versión cuando una actualización requiera empezar partidas nuevas. */
export const APP_VERSION = "1.5.0";
export const GAME_DATA_VERSION = APP_VERSION;
export const MOVE_VERSION_GROUP = "emerald";
export const RULESET_ID = "rse-emerald" as const;
export const RULESET_LABEL = "Ruby / Sapphire / Emerald";
// PokéAPI: los movimientos introducidos hasta generación III terminan en Psycho Boost.
export const isGenerationThreeMove = (id: number): boolean =>
  Number.isSafeInteger(id) && id >= 1 && id <= 354;
