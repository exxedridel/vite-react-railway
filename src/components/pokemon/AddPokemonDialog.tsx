import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAppContext } from "@/context/AppContext";
import { useAppDispatch } from "@/store/hooks";
import { addPokemon } from "@/slices/partySlice";
import { useLazyGetPokemonQuery } from "@/api/pokeApi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function AddPokemonDialog() {
  const { pokemonDialogOpen, setPokemonDialogOpen } = useAppContext();

  const dispatch = useAppDispatch();

  const [search, setSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const [getPokemon] = useLazyGetPokemonQuery();

  const requestRef = useRef<ReturnType<typeof getPokemon> | null>(null);

  useEffect(() => {
    if (pokemonDialogOpen) {
      setSearch("");
    } else {
      requestRef.current?.abort();
      requestRef.current = null;
      setIsSearching(false);
    }
  }, [pokemonDialogOpen]);

  useEffect(() => {
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      requestRef.current?.abort();
      requestRef.current = null;
      setIsSearching(false);
    }

    setPokemonDialogOpen(open);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (requestRef.current) return;

    const input = search.trim().toLowerCase();

    if (!input) {
      toast.error("Escribe el nombre o número de un Pokémon.");
      return;
    }

    // Permite buscar también con números como 025.
    const query = /^\d+$/.test(input) ? String(Number(input)) : input;

    setIsSearching(true);

    // El segundo argumento permite utilizar una respuesta ya almacenada.
    const request = getPokemon(query, true);
    requestRef.current = request;

    try {
      const pokemon = await request.unwrap();

      // Si el usuario cerró el diálogo, no agregamos la captura.
      if (requestRef.current !== request) return;

      dispatch(addPokemon(pokemon));
      setPokemonDialogOpen(false);
      setSearch("");
    } catch (error: unknown) {
      if (requestRef.current !== request) return;

      const status =
        typeof error === "object" && error !== null && "status" in error
          ? error.status
          : undefined;

      if (status === 404) {
        toast.error("Pokémon no encontrado.", {
          description: "Revisa el nombre en inglés o el número de la Pokédex.",
        });
      } else if (status === "TIMEOUT_ERROR") {
        toast.error("PokéAPI tardó demasiado en responder.", {
          description: "Intenta nuevamente.",
        });
      } else if (typeof status === "number") {
        toast.error("No se pudo consultar PokéAPI.", {
          description: `El servicio respondió con el código ${status}.`,
        });
      } else {
        toast.error("No se pudo obtener el Pokémon.", {
          description: "Revisa tu conexión e intenta nuevamente.",
        });
      }
    } finally {
      if (requestRef.current === request) {
        requestRef.current = null;
        setIsSearching(false);
      }
    }
  };

  return (
    <Dialog open={pokemonDialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add a pokémon to your party</DialogTitle>
          <DialogDescription>
            Type the name or number in the token
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="E.g. pikachu or 25"
              aria-label="Pokémon name or number"
              disabled={isSearching}
              className="col-span-3"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSearching}>
              {isSearching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <img src="/Pokeball-PNG.png" alt="" className="w-6 mt-0.5" />
                  Add pokémon
                </div>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default AddPokemonDialog;
