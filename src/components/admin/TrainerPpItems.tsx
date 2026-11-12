import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getCurrentMovePp, getMaxMovePp } from "@/lib/movePp";
import type { ConsumableItemId } from "@/lib/shop/types";
import type { TrainerTeam, TrainerChoice } from "@/lib/trainerBattle/types";

export default function TrainerPpItems({
  team,
  stock,
  disabled,
  onChoose,
}: {
  team: TrainerTeam;
  stock?: Partial<Record<ConsumableItemId, number>>;
  disabled: boolean;
  onChoose: (choice: TrainerChoice) => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [moveId, setMoveId] = useState("");
  const target = team.pokemons.find((c) => c.captureId === targetId);
  const moves = target?.moves ?? [];
  const selected = moves.find((m) => m.id === Number(moveId));
  const needs = (move: (typeof moves)[number]) =>
    getCurrentMovePp(move) < getMaxMovePp(move);
  return (
    <div
      className="space-y-2 border-t pt-3"
      aria-label={`Objetos PP de ${team.name}`}
    >
      <label className="block space-y-1 text-xs">
        <span>Pokémon que recuperará sus PP</span>
        <select
          className="min-h-10 w-full rounded-md border bg-background px-2"
          aria-label={`Pokémon para objetos PP de ${team.name}`}
          value={targetId}
          disabled={disabled}
          onChange={(event) => {
            setTargetId(event.target.value);
            setMoveId("");
          }}
        >
          <option value="">Seleccionar Pokémon</option>
          {team.pokemons.map((c) => (
            <option
              key={c.captureId}
              value={c.captureId}
              disabled={!c.moves?.some(needs)}
            >
              {c.pokemon.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-xs">
        <span>Movimiento para Max Ether</span>
        <select
          className="min-h-10 w-full rounded-md border bg-background px-2"
          aria-label={`Movimiento para Max Ether de ${team.name}`}
          value={moveId}
          disabled={disabled || !target}
          onChange={(event) => setMoveId(event.target.value)}
        >
          <option value="">Seleccionar movimiento</option>
          {moves.map((move) => (
            <option key={move.id} value={move.id} disabled={!needs(move)}>
              {move.displayName} · {getCurrentMovePp(move)}/{getMaxMovePp(move)}{" "}
              PP
            </option>
          ))}
        </select>
      </label>
      {(["max-ether", "max-elixir"] as const).map((item) => {
        const ether = item === "max-ether",
          name = ether ? "Max Ether" : "Max Elixir";
        const count = stock?.[item] ?? 0;
        return (
          <Button
            key={item}
            variant="outline"
            className="min-h-11 w-full gap-2"
            aria-label={`Usar ${name} de ${team.name}`}
            disabled={
              disabled ||
              count < 1 ||
              !target ||
              (ether ? !selected || !needs(selected) : !moves.some(needs))
            }
            onClick={() =>
              onChoose({
                kind: "item",
                item,
                captureId: target!.captureId,
                ...(ether ? { moveId: selected!.id } : {}),
              })
            }
          >
            <img
              src={`/admin-shop/${item}.png`}
              alt=""
              className="h-6 w-6 [image-rendering:pixelated]"
            />
            {name} · {count}
          </Button>
        );
      })}
      <p className="text-xs text-muted-foreground">
        El objeto restaura PP y consume la acción del turno al ejecutarse.
      </p>
    </div>
  );
}
