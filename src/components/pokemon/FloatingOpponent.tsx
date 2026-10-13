import { isPokemonFainted } from "@/lib/pokemonCondition";
import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { store } from "@/store/store";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setBattleOpponent } from "@/slices/partySlice";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Pokemon } from "@/types/pokemon";

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
type Point = { x: number; y: number };
type Limits = { x: number; y: number };
type Drag = { pointerId: number; start: Point; origin: Point; moved: boolean };

const TYPE_IDS: Record<string, number> = {
  normal: 1,
  fighting: 2,
  flying: 3,
  poison: 4,
  ground: 5,
  rock: 6,
  bug: 7,
  ghost: 8,
  steel: 9,
  fire: 10,
  water: 11,
  grass: 12,
  electric: 13,
  psychic: 14,
  ice: 15,
  dragon: 16,
  dark: 17,
  fairy: 18,
};
const TYPE_ICON_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-ix/scarlet-violet/small";

const STORAGE_KEY = "pokemon-opponent-corner";
const CORNERS: Corner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

function readCorner(): Corner {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return CORNERS.find((c) => c === saved) ?? "bottom-right";
  } catch {
    return "bottom-right";
  }
}
function cornerPoint(corner: Corner, limits: Limits): Point {
  return {
    x: corner.endsWith("right") ? limits.x : 0,
    y: corner.startsWith("bottom") ? limits.y : 0,
  };
}
function clampPoint(point: Point, limits: Limits): Point {
  return {
    x: Math.max(0, Math.min(limits.x, point.x)),
    y: Math.max(0, Math.min(limits.y, point.y)),
  };
}

