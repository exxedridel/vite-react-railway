export type Pokemon = {
  id: number;
  name: string;
  image: string | null;
  types: string[];
  stats: {
    name: string;
    value: number;
  }[];
};

export type CapturedPokemon = {
  captureId: string;
  pokemon: Pokemon;
};