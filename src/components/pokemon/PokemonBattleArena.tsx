import { getCurrentHp, getMaxHp } from "@/lib/pokemonStats";
import { WEATHER_LABELS, type BattleField } from "@/lib/battleField";
import { Progress } from "@/components/ui/progress";
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
  field: BattleField;
  onOpenHp: (side: "player" | "opponent") => void;
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
  field,
  onOpenHp,
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
      data-weather={field.weather?.kind ?? "none"}
      data-mud={!!field.mudSport}
      data-water={!!field.waterSport}
    >
      <div aria-hidden="true" className="battle-scene__sky" />
      <div aria-hidden="true" className="battle-scene__ground" />

      <div aria-hidden="true" className="battle-scene__weather" />
      <div aria-hidden="true" className="battle-scene__field-overlay" />
      <div className="battle-scene__field-label" aria-live="polite">
        {field.weather && (
          <span>
            {
              ({ sun: "☀️", rain: "🌧️", sand: "🌪️", hail: "❄️" } as const)[
                field.weather.kind
              ]
            }{" "}
            {WEATHER_LABELS[field.weather.kind]} · {field.weather.turnsLeft}
          </span>
        )}
        {field.mudSport && <span>🟤 Mud Sport</span>}
        {field.waterSport && <span>💧 Water Sport</span>}
      </div>
      <ArenaHp
        pokemon={pokemon}
        position={opponentView ? "far" : "near"}
        side="player"
        onClick={() => onOpenHp("player")}
      />
      {opponent && (
        <ArenaHp
          pokemon={opponent.pokemon}
          position={opponentView ? "near" : "far"}
          side="opponent"
          onClick={() => onOpenHp("opponent")}
        />
      )}
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
        className="battle-scene__perspective rounded-full border bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground"
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

function ArenaHp({
  pokemon,
  position,
  side,
  onClick,
}: {
  pokemon: Pokemon;
  position: "near" | "far";
  side: "player" | "opponent";
  onClick: () => void;
}) {
  const current = getCurrentHp(pokemon),
    max = getMaxHp(pokemon),
    percent = max ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const color =
    percent < 20
      ? "[&>div]:bg-red-500"
      : percent < 50
        ? "[&>div]:bg-yellow-500"
        : "[&>div]:bg-green-500";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Modificar HP de ${pokemon.name}: ${current} de ${max ?? "desconocido"}`}
      aria-haspopup="dialog"
      data-side={side}
      className={`battle-scene__hp battle-scene__hp--${position} border bg-card/95 text-card-foreground shadow-md`}
    >
      <span className="flex items-center justify-between gap-1">
        <strong className="truncate text-xs capitalize">{pokemon.name}</strong>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          Lv. {pokemon.level ?? 50}
        </span>
      </span>
      <span className="mb-1 flex justify-between text-[10px] tabular-nums">
        <span>HP</span>
        <span>
          {current}/{max ?? "—"}
        </span>
      </span>
      <Progress
        value={percent}
        className={`h-2 ${color}`}
        aria-label={`HP de ${pokemon.name}`}
        aria-valuetext={`${current} de ${max ?? "desconocido"}`}
      />
    </button>
  );
}
