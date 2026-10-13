import {
  CURATED_MOVE_CATALOG,
  NUMERIC_MOVE_INPUTS,
} from "@/lib/curatedMoveCatalog";
import type { MoveExecutionOptions } from "@/lib/moveCatalogTypes";
import { Input } from "@/components/ui/input";
export function optionsProblem(
  moveId: number,
  options: MoveExecutionOptions,
): string | null {
  const e = CURATED_MOVE_CATALOG[moveId];
  if (!e) return null;
  if (
    e.preparation &&
    !(moveId === 76 && options.weather === "sun") &&
    !options.preparationConfirmed
  )
    return "Confirma el turno de preparación.";
  if (e.confirmation && !options.specialConditionConfirmed)
    return "Confirma la condición de este movimiento.";
  const n = NUMERIC_MOVE_INPUTS[moveId];
  if (
    n &&
    (!Number.isFinite(options.numericValue) ||
      options.numericValue! < n.min ||
      options.numericValue! > n.max ||
      (n.step === 1 && !Number.isInteger(options.numericValue)))
  )
    return "Completa el dato adicional del movimiento.";
  if (
    (moveId === 214 || e.effects.some((f) => f.status === "flinched")) &&
    options.targetHasActed === undefined
  )
    return "Indica si el objetivo ya actuó para resolver Flinch.";
  return null;
}
export default function PokemonMoveExecutionOptions({
  moveId,
  value,
  onChange,
}: {
  moveId: number;
  value: MoveExecutionOptions;
  onChange: (next: MoveExecutionOptions) => void;
}) {
  const e = CURATED_MOVE_CATALOG[moveId],
    n = NUMERIC_MOVE_INPUTS[moveId];
  if (!e) return null;
  const hasFields =
    (!!e.preparation && !(moveId === 76 && value.weather === "sun")) ||
    !!e.confirmation ||
    !!n ||
    [214, 228, 279].includes(moveId) ||
    e.effects.some((f) => f.status === "flinched");
  if (!hasFields) return null;
  return (
    <div className="space-y-3 rounded-xl border p-3 text-sm">
      {e.preparation && !(moveId === 76 && value.weather === "sun") && (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={!!value.preparationConfirmed}
            onChange={(ev) =>
              onChange({ ...value, preparationConfirmed: ev.target.checked })
            }
          />
          <span>{e.preparation}</span>
        </label>
      )}
      {[228, 279].includes(moveId) && (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={!!value.powerBoostConfirmed}
            onChange={(ev) =>
              onChange({ ...value, powerBoostConfirmed: ev.target.checked })
            }
          />
          <span>
            {moveId === 228
              ? "El objetivo se está retirando este turno (potencia doble, no falla por precisión)."
              : "El objetivo fue el último que dañó al usuario este turno (potencia doble)."}
          </span>
        </label>
      )}
      {e.confirmation && (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={!!value.specialConditionConfirmed}
            onChange={(ev) =>
              onChange({
                ...value,
                specialConditionConfirmed: ev.target.checked,
              })
            }
          />
          <span>{e.confirmation}</span>
        </label>
      )}
      {n && (
        <label className="block space-y-1">
          <span>{n.label}</span>
          <Input
            type="number"
            min={n.min}
            max={n.max}
            step={n.step}
            value={value.numericValue ?? ""}
            onChange={(ev) =>
              onChange({
                ...value,
                numericValue:
                  ev.target.value === "" ? undefined : Number(ev.target.value),
              })
            }
          />
        </label>
      )}
      {(moveId === 214 || e.effects.some((f) => f.status === "flinched")) && (
        <label className="block space-y-1">
          <span>¿El objetivo ya actuó en este turno?</span>
          <select
            className="w-full rounded-md border bg-background p-2 text-foreground"
            value={
              value.targetHasActed === undefined
                ? ""
                : value.targetHasActed
                  ? "yes"
                  : "no"
            }
            onChange={(ev) =>
              onChange({
                ...value,
                targetHasActed:
                  ev.target.value === ""
                    ? undefined
                    : ev.target.value === "yes",
              })
            }
          >
            <option value="">Selecciona…</option>
            <option value="no">No: puede recibir Flinch</option>
            <option value="yes">Sí: Flinch no tendrá efecto</option>
          </select>
          <span className="block text-xs text-muted-foreground">
            Finalizar turno retirará Flinch automáticamente.
          </span>
        </label>
      )}
    </div>
  );
}
