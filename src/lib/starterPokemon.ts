import type { CapturedPokemon } from "@/types/pokemon";

// Regla de esta edición: tríos básicos Grass / Fire / Water de generaciones 1–9.
export const STARTER_GROUPS = [
  {
    region: "Kanto",
    pokemons: [
      { id: 1, name: "Bulbasaur" },
      { id: 4, name: "Charmander" },
      { id: 7, name: "Squirtle" },
    ],
  },
  {
    region: "Johto",
    pokemons: [
      { id: 152, name: "Chikorita" },
      { id: 155, name: "Cyndaquil" },
      { id: 158, name: "Totodile" },
    ],
  },
  {
    region: "Hoenn",
    pokemons: [
      { id: 252, name: "Treecko" },
      { id: 255, name: "Torchic" },
      { id: 258, name: "Mudkip" },
    ],
  },
  {
    region: "Sinnoh",
    pokemons: [
      { id: 387, name: "Turtwig" },
      { id: 390, name: "Chimchar" },
      { id: 393, name: "Piplup" },
    ],
  },
  {
    region: "Unova",
    pokemons: [
      { id: 495, name: "Snivy" },
      { id: 498, name: "Tepig" },
      { id: 501, name: "Oshawott" },
    ],
  },
  {
    region: "Kalos",
    pokemons: [
      { id: 650, name: "Chespin" },
      { id: 653, name: "Fennekin" },
      { id: 656, name: "Froakie" },
    ],
  },
  {
    region: "Alola",
    pokemons: [
      { id: 722, name: "Rowlet" },
      { id: 725, name: "Litten" },
      { id: 728, name: "Popplio" },
    ],
  },
  {
    region: "Galar",
    pokemons: [
      { id: 810, name: "Grookey" },
      { id: 813, name: "Scorbunny" },
      { id: 816, name: "Sobble" },
    ],
  },
  {
    region: "Paldea",
    pokemons: [
      { id: 906, name: "Sprigatito" },
      { id: 909, name: "Fuecoco" },
      { id: 912, name: "Quaxly" },
    ],
  },
] as const;
export const MOVE_VERSION_GROUP = "scarlet-violet";
const STARTER_IDS: ReadonlySet<number> = new Set(
  STARTER_GROUPS.flatMap((g) => g.pokemons.map((p) => p.id)),
);
export const isStarterSpecies = (id: number) => STARTER_IDS.has(id);

// Compatible con equipos guardados antes de existir starterClaimed.
export function canChooseStarter(party: {
  pokemons: CapturedPokemon[];
  starterClaimed?: boolean;
}) {
  return !party.starterClaimed && party.pokemons.length === 0;
}
