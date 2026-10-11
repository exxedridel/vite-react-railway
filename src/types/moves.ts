export type MoveOption = { id: number; name: string };
export type PokemonLearnset = {
  versionGroup: string;
  moves: MoveOption[];
};
export type PokemonMove = {
  id: number;
  name: string;
  displayName: string;
  type: string;
  damageClass: "physical" | "special" | "status";
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  priority: number;
  description: string;
};
export type LearnedMove = PokemonMove & {
  source: "starter" | "wild" | "tm" | "hm";
};
