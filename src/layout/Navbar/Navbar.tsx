import { Plus } from "lucide-react";

import { ModeToggle } from "@/components/ui/mode-toggle";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/AppContext";
import { useAppSelector } from "@/store/hooks";

import DropdownUser from "./DropdownUser";

function Navbar() {
  const { setPokemonDialogOpen } = useAppContext();

  const hasPokemon = useAppSelector((state) => state.party.pokemons.length > 0);
  const maxPokemonReached = useAppSelector(
    (state) => state.party.pokemons.length < 6,
  );

  return (
    <div>
      <div className="my-2 flex flex-row items-center justify-between">
        <div className="ml-3 flex flex-row gap-2">
          <DropdownUser />
          <ModeToggle />
        </div>

        {hasPokemon && maxPokemonReached && (
          <Button
            type="button"
            size="sm"
            onClick={() => setPokemonDialogOpen(true)}
            aria-label="Add a Pokémon"
            className="gap-0.5 mr-3"
          >
            <Plus className="h-5 w-5 mb-0.5 shrink-0" />
            <img src="/Pokeball-PNG.png" alt="" className="h-6 w-6 shrink-0" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default Navbar;
