import { ModeToggle } from "@/components/ui/mode-toggle";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/AppContext";
import { useAppSelector } from "@/store/hooks";
import { canChooseStarter } from "@/lib/starterPokemon";
import DropdownUser from "./DropdownUser";

function Navbar() {
  const { setPokemonDialogOpen } = useAppContext();

  const eligible = useAppSelector((state) =>
    canChooseStarter(state.party),
  );

  return (
    <div className="my-2 flex flex-wrap items-center justify-between gap-2">
      <div className="ml-3 flex flex-row gap-2">
        <DropdownUser />
        <ModeToggle />
      </div>

      {eligible && (
        <Button
          type="button"
          size="sm"
          onClick={() => setPokemonDialogOpen(true)}
          aria-label="Elegir Pokémon inicial"
          className="ml-auto mr-3 gap-1"
        >
          <img
            src="/Pokeball-PNG.png"
            alt=""
            className="h-6 w-6 shrink-0"
          />
          Elegir inicial
        </Button>
      )}
    </div>
  );
}

export default Navbar;