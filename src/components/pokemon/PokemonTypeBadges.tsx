const TYPE_IDS: Record<string, number> = {
  normal: 1,
  fighting: 2,
  flying: 3,
  poison: 4,
  ground: 5,
  rock: 6,
  bug: 7,
  ghost: 8,
  steel: 9,
  fire: 10,
  water: 11,
  grass: 12,
  electric: 13,
  psychic: 14,
  ice: 15,
  dragon: 16,
  dark: 17,
  fairy: 18,
};

const TYPE_ICON_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-ix/scarlet-violet/small";

type Props = {
  types: string[];
};

export default function PokemonTypeBadges({ types }: Props) {
  return (
    <div className="flex flex-wrap gap-1">
      {types.map((type) => (
        <span
          key={type}
          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs capitalize text-muted-foreground"
        >
          {TYPE_IDS[type] && (
            <span className="inline-flex h-4 w-4 shrink-0 overflow-hidden rounded-full">
              <img
                src={`${TYPE_ICON_BASE}/${TYPE_IDS[type]}.png`}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover"
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            </span>
          )}

          {type}
        </span>
      ))}
    </div>
  );
}