export const STATUS_OPTIONS = [
  {
    id: "burned",
    label: "Burned",
    icon: "🔥",
    group: "primary",
    rule: "Causa daño al final del turno y normalmente reduce a la mitad el daño de los movimientos físicos.",
  },
  {
    id: "frozen",
    label: "Frozen",
    icon: "❄️",
    group: "primary",
    rule: "Impide actuar hasta descongelarse. Algunos movimientos pueden descongelar al Pokémon.",
  },
  {
    id: "paralyzed",
    label: "Paralyzed",
    icon: "⚡",
    group: "primary",
    rule: "Reduce la velocidad y puede impedir que el Pokémon actúe.",
  },
  {
    id: "asleep",
    label: "Asleep",
    icon: "💤",
    group: "primary",
    rule: "Impide usar la mayoría de los movimientos hasta despertar. Existen movimientos utilizables mientras duerme.",
  },
  {
    id: "poisoned",
    label: "Poisoned",
    icon: "☠️",
    group: "primary",
    rule: "Causa daño al final de cada turno.",
  },
  {
    id: "badly-poisoned",
    label: "Badly poisoned",
    icon: "☠️",
    group: "primary",
    rule: "Causa daño al final del turno que aumenta progresivamente mientras el Pokémon permanece en combate.",
  },
  {
    id: "confused",
    label: "Confusion",
    icon: "🌀",
    group: "additional",
    rule: "Al intentar actuar, tiene 1/3 de probabilidad de golpearse a sí mismo en lugar de ejecutar su movimiento. Se elimina al retirarse normalmente del combate.",
  },
  {
    id: "infatuated",
    label: "Infatuation",
    icon: "💕",
    group: "additional",
    rule: "Tiene un 50% de probabilidad de no actuar. Se elimina cuando el afectado o el Pokémon que provocó el efecto abandona el campo.",
  },
  {
    id: "taunted",
    label: "Taunt",
    icon: "😤",
    group: "additional",
    rule: "Impide utilizar movimientos de categoría Status durante 3 turnos de acción del afectado. Si ya había actuado al recibirlo, el turno de aplicación modifica el cómputo.",
  },
  {
    id: "flinched",
    label: "Flinch",
    icon: "💥",
    group: "additional",
    rule: "Impide actuar únicamente en el turno actual y solo sirve si el afectado todavía no ha actuado. No se conserva para el siguiente turno.",
  },
  {
    id: "bound",
    label: "Bound",
    icon: "🪢",
    group: "additional",
    rule: "Normalmente impide cambiar o huir y resta 1/8 del HP máximo al final de cada turno durante 4–5 turnos. Objetos y otras excepciones pueden modificarlo.",
  },
  {
    id: "trapped",
    label: "Trapped",
    icon: "🔒",
    group: "additional",
    rule: "Impide cambiar o huir mientras siga activa la causa que lo atrapa. No provoca daño por sí solo. Su duración y excepciones dependen del movimiento o habilidad.",
  },
  {
    id: "disabled",
    label: "Disable",
    icon: "🚫",
    group: "additional",
    rule: "Impide utilizar el último movimiento usado durante 4 turnos. Se debe identificar qué movimiento quedó desactivado.",
  },
  {
    id: "encored",
    label: "Encore",
    icon: "🔁",
    group: "additional",
    rule: "Obliga a repetir el último movimiento usado durante 3 turnos. Se debe identificar qué movimiento quedó fijado.",
  },
  {
    id: "perish-song",
    label: "Perish Song",
    icon: "🎵",
    group: "additional",
    rule: "La cuenta muestra 3 al terminar el turno de aplicación y baja al final de los siguientes turnos. Al llegar a 0, el Pokémon se debilita. Cambiar normalmente de Pokémon elimina la cuenta.",
  },
  {
    id: "leech-seed",
    label: "Leech Seed",
    icon: "🌱",
    group: "additional",
    rule: "Al final del turno drena 1/8 del HP máximo y cura al Pokémon en la posición del usuario original. Cambiar normalmente elimina el efecto. El movimiento falla contra tipos Grass.",
  },
] as const;

export type PokemonStatus = (typeof STATUS_OPTIONS)[number]["id"];
export type PokemonStat = { name: string; value: number };
export type BattleStageName =
  | "attack"
  | "defense"
  | "special-attack"
  | "special-defense"
  | "speed"
  | "accuracy"
  | "evasiveness";
export type BattleStages = Record<BattleStageName, number>;

export type Pokemon = {
  id: number;
  name: string;
  image: string | null;
  types: string[];
  // En la party: HP actual y los otros cinco stats calculados.
  // En la respuesta de pokeApi: valores base, hasta crear la captura.
  stats: PokemonStat[];
  // Opcionales únicamente para admitir respuestas de API y capturas antiguas.
  progressionVersion?: 1;
  level?: number;
  baseStats?: PokemonStat[];
  battleStages?: BattleStages;
};

export type LeveledPokemon = Pokemon & {
  progressionVersion: 1;
  level: number;
  baseStats: PokemonStat[];
  battleStages: BattleStages;
};

export type CapturedPokemon = {
  captureId: string;
  pokemon: Pokemon;
  statuses?: PokemonStatus[];
  // Respaldo de los valores previos a la migración; no interviene en el cálculo.
  legacyStats?: PokemonStat[];
};
