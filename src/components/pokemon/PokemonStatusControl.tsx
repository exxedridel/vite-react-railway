import { useAppDispatch } from "@/store/hooks";
import { togglePokemonStatus, clearPokemonStatuses } from "@/slices/partySlice";
import type { CapturedPokemon } from "@/types/pokemon";
import PokemonStatusPicker from "./PokemonStatusPicker";
export default function PokemonStatusControl({
  capturedPokemon,
}: {
  capturedPokemon: CapturedPokemon;
}) {
  const dispatch = useAppDispatch();
  return (
    <PokemonStatusPicker
      name={capturedPokemon.pokemon.name}
      statuses={capturedPokemon.statuses ?? []}
      onToggle={(status) =>
        dispatch(
          togglePokemonStatus({ captureId: capturedPokemon.captureId, status }),
        )
      }
      onClear={() => dispatch(clearPokemonStatuses(capturedPokemon.captureId))}
    />
  );
}
