import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBattleMusic } from "@/context/BattleMusicContext";
import { useAppSelector } from "@/store/hooks";
import { getCurrentHp, getMaxHp, STAT_LABELS } from "@/lib/pokemonStats";
import { getCurrentMovePp, getMaxMovePp } from "@/lib/movePp";
import PokemonTypeBadges from "./PokemonTypeBadges";
import { SHOP_ITEMS } from "@/lib/adminShop";
import {
  captureThrowHits,
  captureSlingshotLanding,
  THROW_ORIGIN,
  THROW_TARGET,
  type ThrowPoint,
} from "@/lib/captureThrow";
import type { BallItemId, CaptureAttemptResult } from "@/lib/shop/types";
import type { BattleOpponent } from "@/lib/battleOpponent";
import "./PokemonCaptureThrow.css";

type Phase =
  | "aiming"
  | "flight"
  | "shake"
  | "breakout"
  | "result"
  | "details"
  | "error";
export default function PokemonCaptureThrow({
  ballId,
  opponent,
  onLaunch,
  onCancel,
  onDone,
}: {
  ballId: BallItemId;
  opponent: BattleOpponent;
  onLaunch: (hit: boolean) => Promise<CaptureAttemptResult>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const music = useBattleMusic();
  const [phase, setPhase] = useState<Phase>("aiming");
  const [aim, setAim] = useState<ThrowPoint>(THROW_ORIGIN);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<CaptureAttemptResult | null>(null);
  const [error, setError] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const captured = useAppSelector((state) =>
    result?.outcome === "caught"
      ? state.party.pokemons.find(
          (entry) => entry.captureId === result.captureId,
        )
      : undefined,
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const grip = useRef<ThrowPoint>(THROW_ORIGIN);
  const working = useRef(false);
  const mounted = useRef(true);
  const timers = useRef(new Map<ReturnType<typeof setTimeout>, () => void>());
  const ball = SHOP_ITEMS.find((entry) => entry.id === ballId)!;
  const hold = useRef(music.holdEncounter);
  useEffect(() => {
    mounted.current = true;
    const release = hold.current();
    return () => {
      mounted.current = false;
      timers.current.forEach((resolve, timer) => {
        clearTimeout(timer);
        resolve();
      });
      timers.current.clear();
      release();
    };
  }, []);
  const delay = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        resolve();
      }, ms);
      timers.current.set(timer, resolve);
    });
  const pointFor = (event: PointerEvent): ThrowPoint => {
    const bounds = scene.current!.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  };
  const pulledPointFor = (event: PointerEvent): ThrowPoint => {
    const point = pointFor(event);
    return {
      x: THROW_ORIGIN.x + point.x - grip.current.x,
      y: THROW_ORIGIN.y + point.y - grip.current.y,
    };
  };
  async function launch(point: ThrowPoint) {
    if (working.current || phase !== "aiming" || !scene.current) return;
    working.current = true;
    pointer.current = null;
    setDragging(false);
    setAim(point);
    setPhase("flight");
    const bounds = scene.current.getBoundingClientRect();
    const hit = captureThrowHits(
      captureSlingshotLanding(point),
      bounds.width,
      bounds.height,
    );
    try {
      // Only the checked result is revealed. Animation time never waits on Nest.
      const [saved] = await Promise.all([onLaunch(hit), delay(650)]);
      if (!mounted.current) return;
      setResult(saved);
      if (hit) {
        setPhase("shake");
        await delay(1000);
        if (!mounted.current) return;
      }
      if (saved.outcome === "escaped") {
        setPhase("breakout");
        await delay(650);
        if (!mounted.current) return;
      }
      setPhase("result");
    } catch (reason) {
      if (!mounted.current) return;
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo guardar el lanzamiento.",
      );
      setPhase("error");
    } finally {
      working.current = false;
    }
  }
  const caught = result?.outcome === "caught";
  const celebrating = caught && (phase === "result" || phase === "details");
  const celebrate = useRef(music.holdCapture);
  useEffect(() => {
    if (celebrating) return celebrate.current();
  }, [celebrating]);
  useEffect(() => {
    if (phase === "details") {
      titleRef.current?.focus({ preventScroll: true });
      titleRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [phase]);
  const rawName =
    captured?.pokemon.name ?? result?.pokemonName ?? opponent.pokemon.name;
  const pokemonName = rawName.charAt(0).toLocaleUpperCase() + rawName.slice(1);
  const aiming = phase === "aiming";
  const busy = ["flight", "shake", "breakout"].includes(phase);
  const landing = captureSlingshotLanding(aim);
  const style = {
    "--pull-x": `${aim.x * 100}%`,
    "--pull-y": `${aim.y * 100}%`,
    "--throw-x": `${landing.x * 100}%`,
    "--throw-y": `${landing.y * 100}%`,
    "--throw-mid-x": `${(aim.x + landing.x) * 50}%`,
    "--throw-mid-y": `${(landing.y < aim.y ? Math.min(aim.y, landing.y) - 0.12 : (aim.y + landing.y) / 2) * 100}%`,
  } as CSSProperties;
  const title =
    phase === "details"
      ? "Pokémon capturado"
      : phase === "result"
        ? caught
          ? "¡Captura conseguida!"
          : "El Pokémon sigue libre"
        : `Lanza tu ${ball.name}`;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy && phase !== "result" && phase !== "details")
          onCancel();
      }}
    >
      <DialogContent
        role={celebrating ? "alertdialog" : "dialog"}
        className="capture-throw-dialog max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-y-auto p-4 sm:max-w-[480px] [&>button:last-child]:hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
            {title}
          </DialogTitle>
          <DialogDescription className="min-h-10">
            {aiming ? (
              "Tira de la bola hacia atrás y suéltala. Ajusta la fuerza para acertar al Pokémon."
            ) : phase === "details" ? (
              "Conoce a tu nuevo compañero. Ya está guardado en tu Party."
            ) : phase === "result" ? (
              caught ? (
                <>
                  <strong
                    className="font-bold"
                    data-testid="capture-success-name"
                  >
                    {pokemonName}
                  </strong>{" "}
                  se unió a tu Party.
                </>
              ) : result?.throwHit === false ? (
                "No alcanzaste al Pokémon. La bola se perdió y el salvaje respondió."
              ) : (
                "La bola se rompió y el Pokémon salvaje respondió."
              )
            ) : phase === "error" ? (
              "No se pudo completar el guardado. Revisa el error antes de intentar de nuevo."
            ) : (
              "Resolviendo el lanzamiento…"
            )}
          </DialogDescription>
        </DialogHeader>
        {phase === "details" ? (
          captured ? (
            <section
              data-testid="capture-pokemon-details"
              data-capture-id={captured.captureId}
              className="space-y-4"
            >
              <div className="flex items-center gap-4 rounded-xl border bg-muted/30 p-3">
                <img
                  className="h-24 w-24 shrink-0 object-contain [image-rendering:pixelated]"
                  src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${captured.pokemon.id}.png`}
                  alt={pokemonName}
                />
                <div className="min-w-0 space-y-2">
                  <h3
                    className="break-words text-lg font-bold"
                    data-testid="capture-pokemon-name"
                  >
                    {pokemonName}
                  </h3>
                  <p
                    className="text-sm font-semibold"
                    data-testid="capture-pokemon-level"
                  >
                    Nivel {captured.pokemon.level}
                  </p>
                  <PokemonTypeBadges types={captured.pokemon.types} />
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Estadísticas</h3>
                <dl className="grid grid-cols-2 gap-2">
                  {captured.pokemon.stats.map((stat) => (
                    <div
                      key={stat.name}
                      data-stat={stat.name}
                      className="flex justify-between gap-2 rounded-lg bg-muted p-2 text-sm"
                    >
                      <dt className="text-muted-foreground">
                        {STAT_LABELS[stat.name] ?? stat.name}
                      </dt>
                      <dd className="font-semibold tabular-nums">
                        {stat.name === "hp"
                          ? `${getCurrentHp(captured.pokemon)} / ${getMaxHp(captured.pokemon) ?? stat.value}`
                          : stat.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Movimientos</h3>
                <ul className="space-y-2">
                  {(captured.moves ?? []).map((move) => (
                    <li
                      key={move.id}
                      data-move-id={move.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm"
                    >
                      <div className="space-y-1">
                        <p className="font-semibold">
                          {move.displayName || move.name}
                        </p>
                        <PokemonTypeBadges types={[move.type]} />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        PP {getCurrentMovePp(move)} / {getMaxMovePp(move)}
                      </span>
                    </li>
                  ))}
                </ul>
                {!captured.moves?.length && (
                  <p className="text-sm text-muted-foreground">
                    Sin movimientos aprendidos.
                  </p>
                )}
              </div>
            </section>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              La captura está guardada. Consulta sus datos en tu Party.
            </p>
          )
        ) : (
          <div
            ref={scene}
            className="capture-throw-scene"
            data-testid="capture-throw-scene"
            data-phase={phase}
            data-hit={result?.throwHit}
            data-caught={result?.outcome === "caught"}
            style={style}
          >
            <div className="capture-throw-cloud" aria-hidden="true" />
            <div className="capture-throw-ground" aria-hidden="true" />
            <span className="capture-throw-anchor" aria-hidden="true" />
            <div
              className="capture-throw-target"
              data-testid="capture-throw-target"
              style={{
                left: `${THROW_TARGET.x * 100}%`,
                top: `${THROW_TARGET.y * 100}%`,
              }}
              aria-label={`Objetivo: ${opponent.pokemon.name}`}
            >
              {imageFailed ? (
                <span className="capitalize font-bold text-white">
                  {opponent.pokemon.name}
                </span>
              ) : (
                <img
                  className="capture-throw-pokemon"
                  alt={opponent.pokemon.name}
                  draggable={false}
                  src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${opponent.pokemon.id}.png`}
                  onError={() => setImageFailed(true)}
                />
              )}
            </div>
            {aiming && dragging && (
              <>
                <svg
                  className="capture-throw-guide"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path d={`M44 70 L${aim.x * 100} ${aim.y * 100} L56 70`} />
                </svg>
              </>
            )}
            <button
              type="button"
              className="capture-throw-ball"
              data-testid="capture-throw-ball"
              disabled={!aiming}
              aria-label="Tirar de la pokebola hacia atrás y soltar; flechas y Enter con teclado"
              onPointerDown={(event) => {
                if (
                  !aiming ||
                  pointer.current !== null ||
                  working.current ||
                  (event.pointerType === "mouse" && event.button !== 0)
                )
                  return;
                event.preventDefault();
                pointer.current = event.pointerId;
                grip.current = pointFor(event);
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging(true);
                setAim(THROW_ORIGIN);
              }}
              onPointerMove={(event) => {
                if (pointer.current === event.pointerId) {
                  event.preventDefault();
                  setAim(pulledPointFor(event));
                }
              }}
              onPointerUp={(event) => {
                if (pointer.current !== event.pointerId) return;
                event.preventDefault();
                const point = pulledPointFor(event);
                pointer.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
                void launch(point);
              }}
              onPointerCancel={(event) => {
                if (pointer.current !== event.pointerId) return;
                pointer.current = null;
                setDragging(false);
                setAim(THROW_ORIGIN);
              }}
              onLostPointerCapture={(event) => {
                if (pointer.current !== event.pointerId) return;
                pointer.current = null;
                setDragging(false);
                setAim(THROW_ORIGIN);
              }}
              onKeyDown={(event) => {
                if (!aiming || working.current) return;
                const offsets: Record<string, ThrowPoint> = {
                  ArrowUp: { x: 0, y: -0.02 },
                  ArrowDown: { x: 0, y: 0.02 },
                  ArrowLeft: { x: -0.02, y: 0 },
                  ArrowRight: { x: 0.02, y: 0 },
                };
                if (offsets[event.key]) {
                  event.preventDefault();
                  setDragging(true);
                  const offset = offsets[event.key];
                  setAim((point) => ({
                    x: Math.max(0, Math.min(1, point.x + offset.x)),
                    y: Math.max(0, Math.min(1, point.y + offset.y)),
                  }));
                }
                if (
                  !event.repeat &&
                  (event.key === "Enter" || event.key === " ")
                ) {
                  event.preventDefault();
                  void launch(aim);
                }
              }}
            >
              <img src={ball.image} alt="" draggable={false} />
              <span className="capture-throw-ball-half" aria-hidden="true">
                <img src={ball.image} alt="" />
              </span>
            </button>
            {phase === "result" && caught && (
              <div className="capture-throw-stars" aria-hidden="true">
                ✦ ✨ ✦
              </div>
            )}
            <p className="capture-throw-status" role="status">
              {aiming
                ? ""
                : phase === "flight"
                  ? "¡Allá va!"
                  : phase === "shake"
                    ? "¿Se quedará dentro?"
                    : phase === "breakout"
                      ? "¡El salvaje contraataca!"
                      : caught
                        ? "¡Atrapado!"
                        : phase === "error"
                          ? "Lanzamiento sin confirmar"
                          : "Inténtalo con otra bola"}
            </p>
          </div>
        )}
        {phase === "result" && (
          <div
            data-testid="capture-throw-result"
            data-outcome={result?.outcome}
            className="rounded-xl border p-3 text-sm"
          >
            <p data-testid="capture-auto-result">
              {result?.roll !== undefined
                ? `D20: ${result.roll} · mínimo: ${result.minimum}. ${caught ? "Captura conseguida." : "Escapó de la bola."}`
                : "Lanzamiento fallido: no se tiró el D20."}
            </p>
            <p className="mt-1 text-muted-foreground">
              Se gastó 1 {ball.name}.
            </p>
          </div>
        )}
        {error && phase === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter className="min-h-10">
          {aiming && (
            <Button variant="outline" onClick={onCancel}>
              Cambiar pokebola
            </Button>
          )}
          {phase === "error" && (
            <Button variant="outline" onClick={onCancel}>
              Volver
            </Button>
          )}
          {(phase === "result" || phase === "details") && (
            <Button
              autoFocus
              data-testid="capture-throw-continue"
              onClick={() => {
                if (phase === "result" && caught) setPhase("details");
                else onDone();
              }}
            >
              Continuar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
