import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAppContext } from "@/context/AppContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { store } from "@/store/store";
import { addPokemon } from "@/slices/partySlice";
import { useLazyGetPokemonQuery } from "@/api/pokeApi";
import { canChooseStarter, STARTER_GROUPS } from "@/lib/starterPokemon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Conserva este nombre: Layout ya monta AddPokemonDialog una sola vez.
export default function AddPokemonDialog() {
  const { pokemonDialogOpen, setPokemonDialogOpen } = useAppContext();
  const dispatch = useAppDispatch();
  const eligible = useAppSelector((state) => canChooseStarter(state.party));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [getPokemon] = useLazyGetPokemonQuery();
  const requestRef = useRef<ReturnType<typeof getPokemon> | null>(null);
  const selected = STARTER_GROUPS.flatMap((g) => [...g.pokemons]).find(
    (p) => p.id === selectedId,
  );

  function cancelRequest() {
    requestRef.current?.abort();
    requestRef.current = null;
    setBusy(false);
  }
  function close() {
    cancelRequest();
    setPokemonDialogOpen(false);
  }
  useEffect(() => {
    if (!pokemonDialogOpen) {
      requestRef.current?.abort();
      requestRef.current = null;
      setBusy(false);
      setSelectedId(null);
    }
  }, [pokemonDialogOpen]);
  useEffect(() => {
    if (!eligible && pokemonDialogOpen) setPokemonDialogOpen(false);
  }, [eligible, pokemonDialogOpen, setPokemonDialogOpen]);
  useEffect(
    () => () => {
      requestRef.current?.abort();
      requestRef.current = null;
    },
    [],
  );

  async function choose() {
    if (
      !selectedId ||
      requestRef.current ||
      !canChooseStarter(store.getState().party)
    )
      return;
    setBusy(true);
    // Fuerza datos con learnset, incluso si existía una respuesta antigua en caché.
    const request = getPokemon(String(selectedId), false);
    requestRef.current = request;
    try {
      const pokemon = await request.unwrap();
      if (requestRef.current !== request) return;
      if (!pokemon.learnset?.moves.length) {
        toast.error(
          "No se encontró el catálogo de movimientos de este inicial. Intenta nuevamente.",
        );
        return;
      }
      if (!canChooseStarter(store.getState().party)) return;
      dispatch(addPokemon(pokemon));
      if (
        !store
          .getState()
          .party.pokemons.some(
            (p) => p.origin === "starter" && p.pokemon.id === pokemon.id,
          )
      ) {
        toast.error("No se pudo registrar la elección del inicial.");
        return;
      }
      toast.success(`${selected?.name ?? pokemon.name} se unió a tu equipo.`, {
        description:
          "Abre su pantalla de combate para elegir hasta dos movimientos.",
      });
      setPokemonDialogOpen(false);
    } catch (error: unknown) {
      if (requestRef.current !== request) return;
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? error.status
          : undefined;
      toast.error(
        status === "TIMEOUT_ERROR"
          ? "PokéAPI tardó demasiado. Intenta nuevamente."
          : "No se pudo cargar el inicial. Revisa tu conexión e intenta nuevamente.",
      );
    } finally {
      if (requestRef.current === request) {
        requestRef.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <Dialog
      open={pokemonDialogOpen && eligible}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-[560px]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Elige tu Pokémon inicial</DialogTitle>
          <DialogDescription>
            Comenzará en nivel 50. Puedes elegir uno por partida y enseñarle
            hasta dos movimientos gratuitos.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-1 py-2">
          {STARTER_GROUPS.map((group) => (
            <fieldset key={group.region} disabled={busy}>
              <legend className="mb-2 text-sm font-semibold">
                {group.region}
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {group.pokemons.map((pokemon) => (
                  <button
                    key={pokemon.id}
                    type="button"
                    aria-pressed={selectedId === pokemon.id}
                    onClick={() => setSelectedId(pokemon.id)}
                    className={`min-w-0 rounded-xl border p-2 text-center text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${selectedId === pokemon.id ? "border-brand bg-muted ring-2 ring-brand" : "bg-card hover:bg-muted"}`}
                  >
                    <img
                      src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`}
                      alt=""
                      loading="lazy"
                      className="mx-auto h-16 w-16 object-contain"
                    />
                    <span className="break-words font-medium">
                      {pokemon.name}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t pt-3">
          <Button type="button" variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!selectedId || busy}
            onClick={() => void choose()}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {busy
              ? "Preparando inicial…"
              : selected
                ? `Elegir a ${selected.name}`
                : "Selecciona un inicial"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
