import type { CapturedPokemon } from "@/types/pokemon";

export const REGION_OPTIONS = [
  { id: "kanto", name: "Kanto", first: 1, last: 151 },
  { id: "johto", name: "Johto", first: 152, last: 251 },
  { id: "hoenn", name: "Hoenn", first: 252, last: 386 },
] as const;
export type RegionId = (typeof REGION_OPTIONS)[number]["id"];
export type GameSettings = {
  version: 1;
  regions: RegionId[];
  ruleset: "rse-emerald";
};
type SettingsParty = {
  gameSettings?: GameSettings | null;
  pokemons: CapturedPokemon[];
  starterClaimed?: boolean;
};
export function validRegions(
  input: readonly string[],
): input is readonly RegionId[] {
  return (
    input.length > 0 &&
    input.length <= 3 &&
    new Set(input).size === input.length &&
    input.every((id) => REGION_OPTIONS.some((r) => r.id === id))
  );
}
export function effectiveRegions(party: SettingsParty): readonly RegionId[] {
  if (party.gameSettings && validRegions(party.gameSettings.regions))
    return party.gameSettings.regions;
  // Compatibilidad: una partida anterior sigue funcionando, sin eliminar capturas.
  if (party.starterClaimed || party.pokemons.length > 0)
    return REGION_OPTIONS.map((r) => r.id);
  return [];
}
export function pokemonAllowed(party: SettingsParty, id: number): boolean {
  const region = REGION_OPTIONS.find((r) => id >= r.first && id <= r.last);
  return (
    Number.isSafeInteger(id) &&
    !!region &&
    effectiveRegions(party).includes(region.id)
  );
}
export function regionSummary(party: SettingsParty): string {
  const chosen = effectiveRegions(party);
  return (
    REGION_OPTIONS.filter((r) => chosen.includes(r.id))
      .map((r) => r.name)
      .join(" + ") || "Sin configurar"
  );
}
// Lista única para futuros sorteos de especie: no mezcla regiones excluidas.
export function encounterSpeciesIds(party: SettingsParty): number[] {
  return REGION_OPTIONS.filter((r) =>
    effectiveRegions(party).includes(r.id),
  ).flatMap((r) =>
    Array.from({ length: r.last - r.first + 1 }, (_, i) => r.first + i),
  );
}
