import { useState } from "react";
import type { Pokemon } from "@/types/pokemon";
import { readSpriteBounds, type SpriteBounds } from "@/lib/spriteBounds";
const BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
export default function PokemonBattleSprite({
  pokemon,
  back,
  fainted = false,
  onPlayCry,
}: {
  pokemon: Pokemon;
  back: boolean;
  fainted?: boolean;
  onPlayCry: (id: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [bounds, setBounds] = useState<SpriteBounds | null>(null);
  const [anonymous, setAnonymous] = useState(true);
  const sources = Array.from(
    new Set([
      ...(back ? [`${BASE}/back/${pokemon.id}.png`] : []),
      `${BASE}/${pokemon.id}.png`,
      ...(pokemon.image ? [pokemon.image] : []),
    ]),
  );
  const src = sources[index];
  const ratio = bounds ? bounds.width / bounds.height : 1;
  return (
    <button
      type="button"
      className="battle-scene__sprite"
      onClick={() => onPlayCry(pokemon.id)}
      aria-label={`Escuchar el cry de ${pokemon.name}`}
      title={`Escuchar a ${pokemon.name}`}
    >
      {src ? (
        <span
          className={`battle-scene__sprite-frame ${fainted ? "battle-scene__fainted" : "battle-scene__breathing"}`}
          style={{
            aspectRatio: String(ratio),
            width: `min(100%, calc(var(--sprite-height) * ${ratio}))`,
          }}
        >
          <img
            key={`${src}:${anonymous}`}
            crossOrigin={anonymous ? "anonymous" : undefined}
            src={src}
            alt={pokemon.name}
            draggable={false}
            onLoad={(event) => setBounds(readSpriteBounds(event.currentTarget))}
            onError={() => {
              setBounds(null);
              if (anonymous) {
                setAnonymous(false);
              } else {
                setIndex((i) => i + 1);
                setAnonymous(true);
              }
            }}
            style={
              bounds
                ? {
                    position: "absolute",
                    width: `${(bounds.imageWidth / bounds.width) * 100}%`,
                    height: `${(bounds.imageHeight / bounds.height) * 100}%`,
                    left: `${(-bounds.x / bounds.width) * 100}%`,
                    top: `${(-bounds.y / bounds.height) * 100}%`,
                  }
                : undefined
            }
          />
        </span>
      ) : (
        <span className="rounded-lg bg-background/90 p-2 text-xs text-muted-foreground">
          <span className="block capitalize">{pokemon.name}</span>Sprite no
          disponible
        </span>
      )}
    </button>
  );
}
