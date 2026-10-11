import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpLeft,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAppSelector } from "@/store/hooks";
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
const CORNERS = [
  { value: "top-left", label: "Arriba izquierda", icon: ArrowUpLeft },
  { value: "top-right", label: "Arriba derecha", icon: ArrowUpRight },
  { value: "bottom-left", label: "Abajo izquierda", icon: ArrowDownLeft },
  { value: "bottom-right", label: "Abajo derecha", icon: ArrowDownRight },
] as const;

function readCorner(): Corner {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return CORNERS.find((c) => c.value === saved)?.value ?? "bottom-right";
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
      className="pointer-events-none h-[72px] w-[72px] shrink-0 select-none object-contain [image-rendering:pixelated]"
    />
  ) : (
    <span className="px-1 text-center text-[10px] capitalize">
      {pokemon.name}
    </span>
  );
}

function DraggableOpponent({ pokemon }: { pokemon: Pokemon }) {
  const [corner, setCorner] = useState<Corner>(readCorner);
  const [position, setPosition] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
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
    setCorner(nextCorner);
    moveTo(cornerPoint(nextCorner, limitsRef.current));
    try {
      localStorage.setItem(STORAGE_KEY, nextCorner);
    } catch {
      /* La posición sigue funcionando sin almacenamiento. */
    }
  };

  useLayoutEffect(() => {
    const area = areaRef.current;
    const button = buttonRef.current;
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
    setMenuOpen(false);
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
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            ref={buttonRef}
            type="button"
            aria-label={`Rival: ${pokemon.name}, nivel ${pokemon.level ?? 50}, tipos ${pokemon.types.join(", ")}. Toca para elegir esquina o arrastra para mover.`}
            title="Arrastra al rival o toca para elegir esquina"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={cancelDrag}
            onClick={(event) => {
              if (event.detail !== 0 && suppressClickRef.current) {
                event.preventDefault();
                suppressClickRef.current = false;
              }
            }}
            className={`pointer-events-auto absolute left-0 top-0 flex h-[124px] w-[96px] touch-none select-none flex-col items-center justify-center gap-1 rounded-2xl py-1 border-2 border-brand/60 bg-card/95 text-card-foreground shadow-lg backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${dragging ? "cursor-grabbing" : "cursor-grab transition-transform duration-200 motion-reduce:transition-none"}`}
            style={{
              transform: `translate3d(${position?.x ?? 0}px, ${position?.y ?? 0}px, 0)`,
              visibility: position ? "visible" : "hidden",
            }}
          >
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
        </PopoverTrigger>
        <PopoverContent
          side={corner.startsWith("bottom") ? "top" : "bottom"}
          align={corner.endsWith("right") ? "end" : "start"}
          sideOffset={8}
          collisionPadding={12}
          className="pointer-events-auto w-64 max-w-[calc(100vw-24px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-3"
        >
          <p className="text-sm font-semibold capitalize">
            {pokemon.name} · Rival
          </p>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            Arrástralo a otra esquina o elige su posición.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {CORNERS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                type="button"
                variant={corner === value ? "secondary" : "outline"}
                aria-pressed={corner === value}
                className="h-auto min-h-11 gap-1 whitespace-normal px-2 py-2 text-xs"
                onClick={() => {
                  dock(value);
                  setMenuOpen(false);
                }}
              >
                <Icon className="h-4 w-4 shrink-0" /> {label}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function FloatingOpponent() {
  const opponent = useAppSelector((state) => state.party.opponent ?? null);
  if (!opponent) return null;
  return <DraggableOpponent pokemon={opponent.pokemon} />;
}
