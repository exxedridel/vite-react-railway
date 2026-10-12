import { MOVE_VERSION_GROUP, isGenerationThreeMove } from "@/lib/gameVersion";
import { useEffect, useState } from "react";
import { pokeApi } from "@/api/pokeApi";
import { store } from "@/store/store";
import { setPokemonLearnset } from "@/slices/partySlice";
import type { PokemonMove } from "@/types/moves";

// Solo se monta al abrir el selector. Consulta los tipos antes de elegir el move.
export function usePokemonMoveCatalog(captureId: string, pokemonId: number) {
  const [catalog, setCatalog] = useState<PokemonMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [failedCount, setFailedCount] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const pending = new Set<() => void>();
    setCatalog([]);
    setLoading(true);
    setError("");
    setFailedCount(0);
    setProgress({ done: 0, total: 0 });

    async function load() {
      try {
        const capture = store
          .getState()
          .party.pokemons.find(
            (p) => p.captureId === captureId && p.pokemon.id === pokemonId,
          );
        if (!capture) return;
        let learnset = capture.pokemon.learnset;
        // Permite usar TM también en equipos guardados antes de tener movimientos.
        if (
          !learnset?.moves.length ||
          learnset.versionGroup !== MOVE_VERSION_GROUP
        ) {
          const request = store.dispatch(
            pokeApi.endpoints.getPokemon.initiate(String(pokemonId), {
              forceRefetch: true,
            }),
          );
          const release = () => request.unsubscribe();
          pending.add(release);
          try {
            const data = await request.unwrap();
            if (cancelled) return;
            learnset = data.learnset;
            if (learnset)
              store.dispatch(
                setPokemonLearnset({ captureId, pokemonId, learnset }),
              );
          } finally {
            if (pending.delete(release)) release();
          }
        }
        if (cancelled) return;
        if (!learnset?.moves.length)
          throw new Error(
            "No hay movimientos compatibles para esta especie en el catálogo actual.",
          );
        const ids = [...new Set(learnset.moves.map((m) => m.id))].filter(
          isGenerationThreeMove,
        );
        let nextIndex = 0;
        let done = 0;
        let failures = 0;
        const loaded: PokemonMove[] = [];
        setProgress({ done: 0, total: ids.length });
        async function worker() {
          while (!cancelled) {
            const index = nextIndex++;
            if (index >= ids.length) return;
            const id = ids[index];
            try {
              let move = pokeApi.endpoints.getMove.select(id)(
                store.getState(),
              ).data;
              if (!move) {
                const request = store.dispatch(
                  pokeApi.endpoints.getMove.initiate(id),
                );
                const release = () => request.unsubscribe();
                pending.add(release);
                try {
                  move = await request.unwrap();
                } finally {
                  if (pending.delete(release)) release();
                }
              }
              if (cancelled) return;
              loaded.push(move);
              setCatalog(
                [...loaded].sort((a, b) =>
                  a.displayName.localeCompare(b.displayName),
                ),
              );
            } catch {
              if (cancelled) return;
              failures++;
            } finally {
              if (!cancelled) {
                setProgress({ done: ++done, total: ids.length });
                setFailedCount(failures);
              }
            }
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(4, ids.length) }, () => worker()),
        );
      } catch (cause: unknown) {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar el catálogo. Revisa tu conexión.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      // Deja terminar las peticiones compartidas en caché; evita cancelar a otros
      // consumidores y respeta el montaje doble de StrictMode.
      pending.forEach((release) => release());
      pending.clear();
    };
  }, [captureId, pokemonId, attempt]);

  return {
    catalog,
    loading,
    error,
    failedCount,
    progress,
    retry: () => setAttempt((a) => a + 1),
  };
}
