import { useEffect } from "react";
import { useLazyGetPokemonQuery } from "@/api/pokeApi";
import { useAppDispatch } from "@/store/hooks";
import { migratePokemonSpecies } from "@/slices/partySlice";
import { getMaxHp, isLeveled } from "@/lib/pokemonStats";
import type { Pokemon } from "@/types/pokemon";

// Los nuevos Pokémon no necesitan consultar PokéAPI para mostrar su salud.
// Las capturas antiguas se migran al mostrarse por primera vez, sin borrar la party.
export function usePokemonProgression(pokemon: Pokemon | undefined) {
  const dispatch = useAppDispatch();
  const [getPokemon, { data, isError, isFetching }] = useLazyGetPokemonQuery();
  const id = pokemon?.id;
  const ready = isLeveled(pokemon);
  useEffect(() => {
    if (id !== undefined && !ready) void getPokemon(String(id), true);
  }, [id, ready, getPokemon]);
  useEffect(() => {
    if (!ready && data && data.id === id) dispatch(migratePokemonSpecies(data));
  }, [ready, data, id, dispatch]);
  return {
    ready,
    maxHp: getMaxHp(pokemon),
    isError: !ready && isError,
    isFetching,
    retry: () => {
      if (id !== undefined) void getPokemon(String(id), false);
    },
  };
}
