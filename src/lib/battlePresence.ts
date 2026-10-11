import type { BattleOpponent } from "@/lib/battleOpponent";
import { hasLivingHp, isPokemonFainted } from "@/lib/pokemonCondition";

export function getBattlePresence(opponent: BattleOpponent | null | undefined) {
  const active = hasLivingHp(opponent?.pokemon);
  return {
    active,
    key:
      active && opponent
        ? `${opponent.kind ?? "trainer"}:${opponent.encounterId ?? opponent.pokemon.id}`
        : null,
    label: !opponent
      ? "Sin combate activo"
      : isPokemonFainted(opponent.pokemon)
        ? "Oponente debilitado"
        : active
          ? "En combate"
          : "Preparando combate",
  };
}
