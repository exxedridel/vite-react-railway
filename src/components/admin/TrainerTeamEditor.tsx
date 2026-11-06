import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { nanoid } from "@reduxjs/toolkit";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PokemonTypeBadges from "@/components/pokemon/PokemonTypeBadges";
import { trainerMoves, trainerSpecies } from "@/lib/trainerBattle/catalog";
import type {
  TrainerPokemon,
  TrainerSide,
  TrainerTeam,
} from "@/lib/trainerBattle/types";
import {
  createLeveledPokemon,
  getCurrentHp,
  getMaxHp,
  preserveHpRatio,
} from "@/lib/pokemonStats";
import {
  isTimedStatus,
  withCleanStatusTurns,
  type StatusTurns,
  type TimedStatus,
} from "@/lib/statusTurns";
import { STATUS_OPTIONS, type PokemonStatus } from "@/types/pokemon";

type Props = {
  side: TrainerSide;
  team: TrainerTeam;
  hpMultiplier: number;
  onChange: (team: TrainerTeam) => void;
  disabled?: boolean;
};
type Draft = {
  captureId: string;
  speciesId: number;
  level: string;
  hp: string;
  moves: number[];
  statuses: PokemonStatus[];
  statusTurns: StatusTurns;
  statusContext: NonNullable<TrainerPokemon["trainerStatusContext"]>;
};

const selectClassName =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
const primaryStatuses = new Set<PokemonStatus>(
  STATUS_OPTIONS.filter((status) => status.group === "primary").map(
    (status) => status.id,
  ),
);
const moveById = new Map(trainerMoves.map((move) => [move.id, move]));

