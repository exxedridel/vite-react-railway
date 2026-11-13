import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Check, HeartPulse, LogOut, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/ui/mode-toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CenterCancelButton from "@/components/shop/CenterCancelButton";
import { useShopContext } from "@/context/ShopContext";
import type { CenterHeal, CenterPreview, ShopPlayer } from "@/lib/shop/types";
import {
  PLAYER_COLORS,
  isPlayerColorId,
  readShopColors,
  shopPlayerColor,
  writeShopColors,
  type PlayerColorId,
  type PlayerColorPreferences,
} from "@/lib/adminShop";
import "./AdminShopPage.css";
import "./AdminCenterPage.css";

const name = (player: ShopPlayer) =>
  `${player.user.first_name} ${player.user.last_name}`.trim() ||
  player.user.email;
const errorMessage = (reason: unknown) =>
  reason instanceof Error
    ? reason.message
    : "No se pudo completar la recuperación. Actualiza la conexión.";
type Draft = {
  player: ShopPlayer;
  preview: CenterPreview;
  captureIds: string[];
  requestId: string;
  attempted: boolean;
};

export default function AdminCenterPage() {
  const shop = useShopContext();
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState<CenterPreview | null>(null);
  const [captureIds, setCaptureIds] = useState<string[]>([]);
  const [colors, setColors] = useState<PlayerColorPreferences>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lastReceipt, setLastReceipt] = useState<CenterHeal | null>(null);
  const previewRequest = useRef(0);
  const submitLock = useRef(false);
  const players = [
    ...new Map(
      shop.players.filter((p) => p.online).map((p) => [p.user.id, p]),
    ).values(),
  ];
  const player = players.find((p) => p.user.id === selected);
  const connected = shop.connected && shop.synced;
  const available = (p: ShopPlayer) =>
    connected &&
    p.ready &&
    !p.inBattle &&
    !p.pending &&
    !!p.supportsCenterHealing;
  const receipt = lastReceipt
    ? (shop.centerHeals.find(
        (r) =>
          r.userId === lastReceipt.userId &&
          r.requestId === lastReceipt.requestId,
      ) ?? lastReceipt)
    : null;
  const pending = shop.centerHeals.filter((r) => r.status === "pending");
  const canHeal =
    !!player &&
    available(player) &&
    !!preview &&
    preview.userId === player.user.id &&
    preview.clientId === player.clientId &&
    captureIds.length >= 1 &&
    captureIds.length <= 2 &&
    !loading &&
    !submitting &&
    !shop.busy;

  useEffect(() => {
    previewRequest.current++;
    setSelected(null);
    setPreview(null);
    setCaptureIds([]);
    setDraft(null);
    setLastReceipt(null);
    try {
      setColors(shop.user ? readShopColors(localStorage, shop.user.id) : {});
    } catch {
      setColors({});
    }
  }, [shop.user?.id]);
  useEffect(
    () => () => {
      previewRequest.current++;
    },
    [],
  );
  useEffect(() => {
    if (preview && (!player || player.clientId !== preview.clientId)) {
      previewRequest.current++;
      setPreview(null);
      setCaptureIds([]);
      setLoading(false);
    }
  }, [player?.clientId, preview]);

  async function loadTeam(target: ShopPlayer) {
    if (!available(target) || submitting || shop.busy) return;
    const attempt = ++previewRequest.current;
    setSelected(target.user.id);
    setLoading(true);
    setPreview(null);
    setCaptureIds([]);
    setError("");
    try {
      const next = await shop.previewCenter(target);
      if (attempt === previewRequest.current) setPreview(next);
    } catch (reason) {
      if (attempt === previewRequest.current) setError(errorMessage(reason));
    } finally {
      if (attempt === previewRequest.current) setLoading(false);
    }
  }
  async function synchronize() {
    setError("");
    try {
      await shop.sync();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }
  function changeColor(userId: number, colorId: PlayerColorId) {
    if (!isPlayerColorId(colorId)) return;
    const next = { ...colors, [String(userId)]: colorId };
    setColors(next);
    try {
      if (shop.user) writeShopColors(localStorage, shop.user.id, next);
    } catch {
      setError("El color cambió, pero no se pudo guardar en este navegador.");
    }
  }
  async function confirm() {
    if (!draft || submitLock.current || (!draft.attempted && !canHeal)) return;
    submitLock.current = true;
    setSubmitting(true);
    setError("");
    const attempt = { ...draft, attempted: true };
    setDraft(attempt);
    try {
      const next = await shop.healCenter(
        attempt.player,
        attempt.preview,
        attempt.captureIds,
        attempt.requestId,
      );
      if (next) setLastReceipt(next);
      setDraft(null);
      setPreview(null);
      setCaptureIds([]);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }
  return (
    <main className="admin-shop-page" data-testid="admin-center">
      <header className="admin-shop-header">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <HeartPulse className="text-brand" /> Poké Center
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recuperación completa y gratuita · 1 o 2 Pokémon por atención
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!shop.connected || loading || submitting}
            onClick={() => void synchronize()}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Actualizar conexión
          </Button>
          <ModeToggle />
          <Button
            asChild
            variant="outline"
            size="icon"
            aria-label="Cerrar sesión"
          >
            <Link to="/logout">
              <LogOut className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>
      {!connected && (
        <p role="status" className="mb-4 rounded-xl border p-3 text-sm">
          Conectando con los jugadores…
        </p>
      )}
      {(error || shop.error) && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error || shop.error}
        </p>
      )}
      <section
        className="admin-center-scene"
        aria-label="Centro Pokémon de Kanto"
      >
        <div className="admin-center-menu">
          <div className="admin-mart-menu__title">
            <h2>¡Bienvenido a Poké Center!</h2>
            <span>HP · PP · Estados</span>
          </div>
          <div className="p-4 sm:p-6">
            {receipt && (
              <p
                role="status"
                data-testid="center-result"
                className="mb-4 rounded-xl border p-3 text-sm"
              >
                {receipt.status === "applied"
                  ? "Recuperación guardada. Los Pokémon ya están listos para continuar."
                  : receipt.status === "cancelled"
                    ? "Operación cerrada. Se conserva cualquier recuperación que ya se hubiera guardado."
                    : "Esperando que el jugador guarde la recuperación…"}
              </p>
            )}
            {loading ? (
              <p role="status" className="py-8 text-center">
                Consultando el equipo actual…
              </p>
            ) : !preview ? (
              <div className="py-6 text-center">
                <p className="mb-3 text-sm text-muted-foreground">
                  Selecciona un jugador conectado para atender a sus Pokémon,
                  incluidos los debilitados.
                </p>
                {player && (
                  <Button
                    variant="outline"
                    disabled={!available(player) || shop.busy}
                    onClick={() => void loadTeam(player)}
                  >
                    {receipt?.status === "applied"
                      ? "Recuperar otros Pokémon"
                      : "Consultar equipo"}
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold">
                      Equipo de{" "}
                      {player ? name(player) : `Jugador #${preview.userId}`}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Elige hasta dos · seleccionados {captureIds.length}/2
                    </p>
                  </div>
                  {player && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!available(player) || shop.busy}
                      onClick={() => void loadTeam(player)}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" /> Actualizar equipo
                    </Button>
                  )}
                </div>
                <div
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                  data-testid="center-team"
                >
                  {preview.pokemons.map((pokemon) => {
                    const checked = captureIds.includes(pokemon.captureId);
                    return (
                      <label
                        key={pokemon.captureId}
                        className={`center-pokemon${checked ? " center-pokemon--selected" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold capitalize">
                            {pokemon.name}{" "}
                            <span className="text-xs font-normal">
                              Nv. {pokemon.level}
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-[hsl(var(--primary))]"
                            aria-label={`Recuperar ${pokemon.name}`}
                            data-testid={`center-pokemon-${pokemon.captureId}`}
                            checked={checked}
                            disabled={
                              !player ||
                              !available(player) ||
                              shop.busy ||
                              (!checked && captureIds.length >= 2) ||
                              !pokemon.needsHealing
                            }
                            onChange={() =>
                              setCaptureIds((ids) =>
                                checked
                                  ? ids.filter((id) => id !== pokemon.captureId)
                                  : ids.length < 2
                                    ? [...ids, pokemon.captureId]
                                    : ids,
                              )
                            }
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          {pokemon.image && (
                            <img
                              src={pokemon.image}
                              className="h-20 w-20 object-contain [image-rendering:pixelated]"
                              alt=""
                            />
                          )}
                          <div className="text-sm">
                            <p className="font-semibold tabular-nums">
                              HP {pokemon.currentHp}/{pokemon.maxHp}
                            </p>
                            <p
                              className={
                                pokemon.currentHp === 0
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                              }
                            >
                              {pokemon.currentHp === 0
                                ? "Debilitado · se revivirá"
                                : pokemon.needsHealing
                                  ? "Puede recuperarse"
                                  : "Salud completa"}
                            </p>
                          </div>
                        </div>
                        {!!pokemon.statuses.length && (
                          <p className="mb-2 break-words text-xs text-destructive">
                            {pokemon.statuses.join(" · ")}
                          </p>
                        )}
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {pokemon.moves.map((move) => (
                            <li
                              key={move.id}
                              className="flex justify-between gap-2"
                            >
                              <span className="capitalize">{move.name}</span>
                              <span className="tabular-nums">
                                {move.currentPp}/{move.maxPp} PP
                              </span>
                            </li>
                          ))}
                        </ul>
                      </label>
                    );
                  })}
                </div>
                {!preview.pokemons.length && (
                  <p className="py-6 text-center text-sm">
                    Este jugador aún no tiene Pokémon en su equipo.
                  </p>
                )}
                <Button
                  className="mt-5 min-h-11 w-full"
                  data-testid="center-review"
                  disabled={!canHeal}
                  onClick={() => {
                    if (player && preview && canHeal) {
                      setError("");
                      setDraft({
                        player,
                        preview,
                        captureIds: [...captureIds],
                        requestId: crypto.randomUUID(),
                        attempted: false,
                      });
                    }
                  }}
                >
                  <HeartPulse className="mr-2 h-4 w-4" /> Recuperar{" "}
                  {captureIds.length || "1 o 2"} Pokémon · Gratis
                </Button>
              </>
            )}
          </div>
        </div>
        <section
          className="admin-mart-players"
          aria-labelledby="center-players-heading"
        >
          <h2
            id="center-players-heading"
            className="mb-3 flex items-center gap-2 text-lg font-bold"
          >
            <Users className="h-5 w-5" /> Jugadores conectados ·{" "}
            {players.length}
          </h2>
          {!players.length ? (
            <p
              role="status"
              className="rounded-xl border bg-background/90 p-4 text-sm"
            >
              Los jugadores aparecerán aquí al conectarse a la partida.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {players.map((entry) => {
                const color = PLAYER_COLORS.find(
                  (c) => c.id === shopPlayerColor(colors, entry.user.id),
                )!;
                return (
                  <article
                    key={entry.user.id}
                    data-testid={`center-player-${entry.user.id}`}
                    className={`admin-player-card${entry.user.id === selected ? " admin-player-card--selected" : ""}`}
                    style={
                      {
                        "--player-color": color.hsl || "var(--primary)",
                      } as CSSProperties
                    }
                  >
                    <div className="admin-player-card__heading">
                      <span className="admin-player-dot" aria-hidden="true" />
                      <div className="min-w-0">
                        <h3 className="break-words font-bold">{name(entry)}</h3>
                        <p className="break-all text-xs text-muted-foreground">
                          {entry.user.email}
                        </p>
                      </div>
                    </div>
                    <p role="status" className="mb-3 text-sm">
                      {entry.inBattle
                        ? "En batalla · atención bloqueada"
                        : entry.pendingCenter
                          ? "Guardando recuperación de Poké Center"
                          : entry.pending
                            ? "Esperando guardado de otra operación"
                            : !entry.supportsCenterHealing
                              ? "Actualiza y recarga el frontend del jugador"
                              : !entry.ready
                                ? "Sincronizando su partida"
                                : "Disponible para recuperación"}
                    </p>
                    <Button
                      className="mb-3 min-h-11 w-full"
                      variant={
                        selected === entry.user.id ? "default" : "outline"
                      }
                      aria-pressed={selected === entry.user.id}
                      aria-label={`Atender a ${name(entry)}`}
                      disabled={
                        !available(entry) || loading || submitting || shop.busy
                      }
                      onClick={() => void loadTeam(entry)}
                    >
                      {selected === entry.user.id && (
                        <Check className="mr-2 h-4 w-4" />
                      )}{" "}
                      {selected === entry.user.id
                        ? "Jugador seleccionado"
                        : "Atender jugador"}
                    </Button>
                    <label className="block space-y-1 text-xs">
                      <span>Color del jugador</span>
                      <select
                        className="min-h-10 w-full rounded-md border bg-background px-2 text-foreground"
                        aria-label={`Color de ${name(entry)}`}
                        value={shopPlayerColor(colors, entry.user.id)}
                        onChange={(event) =>
                          changeColor(
                            entry.user.id,
                            event.target.value as PlayerColorId,
                          )
                        }
                      >
                        {PLAYER_COLORS.map((color) => (
                          <option key={color.id} value={color.id}>
                            {color.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
      {!!pending.length && (
        <section className="mt-6" aria-labelledby="center-pending-heading">
          <h2 id="center-pending-heading" className="mb-3 text-lg font-bold">
            Recuperaciones pendientes de guardar
          </h2>
          <ul className="space-y-3">
            {pending.map((entry) => (
              <li
                key={`${entry.userId}:${entry.requestId}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"
              >
                <span>
                  {players.find((p) => p.user.id === entry.userId)?.user
                    .email ?? `Jugador #${entry.userId}`}{" "}
                  · {entry.captureIds.length} Pokémon · Esperando guardado
                </span>
                <CenterCancelButton receipt={entry} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Cada atención revive y recupera por completo a los Pokémon
        seleccionados. Puedes repetirla para atender al resto del equipo. No
        consume objetos ni Pokedollars.
      </p>
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open && !submitting) setDraft(null);
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => {
            if (submitting) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (submitting) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Confirmar recuperación</DialogTitle>
            <DialogDescription>
              {draft
                ? `Se recuperarán ${draft.captureIds.map((id) => draft.preview.pokemons.find((p) => p.captureId === id)?.name).join(" y ")} del equipo de ${name(draft.player)}. Se restaurarán HP y PP, se revivirán los debilitados y se eliminarán los estados negativos y cambios temporales de estadísticas. Es gratis.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={submitting}
              onClick={() => setDraft(null)}
            >
              Volver
            </Button>
            <Button
              data-testid="center-confirm"
              disabled={
                submitting ||
                !shop.connected ||
                shop.busy ||
                (!draft?.attempted && !canHeal)
              }
              onClick={() => void confirm()}
            >
              {submitting
                ? "Confirmando…"
                : draft?.attempted
                  ? "Recuperar operación"
                  : "Confirmar recuperación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
