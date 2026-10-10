import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { useAppDispatch } from "@/store/hooks";
import {
  togglePokemonStatus,
  clearPokemonStatuses,
} from "@/slices/partySlice";

import {
  STATUS_OPTIONS,
  type CapturedPokemon,
  type PokemonStatus,
} from "@/types/pokemon";

type Props = {
  capturedPokemon: CapturedPokemon;
};

function PokemonStatusControl({ capturedPokemon }: Props) {
  const dispatch = useAppDispatch();
  const id = useId();

  const [open, setOpen] = useState(false);

  const { captureId } = capturedPokemon;
  const statuses = capturedPokemon.statuses ?? [];

  const activeOptions = STATUS_OPTIONS.filter((option) =>
    statuses.includes(option.id)
  );

  const visibleOptions = activeOptions.slice(0, 2);
  const remainingCount = activeOptions.length - visibleOptions.length;

  const handleToggle = (status: PokemonStatus) => {
    dispatch(togglePokemonStatus({ captureId, status }));
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Popover modal open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-2 rounded-full bg-background"
            aria-label={`Editar estados de ${capturedPokemon.pokemon.name}`}
          >
            Estado

            {activeOptions.length > 0 && (
              <span className="text-brand">
                {activeOptions.length}
              </span>
            )}

            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={8}
          avoidCollisions
          collisionPadding={16}
          sticky="always"
          aria-labelledby={`${id}-title`}
          className="
            flex min-h-0 w-80 flex-col
            max-w-[calc(100vw-32px)]
            max-h-[min(var(--radix-popover-content-available-height),calc(100dvh-32px))]
            overflow-hidden p-0
          "
        >
          {/* Contenido desplazable */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain touch-pan-y p-4">
            <div>
              <h3 id={`${id}-title`} className="font-semibold">
                Estados del Pokémon
              </h3>

              <p className="mt-1 text-xs text-muted-foreground">
                Pulsa para activar o quitar. Los cambios se guardan
                automáticamente.
              </p>
            </div>

            {(["primary", "additional"] as const).map((group) => (
              <div key={group} className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground">
                  {group === "primary"
                    ? "Principal · selecciona uno"
                    : "Adicionales · combinables"}
                </h4>

                <div className="grid grid-cols-2 gap-2">
                  {STATUS_OPTIONS
                    .filter((option) => option.group === group)
                    .map((option) => {
                      const active = statuses.includes(option.id);

                      return (
                        <Button
                          key={option.id}
                          type="button"
                          variant={active ? "secondary" : "outline"}
                          aria-pressed={active}
                          onClick={() => handleToggle(option.id)}
                          className="h-auto min-h-10 justify-start gap-1.5 px-2 py-2 text-xs"
                        >
                          <span aria-hidden="true">
                            {option.icon}
                          </span>

                          <span className="min-w-0 whitespace-normal text-left">
                            {option.label}
                          </span>

                          {active && (
                            <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-brand" />
                          )}
                        </Button>
                      );
                    })}
                </div>
              </div>
            ))}

            {activeOptions.length > 0 && (
              <div className="space-y-3 border-t pt-3">
                <h4 className="text-sm font-semibold">
                  Reglas de los estados activos
                </h4>

                {activeOptions.map((option) => (
                  <div
                    key={option.id}
                    className="rounded-lg bg-muted/50 p-3"
                  >
                    <p className="text-xs font-semibold">
                      <span aria-hidden="true">
                        {option.icon}
                      </span>{" "}
                      {option.label}
                    </p>

                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {option.rule}
                    </p>
                  </div>
                ))}

                <p className="text-xs text-muted-foreground">
                  Por ahora, aplica manualmente los efectos y retira
                  los estados cuando terminen.
                </p>
              </div>
            )}
          </div>

          {/* Pie fijo: permanece visible mientras desplazas la lista */}
          <div
            className="
              shrink-0 border-t bg-popover px-3 pt-3
              pb-[max(0.75rem,env(safe-area-inset-bottom))]
            "
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full whitespace-normal"
              disabled={activeOptions.length === 0}
              onClick={() => dispatch(clearPokemonStatuses(captureId))}
            >
              Quitar todos los estados
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Resumen visible sobre el escenario */}
      {activeOptions.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1"
          aria-label="Estados activos"
          aria-live="polite"
        >
          {visibleOptions.map((option) => (
            <span
              key={option.id}
              className="inline-flex items-center gap-1 rounded-full border bg-background/95 px-2 py-1 text-[11px] font-medium"
            >
              <span aria-hidden="true">
                {option.icon}
              </span>

              {option.label}
            </span>
          ))}

          {remainingCount > 0 && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={`Ver ${remainingCount} estados adicionales`}
              className="rounded-full border bg-background px-2 py-1 text-xs font-semibold text-brand"
            >
              +{remainingCount}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default PokemonStatusControl;