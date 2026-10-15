import type { WeatherKind } from "./battleField";
export type WeatherChoice = WeatherKind | "none";
export type WeatherGuide = {
  id: WeatherChoice;
  name: string;
  icon: string;
  effects: string[];
  abilities: string[];
};
/** Reglas R/S/E: no incluye bonificaciones ni habilidades de generaciones posteriores. */
export const GEN3_WEATHER: readonly WeatherGuide[] = [
  {
    id: "none",
    name: "Clear / Sin clima",
    icon: "🌤️",
    effects: [
      "Retira el clima activo de ambos lados. No modifica Mud Sport ni Water Sport.",
      "Fire y Water tienen daño normal; no hay daño residual por clima.",
      "Thunder conserva su precisión base del 70%, ajustada por Accuracy y Evasiveness.",
      "Solar Beam requiere preparación y tiene potencia normal. Weather Ball es Normal, potencia 50.",
      "Synthesis, Moonlight y Morning Sun recuperan 1/2 del HP máximo.",
    ],
    abilities: [
      "Sin efectos climáticos de Swift Swim, Chlorophyll, Rain Dish, Sand Veil ni Forecast.",
    ],
  },
  {
    id: "rain",
    name: "Rain",
    icon: "🌧️",
    effects: [
      "Daño Water ×1.5 y Fire ×0.5. Electric no recibe un aumento de daño por lluvia.",
      "Thunder evita la comprobación de Accuracy/Evasiveness; aún puede fallar por inmunidad u otras condiciones.",
      "Solar Beam mantiene la preparación y su potencia se reduce a la mitad.",
      "Weather Ball pasa a Water y duplica su potencia a 100; además recibe el modificador de lluvia y STAB si corresponde.",
      "Synthesis, Moonlight y Morning Sun recuperan 1/4 del HP máximo. La lluvia no causa daño residual ni cura Burn.",
    ],
    abilities: [
      "Swift Swim duplica Speed. Rain Dish recupera 1/16 del HP máximo al final del turno.",
      "Forecast transforma a Castform en Water. Drizzle invoca lluvia sin límite de turnos hasta ser reemplazada o acabar el combate.",
    ],
  },
  {
    id: "sun",
    name: "Sun",
    icon: "☀️",
    effects: [
      "Daño Fire ×1.5 y Water ×0.5.",
      "Thunder usa una precisión base del 50%, después ajustada por Accuracy y Evasiveness.",
      "Solar Beam se ejecuta sin turno de preparación y conserva su potencia.",
      "Weather Ball pasa a Fire y duplica su potencia a 100; además recibe el modificador de sol y STAB si corresponde.",
      "Synthesis, Moonlight y Morning Sun recuperan 2/3 del HP máximo.",
      "Evita nuevas congelaciones (Frozen); no descongela automáticamente a quien ya estaba congelado. No causa daño residual.",
    ],
    abilities: [
      "Chlorophyll duplica Speed. Forecast transforma a Castform en Fire.",
      "Drought invoca sol sin límite de turnos hasta ser reemplazado o acabar el combate.",
    ],
  },
  {
    id: "sand",
    name: "Sandstorm",
    icon: "🌪️",
    effects: [
      "Al finalizar el turno resta 1/16 del HP máximo a cada Pokémon vivo que no sea Rock, Ground ni Steel (mínimo 1 HP).",
      "En Gen 3 NO aumenta Special Defense de los Pokémon Rock y no aumenta el daño Rock, Ground ni Steel.",
      "Solar Beam mantiene la preparación y su potencia se reduce a la mitad.",
      "Weather Ball pasa a Rock y duplica su potencia a 100, sin bonificación adicional de daño por arena.",
      "Synthesis, Moonlight y Morning Sun recuperan 1/4 del HP máximo. Thunder mantiene su precisión base del 70%.",
      "En Emerald, Dig y Dive evitan el daño residual durante su fase subterránea o sumergida; Fly y Bounce no lo evitan.",
    ],
    abilities: [
      "Sand Veil multiplica por 0.8 la precisión de los movimientos dirigidos a su portador y lo protege del daño de arena.",
      "Sand Stream invoca arena sin límite de turnos hasta ser reemplazada o acabar el combate. Forecast no da a Castform una forma Rock.",
    ],
  },
  {
    id: "hail",
    name: "Hail",
    icon: "❄️",
    effects: [
      "Al finalizar el turno resta 1/16 del HP máximo a cada Pokémon vivo que no sea Ice (mínimo 1 HP).",
      "No aumenta el daño Ice ni la Defense. En Gen 3, Blizzard conserva su precisión del 70%: no obtiene acierto garantizado.",
      "Solar Beam mantiene la preparación y su potencia se reduce a la mitad.",
      "Weather Ball pasa a Ice y duplica su potencia a 100, sin bonificación adicional de daño por granizo.",
      "Synthesis, Moonlight y Morning Sun recuperan 1/4 del HP máximo. Thunder mantiene su precisión base del 70%.",
      "En Emerald, Dig y Dive evitan el daño residual durante su fase subterránea o sumergida; Fly y Bounce no lo evitan.",
    ],
    abilities: [
      "Forecast transforma a Castform en Ice. Snow Warning, Snow Cloak e Ice Body todavía no existen en Gen 3.",
    ],
  },
];
export const GEN3_WEATHER_COMMON = [
  "Solo puede haber un clima a la vez. Rain Dance, Sunny Day, Sandstorm y Hail duran 5 turnos y no se prolongan por volver a usar el mismo movimiento mientras siga activo.",
  "Drizzle, Drought y Sand Stream permanecen aunque su usuario se retire, hasta que otro clima los reemplace o termine el combate. En Gen 3 Hail no tiene una habilidad que lo haga permanente.",
  "Cloud Nine y Air Lock suprimen los efectos climáticos mientras su portador esté en el campo; no borran el clima ni detienen su contador.",
  "Los terrenos Electric, Grassy, Misty y Psychic no existen en Gen 3. Mud Sport y Water Sport son efectos de campo distintos del clima.",
] as const;
