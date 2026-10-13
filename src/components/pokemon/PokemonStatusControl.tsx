import { useAppDispatch } from "@/store/hooks";
import {
  togglePokemonStatus,
  clearPokemonStatuses,
  setPokemonStatusTurns,
} from "@/slices/partySlice";
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
      statusTurns={capturedPokemon.statusTurns}
      onSetTurns={(status, turns) =>
        dispatch(
          setPokemonStatusTurns({
            captureId: capturedPokemon.captureId,
            status,
            turns,
          }),
        )
      }
      onToggle={(status) =>
        dispatch(
          togglePokemonStatus({ captureId: capturedPokemon.captureId, status }),
        )
      }
      onClear={() => dispatch(clearPokemonStatuses(capturedPokemon.captureId))}
    />
  );
}
