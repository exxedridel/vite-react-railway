import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { History, X } from "lucide-react";
import PokemonActivityDialog from "./PokemonActivityDialog";

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
type Point = { x: number; y: number };
type Drag = { id: number; x: number; y: number; origin: Point; moved: boolean };
type FloatingLayer = HTMLDivElement;

export default function FloatingActivityHistory({
  onClose,
}: {
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement>(() => document.body);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);
  const layerRef = useRef<FloatingLayer>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const positionRef = useRef(position);
  const limits = useRef<Point>({ x: 0, y: 0 });
  const corner = useRef<Corner>("bottom-right");
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  // Radix limita foco y accesibilidad al modal activo. El portal pertenece a él.
  // La capa popover manual evita también el recorte y transform del modal.
  useLayoutEffect(() => {
    if (open) return;
    const update = () => {
      const dialogs = [
        ...document.querySelectorAll<HTMLElement>(
          '[role="dialog"], [role="alertdialog"]',
        ),
      ].filter(
        (el) =>
          el.dataset.state !== "closed" &&
          !el.hasAttribute("data-activity-history") &&
          el.getClientRects().length > 0,
      );
      let next: HTMLElement = document.body;
      let highest = -Infinity;
      for (const el of dialogs) {
        const z = Number.parseInt(getComputedStyle(el).zIndex, 10) || 0;
        if (z >= highest) {
          highest = z;
          next = el;
        }
      }
      setHost((current) => (current === next ? current : next));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "role", "hidden"],
    });
    return () => observer.disconnect();
  }, [open]);

  const move = (next: Point) => {
    positionRef.current = next;
    setPosition(next);
  };
  const clamp = (p: Point) => ({
    x: Math.max(0, Math.min(limits.current.x, p.x)),
    y: Math.max(0, Math.min(limits.current.y, p.y)),
  });
  const dock = () =>
    move({
      x: corner.current.endsWith("right") ? limits.current.x : 0,
      y: corner.current.startsWith("bottom") ? limits.current.y : 0,
    });

  useLayoutEffect(() => {
    if (open) return;
    const layer = layerRef.current;
    const box = boxRef.current;
    if (!layer || !box) return;
    let topLayer = false;
    if (typeof layer.showPopover === "function") {
      layer.setAttribute("popover", "manual");
      layer.showPopover();
      topLayer = true;
    }
    const measure = () => {
      // Respaldo para navegadores sin Popover API: compensar el modal transformado.
      if (!topLayer) {
        const rect =
          host === document.body ? null : host.getBoundingClientRect();
        layer.style.left = `${12 - (rect?.left ?? 0) - (rect ? host.clientLeft : 0)}px`;
        layer.style.top = `${12 - (rect?.top ?? 0) - (rect ? host.clientTop : 0)}px`;
        layer.style.width = `${Math.max(0, window.innerWidth - 24)}px`;
        layer.style.height = `${Math.max(0, window.innerHeight - 24)}px`;
      }
      limits.current = {
        x: Math.max(0, layer.clientWidth - box.offsetWidth),
        y: Math.max(0, layer.clientHeight - box.offsetHeight),
      };
      drag.current = null;
      setDragging(false);
      dock();
      setReady(true);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(layer);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      if (topLayer && layer.matches(":popover-open")) layer.hidePopover?.();
    };
  }, [host, open]);

  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick.current = false;
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      origin: positionRef.current,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x,
      dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    d.moved = true;
    suppressClick.current = true;
    setDragging(true);
    event.preventDefault();
    move(clamp({ x: d.origin.x + dx, y: d.origin.y + dy }));
  };
  const pointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (d.moved) {
      const p = clamp({
        x: d.origin.x + event.clientX - d.x,
        y: d.origin.y + event.clientY - d.y,
      });
      corner.current = `${p.y >= limits.current.y / 2 ? "bottom" : "top"}-${p.x >= limits.current.x / 2 ? "right" : "left"}`;
      dock();
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const cancelDrag = () => {
    if (!drag.current) return;
    suppressClick.current = true;
    drag.current = null;
    setDragging(false);
    dock();
  };

  return (
    <>
      {!open &&
        createPortal(
          <div
            ref={layerRef}
            data-floating-activity="true"
            style={{
              position: "fixed",
              inset:
                "max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))",
              width: "auto",
              height: "auto",
              maxWidth: "none",
              maxHeight: "none",
              margin: 0,
              padding: 0,
              border: 0,
              overflow: "visible",
              background: "transparent",
              pointerEvents: "none",
              zIndex: 2147483000,
            }}
          >
            <div
              ref={boxRef}
              className={`absolute left-0 top-0 h-16 w-16 ${dragging ? "" : "transition-transform duration-200 motion-reduce:transition-none"}`}
              style={{
                transform: `translate3d(${position.x}px,${position.y}px,0)`,
                visibility: ready ? "visible" : "hidden",
              }}
            >
              <button
                ref={triggerRef}
                type="button"
                aria-label="Abrir historial de actividad. Arrastra para cambiar de esquina."
                aria-haspopup="dialog"
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={cancelDrag}
                onLostPointerCapture={cancelDrag}
                onClick={(event) => {
                  if (event.detail !== 0 && suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  setOpen(true);
                }}
                className={`pointer-events-auto flex h-full w-full touch-none select-none items-center justify-center rounded-2xl border-2 border-brand bg-card text-brand shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
              >
                <History className="h-8 w-8" />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Ocultar botón del historial"
                title="Ocultar historial"
                className="pointer-events-auto absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border border-brand bg-card text-card-foreground shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>,
          host,
        )}
      <PokemonActivityDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen)
            requestAnimationFrame(() => triggerRef.current?.focus());
        }}
        returnFocusRef={triggerRef}
      />
    </>
  );
}