function OpponentSprite({ pokemon }: { pokemon: Pokemon }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = [
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`,
    ...(pokemon.image ? [pokemon.image] : []),
  ];
  return sources[sourceIndex] ? (
    <img
      src={sources[sourceIndex]}
      alt={pokemon.name}
      draggable={false}
      onError={() => setSourceIndex((i) => i + 1)}
      className={`pointer-events-none h-[72px] w-[72px] shrink-0 select-none object-contain [image-rendering:pixelated] ${isPokemonFainted(pokemon) ? "grayscale opacity-60" : ""}`}
    />
  ) : (
    <span className="px-1 text-center text-[10px] capitalize">
      {pokemon.name}
    </span>
  );
}

type Props = { onOpenBattle: (captureId: string) => void };
function DraggableOpponent({
  pokemon,
  onOpenBattle,
}: { pokemon: Pokemon } & Props) {
  const fainted = isPokemonFainted(pokemon);
  const dispatch = useAppDispatch();
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const cancelRemoveRef = useRef<HTMLButtonElement>(null);
  const [corner] = useState<Corner>(readCorner);
  const [position, setPosition] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const cornerRef = useRef(corner);
  const positionRef = useRef<Point>({ x: 0, y: 0 });
  const limitsRef = useRef<Limits>({ x: 0, y: 0 });
  const dragRef = useRef<Drag | null>(null);
  const suppressClickRef = useRef(false);

  const moveTo = (point: Point) => {
    positionRef.current = point;
    setPosition(point);
  };
  const dock = (nextCorner: Corner) => {
    cornerRef.current = nextCorner;
    moveTo(cornerPoint(nextCorner, limitsRef.current));
    try {
      localStorage.setItem(STORAGE_KEY, nextCorner);
    } catch {
      /* La posición sigue funcionando sin almacenamiento. */
    }
  };

  useLayoutEffect(() => {
    const area = areaRef.current;
    const button = frameRef.current;
    if (!area || !button) return;
    const measure = () => {
      limitsRef.current = {
        x: Math.max(0, area.clientWidth - button.offsetWidth),
        y: Math.max(0, area.clientHeight - button.offsetHeight),
      };
      // Al rotar o redimensionar, vuelve a una posición visible.
      dragRef.current = null;
      setDragging(false);
      const next = cornerPoint(cornerRef.current, limitsRef.current);
      positionRef.current = next;
      setPosition(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    observer.observe(button);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClickRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: positionRef.current,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.start.x;
    const dy = event.clientY - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    suppressClickRef.current = true;
    setDragging(true);
    event.preventDefault();
    moveTo(
      clampPoint(
        { x: drag.origin.x + dx, y: drag.origin.y + dy },
        limitsRef.current,
      ),
    );
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (drag.moved) {
      const limits = limitsRef.current;
      const final = clampPoint(
        {
          x: drag.origin.x + event.clientX - drag.start.x,
          y: drag.origin.y + event.clientY - drag.start.y,
        },
        limits,
      );
      const vertical = final.y >= limits.y / 2 ? "bottom" : "top";
      const horizontal = final.x >= limits.x / 2 ? "right" : "left";
      dock(`${vertical}-${horizontal}` as Corner);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const cancelDrag = () => {
    if (!dragRef.current) return;
    suppressClickRef.current = dragRef.current.moved;
    dragRef.current = null;
    setDragging(false);
    moveTo(cornerPoint(cornerRef.current, limitsRef.current));
  };

  return (
    <div
      ref={areaRef}
      className="pointer-events-none fixed z-40"
      style={{
        top: "max(12px, env(safe-area-inset-top))",
        right: "max(12px, env(safe-area-inset-right))",
        bottom: "max(12px, env(safe-area-inset-bottom))",
        left: "max(12px, env(safe-area-inset-left))",
      }}
    >
      <div
        ref={frameRef}
        className={`pointer-events-auto absolute left-0 top-0 h-[124px] w-[96px] ${dragging ? "" : "transition-transform duration-200 motion-reduce:transition-none"}`}
        style={{
          transform: `translate3d(${position?.x ?? 0}px, ${position?.y ?? 0}px, 0)`,
          visibility: position ? "visible" : "hidden",
        }}
      >
        <button
          ref={buttonRef}
          type="button"
          aria-label={`Volver al combate contra ${pokemon.name}${fainted ? ", debilitado" : ""}. Arrastra para mover.`}
          title="Toca para volver al combate; arrastra para mover"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={cancelDrag}
          onLostPointerCapture={cancelDrag}
          onClick={(event) => {
            if (event.detail !== 0 && suppressClickRef.current) {
              event.preventDefault();
              suppressClickRef.current = false;
              return;
            }
            const party = store.getState().party;
            const active = party.pokemons.find(
              (capture) =>
                capture.captureId === party.battleField?.activeCaptureId,
            );
            if (!party.opponent) return;
            if (!active) {
              toast.info(
                "Selecciona un Pokémon de tu equipo para iniciar el combate.",
              );
              return;
            }
            onOpenBattle(active.captureId);
          }}
          className={`relative flex h-full w-full touch-none select-none flex-col items-center justify-center gap-1 rounded-2xl border-2 border-brand/60 bg-card/95 py-1 text-card-foreground shadow-lg backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        >
          {fainted && (
            <span
              role="status"
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground"
            >
              Fainted
            </span>
          )}
          <OpponentSprite key={pokemon.id} pokemon={pokemon} />
          <span className="text-[10px] font-semibold">
            Rival · Lv. {pokemon.level ?? 50}
          </span>
          <span className="pointer-events-none flex shrink-0 items-center justify-center gap-1.5">
            {pokemon.types.map((type) =>
              TYPE_IDS[type] ? (
                <span
                  key={type}
                  className="inline-flex h-5 w-5 shrink-0 overflow-hidden rounded-full"
                  title={type}
                >
                  <img
                    src={`${TYPE_ICON_BASE}/${TYPE_IDS[type]}.png`}
                    alt={type}
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                </span>
              ) : null,
            )}
          </span>
        </button>
        <button
          type="button"
          aria-label={`Quitar a ${pokemon.name} como oponente`}
          aria-haspopup="dialog"
          title="Quitar oponente"
          className="absolute -left-2 -top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-brand bg-card text-card-foreground shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setRemoveDialogOpen(true)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent
          className="pointer-events-auto sm:max-w-[425px]"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRemoveRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            buttonRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>¿Quitar oponente?</DialogTitle>
            <DialogDescription>
              Se quitará a{" "}
              <span className="font-semibold capitalize">{pokemon.name}</span> y
              se descartarán su nivel y sus modificadores guardados. Tu equipo
              no cambiará.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              ref={cancelRemoveRef}
              type="button"
              variant="outline"
              onClick={() => setRemoveDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setRemoveDialogOpen(false);
                dispatch(setBattleOpponent(null));
              }}
            >
              Quitar oponente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function FloatingOpponent({ onOpenBattle }: Props) {
  const opponent = useAppSelector((state) => state.party.opponent ?? null);
  if (!opponent) return null;
  return (
    <DraggableOpponent
      key={`${opponent.kind}:${opponent.encounterId ?? ""}:${opponent.pokemon.id}`}
      pokemon={opponent.pokemon}
      onOpenBattle={onOpenBattle}
    />
  );
}
