import { getCuratedMove } from "@/lib/curatedMoveCatalog";
import { MOVE_VERSION_GROUP, isGenerationThreeMove } from "@/lib/gameVersion";
import { nanoid } from "@reduxjs/toolkit";
import {
  createBattleOpponent,
  type BattleOpponent,
} from "@/lib/battleOpponent";
import type { LearnedMove, PokemonMove } from "@/types/moves";
import type { Pokemon } from "@/types/pokemon";

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Función independiente de React/Redux: el encuentro se genera una sola vez.
export function chooseWildMoves(
  pokemon: Pokemon,
  catalog: readonly PokemonMove[],
  random: () => number = Math.random,
): LearnedMove[] {
  const compatible = new Set(
    pokemon.learnset?.moves.map((move) => move.id) ?? [],
  );
  const available = [
    ...new Map(
      catalog
        .map(getCuratedMove)
        .filter(
          (move) => compatible.has(move.id) && isGenerationThreeMove(move.id),
        )
        .map((move) => [move.id, move]),
    ).values(),
  ];
  if (!available.length) {
    throw new Error(
      "No hay movimientos compatibles de Emerald disponibles para esta especie.",
    );
  }
  const attack = pokemon.stats.find((s) => s.name === "attack")?.value;
  const special = pokemon.stats.find((s) => s.name === "special-attack")?.value;
  if (attack === undefined || special === undefined)
    throw new Error("Faltan los stats ofensivos del Pokémon.");
  const preferred =
    attack > special ? "physical" : special > attack ? "special" : null;
  const attacks = available.filter(
    (move) =>
      (move.damageClass === "physical" || move.damageClass === "special") &&
      move.power !== null &&
      move.power > 0,
  );
  const stab = attacks.filter((move) => pokemon.types.includes(move.type));
  const preferredStab = stab.filter(
    (move) => preferred === null || move.damageClass === preferred,
  );
  // Prioridad: STAB de su mejor categoría, otro STAB, otro ataque, cualquier move.
  const pool = preferredStab.length
    ? preferredStab
    : stab.length
      ? stab
      : attacks.length
        ? attacks
        : available;
  const competent = pool.filter((move) => (move.power ?? 0) >= 40);
  const guaranteed = shuffle(competent.length ? competent : pool, random)[0];
  const otherMoves = shuffle(
    available.filter((move) => move.id !== guaranteed.id),
    random,
  ).slice(0, 2);
  return [guaranteed, ...otherMoves].map((move) => ({
    ...move,
    source: "wild",
  }));
}

export async function generateWildEncounter(
  pokemon: Pokemon,
  loadMove: (id: number) => Promise<PokemonMove>,
  signal: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<BattleOpponent> {
  if (pokemon.learnset?.versionGroup !== MOVE_VERSION_GROUP)
    throw new Error(
      "Vuelve a buscar la especie para cargar su catálogo de Emerald.",
    );
  const opponent = createBattleOpponent(pokemon);
  const ids = [
    ...new Set(
      pokemon.learnset?.moves
        .map((move) => move.id)
        .filter(isGenerationThreeMove) ?? [],
    ),
  ];
  if (!ids.length) {
    throw new Error(
      "No se encontraron movimientos compatibles en Emerald para esta especie.",
    );
  }
  const catalog: PokemonMove[] = new Array(ids.length);
  let nextIndex = 0;
  let finished = 0;
  let failed = false;
  function checkCancelled() {
    if (signal.aborted)
      throw new DOMException("Encuentro cancelado", "AbortError");
  }
  async function worker() {
    while (!failed) {
      checkCancelled();
      const index = nextIndex++;
      if (index >= ids.length) return;
      try {
        catalog[index] = await loadMove(ids[index]);
        checkCancelled();
        onProgress?.(++finished, ids.length);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }
  onProgress?.(0, ids.length);
  // Máximo cuatro consultas simultáneas, con caché de RTK Query en loadMove.
  await Promise.all(
    Array.from({ length: Math.min(4, ids.length) }, () => worker()),
  );
  checkCancelled();
  return {
    ...opponent,
    kind: "wild",
    encounterId: nanoid(),
    moves: chooseWildMoves(opponent.pokemon, catalog),
  };
}
