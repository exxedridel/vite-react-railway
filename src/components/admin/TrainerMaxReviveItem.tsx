import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getCurrentHp, isLeveled } from "@/lib/pokemonStats";
import type {
  TrainerChoice,
  TrainerSide,
  TrainerTeam,
} from "@/lib/trainerBattle/types";

export default function TrainerMaxReviveItem({
  team,
  side,
  stock,
  disabled,
  onChoose,
}: {
  team: TrainerTeam;
  side: TrainerSide;
  stock: number;
  disabled: boolean;
  onChoose: (choice: TrainerChoice) => void;
}) {
  const [targetId, setTargetId] = useState("");
  const target = team.pokemons.find((entry) => entry.captureId === targetId);
  const eligible =
    !!target && isLeveled(target.pokemon) && getCurrentHp(target.pokemon) === 0;
  return (
    <div className="space-y-2 border-t pt-3">
      <label className="block space-y-1 text-xs">
        <span>Pokémon debilitado que revivirá</span>
        <select
          className="min-h-10 w-full rounded-md border bg-background px-2"
          aria-label={`Pokémon para Max Revive de ${team.name}`}
          data-testid={`trainer-max-revive-target-${side}`}
          value={targetId}
          disabled={disabled}
          onChange={(event) => setTargetId(event.target.value)}
        >
          <option value="">Seleccionar Pokémon</option>
          {team.pokemons.map((entry) => (
            <option
              key={entry.captureId}
              value={entry.captureId}
              disabled={
                !isLeveled(entry.pokemon) || getCurrentHp(entry.pokemon) !== 0
              }
            >
              {entry.pokemon.name}
              {getCurrentHp(entry.pokemon) === 0 ? " · Debilitado" : ""}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full gap-2"
        aria-label={`Usar Max Revive de ${team.name}`}
        data-testid={`trainer-max-revive-${side}`}
        disabled={disabled || stock < 1 || !eligible}
        onClick={() => {
          if (target)
            onChoose({
              kind: "item",
              item: "max-revive",
              captureId: target.captureId,
            });
        }}
      >
        <img
          src="/admin-shop/max-revive.png"
          alt=""
          className="h-6 w-6 [image-rendering:pixelated]"
        />
        Max Revive · {stock}
      </Button>
      <p className="text-xs text-muted-foreground">
        Revive con todo su HP. Consume una unidad de la Bag del jugador y la
        acción del turno al ejecutarse.
      </p>
    </div>
  );
}
