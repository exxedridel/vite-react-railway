import { isPokemonFainted } from "@/lib/pokemonCondition";
import { useState, type ReactNode } from "react";
import { SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import PokemonStatusControl from "./PokemonStatusControl";
import type { CapturedPokemon, Pokemon } from "@/types/pokemon";
import type { BattleOpponent } from "@/lib/battleOpponent";
import "./PokemonBattleArena.css";

const SPRITE_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

type SpriteProps = {
  pokemon: Pokemon;
  back: boolean;
  fainted?: boolean;
  onPlayCry: (id: number) => void;
};

// El padre usa key por especie y perspectiva para reiniciar los fallbacks.
function BattleSprite({
  pokemon,
  back,
  fainted = false,
  onPlayCry,
}: SpriteProps) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = Array.from(
    new Set([
      ...(back ? [`${SPRITE_BASE}/back/${pokemon.id}.png`] : []),
      `${SPRITE_BASE}/${pokemon.id}.png`,
      ...(pokemon.image ? [pokemon.image] : []),
    ]),
  );
  const source = sources[sourceIndex];

  return (
    <button
      type="button"
      className="battle-scene__sprite"
      onClick={() => onPlayCry(pokemon.id)}
      aria-label={`Escuchar el cry de ${pokemon.name}`}
      title={`Escuchar a ${pokemon.name}`}
    >
      {source ? (
        <img
          key={source}
          src={source}
          alt={pokemon.name}
          draggable={false}
          onError={() => setSourceIndex((current) => current + 1)}
          className={
            fainted ? "battle-scene__fainted" : "battle-scene__breathing"
          }
        />
      ) : (
        <span className="rounded-lg bg-background/90 p-2 text-xs text-muted-foreground">
          <span className="block capitalize">{pokemon.name}</span>
          Sprite no disponible
        </span>
      )}
    </button>
  );
}

type Props = {
  rivalStatusControl?: ReactNode;
  manageControl?: ReactNode;
  capturedPokemon: CapturedPokemon;
  opponent: BattleOpponent | null;
  opponentView: boolean;
  onTogglePerspective: () => void;
  onPlayCry: (id: number) => void;
};

export default function PokemonBattleArena({
  capturedPokemon,
  rivalStatusControl,
  manageControl,
  opponent,
  opponentView,
  onTogglePerspective,
  onPlayCry,
}: Props) {
  const { pokemon } = capturedPokemon;
  const fainted = isPokemonFainted(pokemon);
  const opponentFainted = isPokemonFainted(opponent?.pokemon);

  return (
    <section
      aria-label={`Escenario de combate: ${pokemon.name}${opponent ? ` contra ${opponent.pokemon.name}` : ""}`}
      className="battle-scene shrink-0 rounded-3xl border"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-brand/20 via-background to-muted"
      />
      <div
        aria-hidden="true"
        className="battle-scene__ground border-t border-brand/20 bg-gradient-to-b from-brand/10 to-brand/25"
      />

      <div className="absolute left-3 top-3 z-30 max-w-[60%]">
        {opponentView ? (
          rivalStatusControl
        ) : (
          <PokemonStatusControl capturedPokemon={capturedPokemon} />
        )}
      </div>
      <div className="absolute right-3 top-3 z-30">{manageControl}</div>

      <div
        className={`battle-scene__combatant ${opponentView ? "battle-scene__combatant--far" : "battle-scene__combatant--near"}`}
      >
        <div
          aria-hidden="true"
          className="battle-scene__platform border border-brand/30 bg-muted shadow-sm"
        />
        <div
          aria-hidden="true"
          className="battle-scene__shadow bg-foreground/15"
        />
        {fainted && (
          <span
            role="status"
            aria-label={`${pokemon.name} debilitado`}
            className="absolute left-1/2 top-1 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-destructive px-2 py-1 text-[10px] font-semibold text-destructive-foreground"
          >
            Fainted
          </span>
        )}
        <BattleSprite
          key={`own-${capturedPokemon.captureId}-${opponentView}`}
          pokemon={pokemon}
          back={!opponentView}
          fainted={fainted}
          onPlayCry={onPlayCry}
        />
      </div>

      <div
        className={`battle-scene__combatant ${opponentView ? "battle-scene__combatant--near" : "battle-scene__combatant--far"}`}
      >
        <div
          aria-hidden="true"
          className="battle-scene__platform border border-brand/30 bg-muted shadow-sm"
        />
        {opponent && (
          <>
            {opponentFainted && (
              <span
                role="status"
                aria-label={`${opponent.pokemon.name} debilitado`}
                className="absolute left-1/2 top-1 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-destructive px-2 py-1 text-[10px] font-semibold text-destructive-foreground"
              >
                Fainted
              </span>
            )}
            <div
              aria-hidden="true"
              className="battle-scene__shadow bg-foreground/15"
            />
            <BattleSprite
              key={`rival-${opponent.pokemon.id}-${opponentView}`}
              pokemon={opponent.pokemon}
              back={opponentView}
              fainted={opponentFainted}
              onPlayCry={onPlayCry}
            />
          </>
        )}
      </div>

      <span
        aria-live="polite"
        className="absolute bottom-3 left-3 z-20 rounded-full border bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground"
      >
        {opponentView ? "Vista rival" : "Vista propia"}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={onTogglePerspective}
        aria-pressed={opponentView}
        aria-label={
          opponentView ? "Cambiar a vista propia" : "Cambiar a vista rival"
        }
        className="absolute bottom-3 right-3 z-30 h-10 w-10 rounded-full bg-background shadow-sm"
      >
        <SwitchCamera className="h-5 w-5 text-brand" />
      </Button>
    </section>
  );
}