function buildPokemon(speciesId: number, level: number, hpMultiplier: number) {
  const species = trainerSpecies.find(
    (candidate) => candidate.id === speciesId,
  );
  if (!species || !Number.isSafeInteger(level) || level < 1 || level > 100)
    return null;
  return createLeveledPokemon(
    {
      id: species.id,
      name: species.name,
      types: [...species.types],
      image: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${species.id}.png`,
      stats: species.baseStats.map((stat) => ({ ...stat })),
    },
    species.baseStats,
    level,
    hpMultiplier,
  );
}

export default function TrainerTeamEditor({
  side,
  team,
  hpMultiplier,
  onChange,
  disabled = false,
}: Props) {
  const editorId = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [speciesSearch, setSpeciesSearch] = useState("");
  const [moveSearch, setMoveSearch] = useState("");
  const [error, setError] = useState("");
  const [teamError, setTeamError] = useState("");
  const draftMaxHpRef = useRef<number | null>(null);
  const defaultName = side === "a" ? "Jugador A" : "Líder de gimnasio";
  const calculated = useMemo(
    () =>
      draft
        ? buildPokemon(draft.speciesId, Number(draft.level), hpMultiplier)
        : null,
    [draft?.speciesId, draft?.level, hpMultiplier],
  );
  const maxHp = calculated ? getMaxHp(calculated)! : null;
  const selectedSpecies = trainerSpecies.find(
    (species) => species.id === draft?.speciesId,
  );
  const query = speciesSearch.trim().toLowerCase().replace(/^#/, "");
  const filteredSpecies = trainerSpecies.filter(
    (species) =>
      species.id === draft?.speciesId ||
      !query ||
      species.id === Number(query) ||
      species.name.toLowerCase().includes(query),
  );
  const moveQuery = moveSearch.trim().toLowerCase().replace(/^#/, "");
  const availableMoves = trainerMoves.filter(
    (move) =>
      !draft?.moves.includes(move.id) &&
      (!moveQuery ||
        move.id === Number(moveQuery) ||
        move.name.toLowerCase().includes(moveQuery) ||
        move.displayName.toLowerCase().includes(moveQuery)),
  );

  useEffect(() => {
    if (disabled) setDraft(null);
  }, [disabled]);

  function closeEditor() {
    setDraft(null);
    setError("");
  }

  function openEditor(member?: TrainerPokemon) {
    if (disabled || (!member && team.pokemons.length >= 6)) return;
    const speciesId = member?.pokemon.id ?? trainerSpecies[0]?.id ?? 1;
    const pokemon = member?.pokemon ?? buildPokemon(speciesId, 5, hpMultiplier);
    if (!pokemon) return;
    setEditingId(member?.captureId ?? null);
    setSpeciesSearch("");
    setMoveSearch("");
    setError("");
    draftMaxHpRef.current = getMaxHp(pokemon) ?? null;
    setDraft({
      captureId: member?.captureId ?? `${side}-${nanoid(14)}`,
      speciesId,
      level: String(pokemon.level ?? 5),
      hp: String(getCurrentHp(pokemon)),
      moves: member?.moves?.map((move) => move.id) ?? [],
      statuses: [...(member?.statuses ?? [])],
      statusTurns: { ...member?.statusTurns },
      statusContext: { ...member?.trainerStatusContext },
    });
  }

  function updateDraft(patch: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...patch } : null));
    setError("");
  }

  function changeDraftLevel(value: string) {
    if (!draft) return;
    const pokemon = buildPokemon(draft.speciesId, Number(value), hpMultiplier);
    const nextMax = pokemon ? getMaxHp(pokemon)! : null;
    const hp = Number(draft.hp);
    const patch: Partial<Draft> = { level: value };
    if (nextMax !== null) {
      if (
        draft.hp.trim() &&
        Number.isSafeInteger(hp) &&
        hp >= 0 &&
        draftMaxHpRef.current !== null
      )
        patch.hp = String(preserveHpRatio(hp, draftMaxHpRef.current, nextMax));
      draftMaxHpRef.current = nextMax;
    }
    updateDraft(patch);
  }

  function commitTeam(next: TrainerTeam): boolean {
    try {
      onChange(next);
      setTeamError("");
      return true;
    } catch (failure: unknown) {
      const message =
        failure instanceof Error
          ? failure.message
          : "No se pudo guardar el equipo. Intenta nuevamente.";
      setTeamError(message);
      if (draft) setError(message);
      toast.error(message);
      return false;
    }
  }

  function toggleStatus(status: PokemonStatus) {
    setDraft((current) => {
      if (!current) return null;
      const selected = current.statuses.includes(status);
      const statuses = selected
        ? current.statuses.filter((value) => value !== status)
        : [
            ...current.statuses.filter(
              (value) =>
                !primaryStatuses.has(status) || !primaryStatuses.has(value),
            ),
            status,
          ];
      const statusTurns = { ...current.statusTurns };
      if (!selected && isTimedStatus(status))
        statusTurns[status] = status === "taunted" ? 2 : 3;
      const clean = withCleanStatusTurns({ statuses, statusTurns });
      const statusContext = { ...current.statusContext };
      if (selected && status === "disabled")
        delete statusContext.disabledMoveId;
      if (selected && status === "encored") delete statusContext.encoredMoveId;
      return {
        ...current,
        statuses: clean.statuses,
        statusTurns: clean.statusTurns,
        statusContext,
      };
    });
    setError("");
  }

  function savePokemon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || disabled) return;
    if (!calculated || !draft.level.trim()) {
      setError("Elige una especie y un nivel entero entre 1 y 100.");
      return;
    }
    const hp = Number(draft.hp);
    if (
      !draft.hp.trim() ||
      !Number.isSafeInteger(hp) ||
      hp < 0 ||
      hp > maxHp!
    ) {
      setError(`El HP actual debe ser un entero entre 0 y ${maxHp}.`);
      return;
    }
    if (draft.moves.length < 1 || draft.moves.length > 4) {
      setError("Elige entre uno y cuatro movimientos para este Pokémon.");
      return;
    }
    for (const status of ["disabled", "encored"] as const) {
      if (!draft.statuses.includes(status)) continue;
      const moveId =
        status === "disabled"
          ? draft.statusContext.disabledMoveId
          : draft.statusContext.encoredMoveId;
      if (moveId === undefined || !draft.moves.includes(moveId)) {
        setError(
          `Elige un movimiento de este Pokémon para ${status === "disabled" ? "Disable" : "Encore"}. Si lo retiraste, selecciona otro.`,
        );
        return;
      }
    }
    if (draft.statuses.includes("infatuated")) {
      if (selectedSpecies?.gender === "N") {
        setError("Un Pokémon sin género no puede comenzar con Infatuation.");
        return;
      }
      if (selectedSpecies?.gender === null && !draft.statusContext.gender) {
        setError("Elige Macho o Hembra para configurar Infatuation.");
        return;
      }
    }
    if (!editingId && team.pokemons.length >= 6) {
      setError("Este equipo ya tiene seis Pokémon.");
      return;
    }
    const pokemon = {
      ...calculated,
      stats: calculated.stats.map((stat) =>
        stat.name === "hp" ? { ...stat, value: hp } : stat,
      ),
    };
    const previous = team.pokemons.find(
      (member) => member.captureId === editingId,
    );
    const member: TrainerPokemon = {
      ...previous,
      captureId: draft.captureId,
      pokemon,
      moves: draft.moves.map((id) => ({ ...moveById.get(id)! })),
      statuses: [...draft.statuses],
      statusTurns: { ...draft.statusTurns },
      trainerStatusContext: Object.keys(draft.statusContext).length
        ? { ...draft.statusContext }
        : undefined,
    };
    const pokemons = editingId
      ? team.pokemons.map((item) =>
          item.captureId === editingId ? member : item,
        )
      : [...team.pokemons, member];
    const active =
      pokemons.find(
        (item) =>
          item.captureId === team.activeCaptureId &&
          getCurrentHp(item.pokemon) > 0,
      ) ?? pokemons.find((item) => getCurrentHp(item.pokemon) > 0);
    if (
      commitTeam({
        ...team,
        pokemons,
        activeCaptureId: active?.captureId ?? null,
      })
    )
      closeEditor();
  }

  function removePokemon(captureId: string) {
    if (disabled) return;
    const pokemons = team.pokemons.filter(
      (member) => member.captureId !== captureId,
    );
    const active =
      pokemons.find(
        (member) =>
          member.captureId === team.activeCaptureId &&
          getCurrentHp(member.pokemon) > 0,
      ) ?? pokemons.find((member) => getCurrentHp(member.pokemon) > 0);
    commitTeam({
      ...team,
      pokemons,
      activeCaptureId: active?.captureId ?? null,
    });
  }

  return (
    <section
      aria-label={`Equipo ${side.toUpperCase()}`}
      className="min-w-0 space-y-4 rounded-2xl border bg-card p-4 text-card-foreground sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Equipo {side.toUpperCase()}</h2>
        <span className="text-sm text-muted-foreground">
          {team.pokemons.length}/6 Pokémon
        </span>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${editorId}-name`} className="text-sm font-medium">
          Jugador o líder
        </label>
        <Input
          id={`${editorId}-name`}
          className="h-11"
          value={team.name}
          maxLength={60}
          placeholder={defaultName}
          disabled={disabled}
          onChange={(event) =>
            commitTeam({ ...team, name: event.target.value })
          }
          onBlur={() => {
            if (!disabled)
              commitTeam({ ...team, name: team.name.trim() || defaultName });
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Marca el Pokémon que comenzará en el campo. Puedes configurar hasta
        seis.
      </p>
      {teamError && (
        <p role="alert" className="text-sm text-destructive">
          {teamError}
        </p>
      )}
      {team.pokemons.length ? (
        <div className="space-y-2">
          {team.pokemons.map((member) => {
            const { pokemon, captureId } = member;
            const active = team.activeCaptureId === captureId;
            const hp = getCurrentHp(pokemon);
            return (
              <article
                key={captureId}
                className={`rounded-xl border p-3 ${active ? "border-brand bg-muted/40" : "bg-background"}`}
              >
                <div className="flex items-start gap-2">
                  <img
                    src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`}
                    alt=""
                    loading="lazy"
                    className={`h-14 w-14 shrink-0 object-contain [image-rendering:pixelated] ${hp === 0 ? "grayscale opacity-60" : ""}`}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words font-semibold capitalize">
                      {pokemon.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Nv. {pokemon.level} · HP {hp}/{getMaxHp(pokemon)}
                      {hp === 0 ? " · Debilitado" : ""}
                    </p>
                    <div className="mt-1.5">
                      <PokemonTypeBadges types={pokemon.types} />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 w-10 shrink-0 p-0 text-destructive"
                    disabled={disabled}
                    aria-label={`Quitar a ${pokemon.name} del equipo ${side.toUpperCase()}`}
                    onClick={() => removePokemon(captureId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {member.moves?.map((move) => move.displayName).join(" · ") ||
                    "Sin movimientos"}
                </p>
                {!!member.statuses?.length && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {member.statuses
                      .map((status) => {
                        const option = STATUS_OPTIONS.find(
                          (item) => item.id === status,
                        );
                        const count = isTimedStatus(status)
                          ? member.statusTurns?.[status]
                          : undefined;
                        return `${option?.icon ?? ""} ${option?.label ?? status}${count ? ` (${count})` : ""}`;
                      })
                      .join(" · ")}
                  </p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={active ? "default" : "outline"}
                    className="min-h-10 gap-1.5 px-2"
                    aria-pressed={active}
                    disabled={disabled || hp <= 0}
                    onClick={() =>
                      commitTeam({ ...team, activeCaptureId: captureId })
                    }
                  >
                    {active && <Check className="h-4 w-4" />}
                    {active ? "Inicial" : "Elegir inicial"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-10 gap-1.5 px-2"
                    disabled={disabled}
                    onClick={() => openEditor(member)}
                  >
                    <Pencil className="h-4 w-4" /> Editar
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
          Agrega el primer Pokémon de este equipo.
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full gap-2"
        disabled={disabled || team.pokemons.length >= 6}
        onClick={() => openEditor()}
      >
        <Plus className="h-4 w-4" /> Agregar Pokémon
      </Button>

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl p-4 sm:max-w-[620px] sm:p-6">
          <DialogHeader className="shrink-0 pr-6">
            <DialogTitle>
              {editingId ? "Editar Pokémon" : "Agregar Pokémon"} ·{" "}
              {team.name || defaultName}
            </DialogTitle>
            <DialogDescription>
              Configura su nivel, salud, movimientos y estados antes de empezar.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p
              role="alert"
              className="shrink-0 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {draft && (
            <form
              onSubmit={savePokemon}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-0.5 pb-4">
                <fieldset className="space-y-2" disabled={disabled}>
                  <legend className="mb-2 text-sm font-semibold">
                    Especie
                  </legend>
                  <label
                    htmlFor={`${editorId}-species-search`}
                    className="sr-only"
                  >
                    Buscar especie
                  </label>
                  <Input
                    id={`${editorId}-species-search`}
                    className="h-11"
                    value={speciesSearch}
                    onChange={(event) => setSpeciesSearch(event.target.value)}
                    placeholder="Buscar por nombre o número"
                    autoComplete="off"
                  />
                  <label htmlFor={`${editorId}-species`} className="sr-only">
                    Elegir especie
                  </label>
                  <select
                    id={`${editorId}-species`}
                    className={selectClassName}
                    value={draft.speciesId}
                    onChange={(event) => {
                      const speciesId = Number(event.target.value);
                      const pokemon = buildPokemon(
                        speciesId,
                        Number(draft.level) || 5,
                        hpMultiplier,
                      );
                      draftMaxHpRef.current = pokemon
                        ? getMaxHp(pokemon)!
                        : null;
                      updateDraft({
                        speciesId,
                        hp: String(pokemon ? getMaxHp(pokemon) : 0),
                        statusContext: {},
                      });
                    }}
                  >
                    {filteredSpecies.map((species) => (
                      <option key={species.id} value={species.id}>
                        #{String(species.id).padStart(3, "0")} · {species.name}
                      </option>
                    ))}
                  </select>
                  {selectedSpecies && (
                    <PokemonTypeBadges types={selectedSpecies.types} />
                  )}
                </fieldset>

                {selectedSpecies && (
                  <fieldset className="space-y-2" disabled={disabled}>
                    <legend className="mb-2 text-sm font-semibold">
                      Género
                    </legend>
                    {selectedSpecies.gender === null ? (
                      <>
                        <label
                          htmlFor={`${editorId}-gender`}
                          className="sr-only"
                        >
                          Género de {selectedSpecies.name}
                        </label>
                        <select
                          id={`${editorId}-gender`}
                          className={selectClassName}
                          value={draft.statusContext.gender ?? ""}
                          onChange={(event) => {
                            const statusContext = { ...draft.statusContext };
                            if (
                              event.target.value === "M" ||
                              event.target.value === "F"
                            )
                              statusContext.gender = event.target.value;
                            else delete statusContext.gender;
                            updateDraft({ statusContext });
                          }}
                        >
                          <option value="">Automático</option>
                          <option value="M">Macho</option>
                          <option value="F">Hembra</option>
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Elige un género si este Pokémon participa en Attract o
                          Infatuation.
                        </p>
                      </>
                    ) : (
                      <p className="rounded-lg border bg-muted/30 p-3 text-sm">
                        {selectedSpecies.gender === "N"
                          ? "Sin género"
                          : selectedSpecies.gender === "M"
                            ? "Macho"
                            : "Hembra"}{" "}
                        · Fijo para esta especie.
                      </p>
                    )}
                  </fieldset>
                )}

                <fieldset
                  className="grid grid-cols-2 gap-3"
                  disabled={disabled}
                >
                  <div className="space-y-1.5">
                    <label
                      htmlFor={`${editorId}-level`}
                      className="text-sm font-medium"
                    >
                      Nivel
                    </label>
                    <Input
                      id={`${editorId}-level`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={100}
                      step={1}
                      className="h-11"
                      value={draft.level}
                      onChange={(event) => changeDraftLevel(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Entre 1 y 100 · HP ×{hpMultiplier.toFixed(1)}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor={`${editorId}-hp`}
                      className="text-sm font-medium"
                    >
                      HP actual
                    </label>
                    <Input
                      id={`${editorId}-hp`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={maxHp ?? undefined}
                      step={1}
                      className="h-11"
                      value={draft.hp}
                      onChange={(event) =>
                        updateDraft({ hp: event.target.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-10 w-full px-2 text-xs"
                      disabled={maxHp === null}
                      onClick={() => updateDraft({ hp: String(maxHp) })}
                    >
                      HP máximo{maxHp === null ? "" : `: ${maxHp}`}
                    </Button>
                  </div>
                </fieldset>

                <fieldset className="space-y-2" disabled={disabled}>
                  <legend className="mb-2 text-sm font-semibold">
                    Movimientos · {draft.moves.length}/4
                  </legend>
                  {draft.moves.map((id) => {
                    const move = moveById.get(id);
                    return (
                      <div
                        key={id}
                        className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {move?.displayName ?? `Movimiento #${id}`}
                          </p>
                          <p className="text-xs capitalize text-muted-foreground">
                            {move?.type} · {move?.pp} PP
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-10 w-10 shrink-0 p-0"
                          aria-label={`Quitar ${move?.displayName ?? id}`}
                          onClick={() =>
                            updateDraft({
                              moves: draft.moves.filter(
                                (value) => value !== id,
                              ),
                            })
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                  {draft.moves.length < 4 && (
                    <>
                      <label
                        htmlFor={`${editorId}-move-search`}
                        className="sr-only"
                      >
                        Buscar movimiento
                      </label>
                      <Input
                        id={`${editorId}-move-search`}
                        className="h-11"
                        value={moveSearch}
                        onChange={(event) => setMoveSearch(event.target.value)}
                        placeholder="Buscar movimiento de Gen I–III"
                        autoComplete="off"
                      />
                      <label htmlFor={`${editorId}-move`} className="sr-only">
                        Agregar movimiento
                      </label>
                      <select
                        id={`${editorId}-move`}
                        className={selectClassName}
                        value=""
                        onChange={(event) => {
                          const id = Number(event.target.value);
                          if (moveById.has(id) && !draft.moves.includes(id)) {
                            updateDraft({ moves: [...draft.moves, id] });
                            setMoveSearch("");
                          }
                        }}
                      >
                        <option value="" disabled>
                          {availableMoves.length
                            ? "Seleccionar movimiento…"
                            : "Sin resultados"}
                        </option>
                        {availableMoves.map((move) => (
                          <option key={move.id} value={move.id}>
                            {move.displayName} · {move.type} · {move.pp} PP
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Elige al menos un movimiento. El catálogo del administrador
                    permite los 354 de Gen III.
                  </p>
                </fieldset>

                <fieldset className="space-y-3" disabled={disabled}>
                  <legend className="mb-2 text-sm font-semibold">
                    Estados negativos
                  </legend>
                  <p className="text-xs text-muted-foreground">
                    Un estado principal y efectos adicionales combinables.
                  </p>
                  {(["primary", "additional"] as const).map((group) => (
                    <div key={group} className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground">
                        {group === "primary"
                          ? "Estado principal"
                          : "Efectos adicionales"}
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {STATUS_OPTIONS.filter(
                          (option) => option.group === group,
                        ).map((option) => {
                          const selected = draft.statuses.includes(option.id);
                          const contextMoveId =
                            option.id === "disabled"
                              ? draft.statusContext.disabledMoveId
                              : option.id === "encored"
                                ? draft.statusContext.encoredMoveId
                                : undefined;
                          return (
                            <div key={option.id} className="min-w-0 space-y-1">
                              <button
                                type="button"
                                aria-pressed={selected}
                                title={option.rule}
                                onClick={() => toggleStatus(option.id)}
                                className={`min-h-11 w-full rounded-lg border px-2 py-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${selected ? "border-brand bg-muted font-semibold" : "bg-background hover:bg-muted"}`}
                              >
                                {option.icon} {option.label}
                                {selected ? " ✓" : ""}
                              </button>
                              {selected && isTimedStatus(option.id) && (
                                <select
                                  className={selectClassName}
                                  aria-label={`Turnos de ${option.label}`}
                                  value={draft.statusTurns[option.id] ?? 3}
                                  onChange={(event) =>
                                    updateDraft({
                                      statusTurns: {
                                        ...draft.statusTurns,
                                        [option.id as TimedStatus]: Number(
                                          event.target.value,
                                        ),
                                      },
                                    })
                                  }
                                >
                                  {[1, 2, 3, 4, 5, 6].map((turns) => (
                                    <option key={turns} value={turns}>
                                      {turns} turno{turns === 1 ? "" : "s"}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {selected &&
                                (option.id === "disabled" ||
                                  option.id === "encored") && (
                                  <>
                                    <select
                                      className={selectClassName}
                                      aria-label={`Movimiento afectado por ${option.label}`}
                                      value={contextMoveId ?? ""}
                                      onChange={(event) =>
                                        updateDraft({
                                          statusContext: {
                                            ...draft.statusContext,
                                            [option.id === "disabled"
                                              ? "disabledMoveId"
                                              : "encoredMoveId"]: Number(
                                              event.target.value,
                                            ),
                                          },
                                        })
                                      }
                                    >
                                      <option value="" disabled>
                                        {draft.moves.length
                                          ? "Movimiento afectado…"
                                          : "Agrega movimientos primero"}
                                      </option>
                                      {contextMoveId !== undefined &&
                                        !draft.moves.includes(
                                          contextMoveId,
                                        ) && (
                                          <option
                                            value={contextMoveId}
                                            disabled
                                          >
                                            Movimiento retirado · selecciona
                                            otro
                                          </option>
                                        )}
                                      {draft.moves.map((moveId) => (
                                        <option key={moveId} value={moveId}>
                                          {moveById.get(moveId)?.displayName ??
                                            `Movimiento #${moveId}`}
                                        </option>
                                      ))}
                                    </select>
                                    {(contextMoveId === undefined ||
                                      !draft.moves.includes(contextMoveId)) && (
                                      <p className="text-xs text-destructive">
                                        Selecciona uno de los movimientos
                                        elegidos.
                                      </p>
                                    )}
                                  </>
                                )}
                              {selected && option.id === "infatuated" && (
                                <p
                                  className={`text-xs ${selectedSpecies?.gender === "N" ? "text-destructive" : "text-muted-foreground"}`}
                                >
                                  {selectedSpecies?.gender === "N"
                                    ? "Esta especie sin género no puede tener Infatuation."
                                    : "Este Pokémon y el rival inicial deben tener géneros opuestos. Configura Género en ambos equipos."}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </fieldset>
              </div>
              <DialogFooter className="shrink-0 gap-2 border-t pt-3">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={closeEditor}
                >
                  Cancelar
                </Button>
                <Button type="submit" className="min-h-11" disabled={disabled}>
                  Guardar Pokémon
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
