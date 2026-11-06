import { useEffect, useRef } from "react";
import { SwitchCamera, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import PokemonBattleSprite from "@/components/pokemon/PokemonBattleSprite";
import TrainerBattleMusicControl from "./TrainerBattleMusicControl";
import { getCurrentHp, getMaxHp } from "@/lib/pokemonStats";
import { battleSpeed } from "@/lib/battleSpeed";
import { WEATHER_LABELS } from "@/lib/battleField";
import { GEN3_WEATHER } from "@/lib/gen3Weather";
import { STATUS_OPTIONS, type CapturedPokemon } from "@/types/pokemon";
import type {
  TrainerBattleSession,
  TrainerSide,
} from "@/lib/trainerBattle/types";
import "@/components/pokemon/PokemonBattleArena.css";

type Props = {
  session: TrainerBattleSession;
  flipped: boolean;
  onTogglePerspective: () => void;
};

function ActiveHp({
  capture,
  trainer,
  side,
  near,
  fastest,
}: {
  capture: CapturedPokemon;
  trainer: string;
  side: TrainerSide;
  near: boolean;
  fastest: boolean;
}) {
  const current = getCurrentHp(capture.pokemon);
  const max = getMaxHp(capture.pokemon);
  const percent = max ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const color =
    percent < 20
      ? "[&>div]:bg-red-500"
      : percent < 50
        ? "[&>div]:bg-yellow-500"
        : "[&>div]:bg-green-500";
  const statuses = STATUS_OPTIONS.filter((status) =>
    capture.statuses?.includes(status.id),
  );
  return (
    <div
      className={`battle-scene__hud battle-scene__hud--${near ? "near" : "far"}`}
    >
      <div
        className="battle-scene__hp border bg-card/95 text-card-foreground shadow-md"
        style={{ cursor: "default" }}
        role="group"
        aria-label={`HP de ${capture.pokemon.name}, equipo de ${trainer}`}
      >
        <p className="truncate text-[10px] font-semibold text-muted-foreground">
          {side.toUpperCase()} · {trainer}
        </p>
        <div className="flex items-center justify-between gap-1">
          <span className="flex min-w-0 items-center gap-1">
            <strong className="truncate text-xs capitalize">
              {capture.pokemon.name}
            </strong>
            {fastest && (
              <Zap
                className="h-3.5 w-3.5 shrink-0 text-yellow-500"
                aria-label="Mayor velocidad o empate"
              />
            )}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            Lv. {capture.pokemon.level}
          </span>
        </div>
        <div className="mb-1 flex justify-between text-[10px] tabular-nums">
          <span>HP{current <= 0 ? " · Debilitado" : ""}</span>
          <span>
            {current}/{max ?? "—"}
          </span>
        </div>
        <Progress
          value={percent}
          className={`h-2 ${color}`}
          aria-label={`HP de ${capture.pokemon.name}`}
          aria-valuetext={`${current} de ${max ?? "desconocido"} HP`}
        />
      </div>
      {!!statuses.length && (
        <div className="battle-scene__status rounded-lg border bg-background/90 p-1">
          <div className="grid grid-cols-2 gap-1 text-center text-sm">
            {statuses.map((status) => (
              <span
                key={status.id}
                role="img"
                title={status.label}
                aria-label={status.label}
              >
                {status.icon}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TrainerBattleArena({
  session,
  flipped,
  onTogglePerspective,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );
  const active = (side: TrainerSide) =>
    session.teams[side].pokemons.find(
      (capture) => capture.captureId === session.teams[side].activeCaptureId,
    );
  const a = active("a"),
    b = active("b");
  const speedA = a ? battleSpeed(a.pokemon, a.statuses) : null;
  const speedB = b ? battleSpeed(b.pokemon, b.statuses) : null;
  const weatherGuide = GEN3_WEATHER.find(
    (weather) => weather.id === (session.weather?.kind ?? "none"),
  )!;

  function playCry(id: number) {
    audioRef.current?.pause();
    const audio = new Audio(
      `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`,
    );
    audio.volume = 0.6;
    audioRef.current = audio;
    void audio.play().catch(() => {});
  }

  return (
    <section
      className="battle-scene rounded-3xl border"
      aria-label={`Escenario: ${session.teams.a.name} contra ${session.teams.b.name}`}
      data-weather={session.weather?.kind ?? "none"}
    >
      <div className="battle-scene__audio">
        <TrainerBattleMusicControl session={session} />
      </div>
      <div aria-hidden="true" className="battle-scene__sky" />
      <div aria-hidden="true" className="battle-scene__ground" />
      <div aria-hidden="true" className="battle-scene__weather" />
      <div className="battle-scene__field-label">
        <span>
          {weatherGuide.icon}{" "}
          {session.weather
            ? `${WEATHER_LABELS[session.weather.kind]}${session.weather.permanent ? "" : ` · ${session.weather.turnsLeft} turnos`}`
            : "Sin clima"}
        </span>
      </div>
      <span className="absolute right-3 top-3 z-30 rounded-lg border bg-background/90 px-2 py-1 text-xs font-semibold">
        Turno {session.runtime?.turn ?? 1}
      </span>
      {(["a", "b"] as const).map((side) => {
        const capture = side === "a" ? a : b;
        if (!capture) return null;
        const near = (side === "a") !== flipped;
        const speed = side === "a" ? speedA : speedB;
        const otherSpeed = side === "a" ? speedB : speedA;
        const fainted = getCurrentHp(capture.pokemon) <= 0;
        return (
          <div key={side}>
            <ActiveHp
              capture={capture}
              trainer={session.teams[side].name}
              side={side}
              near={near}
              fastest={
                speed !== null && otherSpeed !== null && speed >= otherSpeed
              }
            />
            <div
              className={`battle-scene__combatant battle-scene__combatant--${near ? "near" : "far"}`}
            >
              <div
                aria-hidden="true"
                className="battle-scene__platform border border-brand/30 bg-muted shadow-sm"
              />
              <div
                aria-hidden="true"
                className="battle-scene__shadow bg-foreground/15"
              />
              <PokemonBattleSprite
                key={`${side}:${capture.captureId}:${near}`}
                pokemon={capture.pokemon}
                back={near}
                fainted={fainted}
                onPlayCry={playCry}
              />
            </div>
          </div>
        );
      })}
      <span className="battle-scene__perspective rounded-full border bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground">
        Vista {flipped ? "B" : "A"}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="absolute bottom-3 right-3 z-30 h-11 w-11 rounded-full bg-background shadow-sm"
        onClick={onTogglePerspective}
        aria-label={`Cambiar a vista ${flipped ? "A" : "B"}`}
        aria-pressed={flipped}
      >
        <SwitchCamera className="h-5 w-5 text-brand" />
      </Button>
    </section>
  );
}
