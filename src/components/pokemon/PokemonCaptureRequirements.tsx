import type { BattleOpponent } from "@/lib/battleOpponent";
import { captureRequirements } from "@/lib/captureRates";
export default function PokemonCaptureRequirements({
  opponent,
}: {
  opponent: BattleOpponent;
}) {
  const info = captureRequirements(opponent.pokemon, opponent.statuses);
  if (!info)
    return (
      <p className="text-sm text-destructive">
        No se puede calcular la captura: el Pokémon debe estar vivo y pertenecer
        al catálogo de generaciones I–III.
      </p>
    );
  return (
    <div className="space-y-3">
      <div className="rounded-xl border p-3 text-sm space-y-1">
        <p className="font-semibold">
          <span
            aria-hidden="true"
            className="mr-2 inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: info.tier.hexColor }}
          />
          {info.tier.name} · objetivo base {info.tier.targetD20}
        </p>
        <p className="text-muted-foreground">
          HP{" "}
          {info.health === "critical"
            ? "rojo (<20%)"
            : info.health === "half"
              ? "amarillo (20–<50%)"
              : "verde (≥50%)"}
          : −{info.hpBonus}
        </p>
        <p className="text-muted-foreground">
          {info.statusLabel}: −{info.statusBonus}
        </p>
      </div>
      <table className="w-full text-sm">
        <caption className="mb-2 text-left font-semibold">
          Mínimo necesario en tu D20 físico
        </caption>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2">Pokebola</th>
            <th className="py-2 text-right">Resultado mínimo</th>
          </tr>
        </thead>
        <tbody>
          {info.balls.map((ball) => (
            <tr key={ball.id} className="border-b">
              <td className="py-2">
                {ball.name}
                {ball.id !== "master" && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (−{ball.bonus})
                  </span>
                )}
              </td>
              <td className="py-2 text-right font-bold tabular-nums">
                {ball.minimum === null ? "Garantizada" : `${ball.minimum}+`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        Frozen y Asleep descuentan 4. Paralyzed, Burned, Poisoned y Badly
        poisoned descuentan 2. Los estados secundarios no dan descuento y los
        bonos no se acumulan. Tira tu D20 físico y compara con la pokebola
        usada. Master Ball no requiere tirada. El mínimo es 1; un 1 natural no
        falla automáticamente en estas reglas.
      </p>
    </div>
  );
}
