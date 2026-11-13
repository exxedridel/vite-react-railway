/** Versión visible de la aplicación; el formato de guardado se versiona aparte. */
export const APP_VERSION = "2.6.0";
// The party schema remains compatible; the optional combat runtime has its own version.
export const GAME_DATA_VERSION = "1.6.0";
export const MOVE_VERSION_GROUP = "emerald";
export const RULESET_ID = "rse-emerald" as const;
export const RULESET_LABEL = "Ruby / Sapphire / Emerald";
// PokéAPI: los movimientos introducidos hasta generación III terminan en Psycho Boost.
export const isGenerationThreeMove = (id: number): boolean =>
  Number.isSafeInteger(id) && id >= 1 && id <= 354;
