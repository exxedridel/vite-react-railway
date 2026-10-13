import { useAppSelector } from "@/store/hooks";
import type { BattleResult } from "@/types/battle";

function outcomeLabel(result: BattleResult): string {
  switch (result.outcome) {
    case "hit":
      return "Acertó";
    case "status":
      return "Acertó";
    case "miss":
      return "Falló";
    case "immune":
      return "Sin efecto · inmune";
    case "manual":
      return "Resolución manual";
    default:
      return "No ejecutado";
  }
}

export default function PokemonLastMoveSummary({
  captureId,
  side,
}: {
  captureId: string;
  side: "player" | "opponent";
}) {
  const result = useAppSelector((state) =>
    side === "player"
      ? state.party.lastMovesByPlayer?.[captureId]
      : state.party.lastOpponentMove,
  );
  return (
    <section
      aria-label="Último movimiento"
      aria-live="polite"
      className="shrink-0 rounded-2xl border bg-card px-4 py-3 text-card-foreground"
    >
      <p className="text-xs text-muted-foreground">
        Último movimiento · {side === "player" ? "Tu Pokémon" : "Rival"}
      </p>
      {result ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-semibold">{result.moveName}</span>
          <span
            className={
              result.outcome === "hit" || result.outcome === "status"
                ? "text-green-500"
                : "text-muted-foreground"
            }
          >
            {outcomeLabel(result)}
          </span>
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Todavía no ha usado movimientos en este encuentro.
        </p>
      )}
    </section>
  );
}
