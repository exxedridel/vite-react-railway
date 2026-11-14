import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Coins, LogOut, RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModeToggle } from "@/components/ui/mode-toggle";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useShopContext } from "@/context/ShopContext";
import { SHOP_ITEMS, formatShopMoney } from "@/lib/adminShop";
import type {
  ShopPlayer,
  ShopCatalog,
  BalanceAdjustment,
} from "@/lib/shop/types";
import BalanceAbortButton from "@/components/shop/BalanceAbortButton";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo completar la operación.";
const amount = (value: string, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  /^\d+$/.test(value) &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) >= min &&
  Number(value) <= max
    ? Number(value)
    : null;
const name = (player: ShopPlayer) =>
  `${player.user.first_name} ${player.user.last_name}`.trim() ||
  player.user.email;

function PriceRow({
  item,
  catalog,
}: {
  item: (typeof SHOP_ITEMS)[number];
  catalog: ShopCatalog;
}) {
  const shop = useShopContext(),
    price = catalog.prices[item.id];
  const [value, setValue] = useState(String(price)),
    [dirty, setDirty] = useState(false);
  const [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const pending = useRef<{
    requestId: string;
    price: number;
    revision: number;
  } | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (!dirty) setValue(String(price));
  }, [price, dirty]);
  const parsed = amount(value, 0, Math.floor(Number.MAX_SAFE_INTEGER / 99));
  async function save() {
    if (parsed === null || submitting.current || !shop.connected || shop.busy)
      return;
    submitting.current = true;
    setError("");
    setSaved(false);
    const request =
      pending.current?.price === parsed
        ? pending.current
        : {
            requestId: crypto.randomUUID(),
            price: parsed,
            revision: catalog.revision,
          };
    pending.current = request;
    try {
      await shop.setPrice(
        item.id,
        request.price,
        request.revision,
        request.requestId,
      );
      pending.current = null;
      setDirty(false);
      setSaved(true);
    } catch (error) {
      setError(errorText(error));
      await shop.sync().catch(() => {});
      if ((error as { code?: string })?.code) pending.current = null;
    } finally {
      submitting.current = false;
    }
  }
  return (
    <li
      className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_10rem_auto] sm:items-center"
      data-item-id={item.id}
    >
      <div className="flex items-center gap-3">
        <img
          src={item.image}
          alt=""
          className="h-9 w-9 [image-rendering:pixelated]"
        />
        <div>
          <h3 className="font-semibold">{item.name}</h3>
          <p className="text-xs text-muted-foreground">
            Vigente: {formatShopMoney(price)} PD
          </p>
        </div>
      </div>
      <label className="space-y-1 text-xs">
        <span>Nuevo precio (PD)</span>
        <Input
          type="number"
          min={0}
          max={Math.floor(Number.MAX_SAFE_INTEGER / 99)}
          step={1}
          inputMode="numeric"
          value={value}
          aria-label={`Precio de ${item.name}`}
          disabled={shop.busy}
          onChange={(event) => {
            setValue(event.target.value);
            setDirty(true);
            setSaved(false);
            pending.current = null;
          }}
        />
      </label>
      <Button
        variant="outline"
        aria-label={`Guardar precio de ${item.name}`}
        disabled={
          !shop.connected ||
          !shop.synced ||
          shop.busy ||
          parsed === null ||
          (!dirty && parsed === price)
        }
        onClick={() => void save()}
      >
        Guardar precio
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive sm:col-span-3">
          {error}
        </p>
      )}
      {saved && (
        <p
          role="status"
          className="text-xs text-muted-foreground sm:col-span-3"
        >
          Precio guardado.
        </p>
      )}
    </li>
  );
}
function CaptureDifficultyPanel({ catalog }: { catalog: ShopCatalog }) {
  const shop = useShopContext();
  const modifier = catalog.captureDifficulty ?? 0;
  const [value, setValue] = useState(String(modifier));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const pending = useRef<{
    requestId: string;
    modifier: number;
    revision: number;
  } | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (!dirty) setValue(String(modifier));
  }, [modifier, dirty]);
  const parsed = amount(value, 0, 20);
  async function save() {
    if (parsed === null || submitting.current || !shop.connected || shop.busy)
      return;
    submitting.current = true;
    setError("");
    setSaved(false);
    const request =
      pending.current?.modifier === parsed
        ? pending.current
        : {
            requestId: crypto.randomUUID(),
            modifier: parsed,
            revision: catalog.revision,
          };
    pending.current = request;
    try {
      await shop.setCaptureDifficulty(
        request.modifier,
        request.revision,
        request.requestId,
      );
      pending.current = null;
      setDirty(false);
      setSaved(true);
    } catch (reason) {
      setError(errorText(reason));
      await shop.sync().catch(() => {});
      if ((reason as { code?: string })?.code) pending.current = null;
    } finally {
      submitting.current = false;
    }
  }
  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4 text-card-foreground"
      aria-labelledby="capture-difficulty-heading"
    >
      <h2 id="capture-difficulty-heading" className="text-xl font-semibold">
        Dificultad de captura
      </h2>
      <p className="text-sm text-muted-foreground">
        Suma al mínimo del D20 de todos los jugadores, después de los bonos de
        HP, estados y pokebola. 0 conserva la dificultad normal.
      </p>
      <p
        className="text-sm font-medium"
        data-testid="capture-difficulty-current"
      >
        Vigente: +{modifier} al mínimo D20
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="space-y-1 text-sm">
          <span>Aumento del mínimo (0–20)</span>
          <Input
            type="number"
            min={0}
            max={20}
            step={1}
            inputMode="numeric"
            aria-label="Dificultad global de captura"
            value={value}
            disabled={shop.busy}
            onChange={(event) => {
              setValue(event.target.value);
              setDirty(true);
              setSaved(false);
              pending.current = null;
            }}
          />
        </label>
        <Button
          variant="outline"
          data-testid="capture-difficulty-save"
          disabled={
            !shop.connected ||
            !shop.synced ||
            shop.busy ||
            parsed === null ||
            (!dirty && parsed === modifier)
          }
          onClick={() => void save()}
        >
          Guardar dificultad
        </Button>
      </div>
      {parsed !== null && (
        <p className="text-sm">
          Ejemplo: una captura que requiere 7+ pasará a necesitar{" "}
          <strong>{7 + parsed}+</strong>.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Si el mínimo supera 20, esa bola no se puede lanzar: mejora las
        condiciones de captura o usa una bola mejor. Los intentos ya lanzados
        conservan el mínimo confirmado.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p
          role="status"
          data-testid="capture-difficulty-saved"
          className="text-sm text-muted-foreground"
        >
          Dificultad guardada para todos los jugadores.
        </p>
      )}
    </section>
  );
}

function OpponentAutomationPanel({ catalog }: { catalog: ShopCatalog }) {
  const shop = useShopContext();
  const enabled = catalog.automaticOpponents ?? false;
  const [value, setValue] = useState(enabled);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const pending = useRef<{
    requestId: string;
    enabled: boolean;
    revision: number;
  } | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (!dirty) setValue(enabled);
  }, [enabled, dirty]);
  async function save() {
    if (submitting.current || !shop.connected || shop.busy) return;
    submitting.current = true;
    setError("");
    setSaved(false);
    const request =
      pending.current?.enabled === value
        ? pending.current
        : {
            requestId: crypto.randomUUID(),
            enabled: value,
            revision: catalog.revision,
          };
    pending.current = request;
    try {
      await shop.setOpponentAutomation(
        request.enabled,
        request.revision,
        request.requestId,
      );
      pending.current = null;
      setDirty(false);
      setSaved(true);
    } catch (reason) {
      setError(errorText(reason));
      await shop.sync().catch(() => {});
      if ((reason as { code?: string })?.code) pending.current = null;
    } finally {
      submitting.current = false;
    }
  }
  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-4 text-card-foreground"
      aria-labelledby="opponent-automation-heading"
    >
      <h2 id="opponent-automation-heading" className="text-xl font-semibold">
        Control de los rivales
      </h2>
      <p className="text-sm text-muted-foreground">
        En los encuentros nuevos del jugador, la IA de Trainer Battle elegirá
        los movimientos del rival salvaje o de entrenador. El jugador sólo elige
        sus propias acciones.
      </p>
      <p
        className="text-sm font-medium"
        data-testid="opponent-automation-current"
      >
        Vigente: {enabled ? "Rivales automáticos" : "Rivales manuales"}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            role="switch"
            aria-label="Rivales automáticos"
            checked={value}
            disabled={shop.busy}
            className="h-5 w-5 accent-[hsl(var(--primary))]"
            onChange={(event) => {
              setValue(event.target.checked);
              setDirty(true);
              setSaved(false);
              pending.current = null;
            }}
          />
          Rivales automáticos
        </label>
        <Button
          variant="outline"
          data-testid="opponent-automation-save"
          disabled={
            !shop.connected ||
            !shop.synced ||
            shop.busy ||
            (!dirty && value === enabled)
          }
          onClick={() => void save()}
        >
          Guardar modo
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Los encuentros en curso conservan su modo al cambiar este ajuste o
        recargar. Las capturas fallidas mantienen su respuesta rival automática.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p
          role="status"
          data-testid="opponent-automation-saved"
          className="text-sm text-muted-foreground"
        >
          Modo guardado para los encuentros nuevos.
        </p>
      )}
    </section>
  );
}

type Draft = {
  player: ShopPlayer;
  delta: number;
  balance: number;
  revision: number;
  requestId: string;
  attempted: boolean;
};

export default function BackOfficePage() {
  const shop = useShopContext();
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [receipt, setReceipt] = useState<BalanceAdjustment | null>(null);
  const [error, setError] = useState(""),
    [submitting, setSubmitting] = useState(false),
    [syncing, setSyncing] = useState(false);
  const submitLock = useRef(false);
  const players = [
    ...new Map(
      shop.players
        .filter((player) => player.online)
        .map((player) => [player.user.id, player]),
    ).values(),
  ];
  const current =
    draft &&
    players.find(
      (player) =>
        player.user.id === draft.player.user.id &&
        player.clientId === draft.player.clientId,
    );
  const transaction =
    draft &&
    (shop.adjustments.find(
      (entry) =>
        entry.requestId === draft.requestId &&
        entry.userId === draft.player.user.id,
    ) ??
      receipt);
  const ready = shop.connected && shop.synced;
  const available = (player: ShopPlayer) =>
    ready &&
    player.supportsBalanceAdjustments === true &&
    player.ready &&
    !!player.wallet &&
    !player.inBattle &&
    !player.pending &&
    !shop.busy;
  const changed =
    !!draft &&
    (!current?.wallet ||
      current.wallet.revision !== draft.revision ||
      current.wallet.balance !== draft.balance);
  const canConfirm =
    !!draft &&
    !transaction &&
    !submitting &&
    !shop.busy &&
    ready &&
    (draft.attempted || (!changed && !!current && available(current)));
  function open(player: ShopPlayer, sign: 1 | -1) {
    const quantity = amount(amounts[player.user.id] ?? "", 1);
    if (!quantity || !available(player) || !player.wallet) return;
    const next = player.wallet.balance + sign * quantity;
    if (next < 0 || !Number.isSafeInteger(next)) return;
    setError("");
    setReceipt(null);
    setDraft({
      player,
      delta: sign * quantity,
      balance: player.wallet.balance,
      revision: player.wallet.revision,
      requestId: crypto.randomUUID(),
      attempted: false,
    });
  }
  async function confirm() {
    if (!draft || !canConfirm || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setError("");
    const request = { ...draft, attempted: true };
    setDraft(request);
    try {
      setReceipt(
        await shop.adjustBalance(
          request.player,
          request.delta,
          request.revision,
          request.requestId,
        ),
      );
    } catch (error) {
      setError(errorText(error));
      await shop.sync().catch(() => {});
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }
  function close() {
    if (submitLock.current) return;
    setDraft(null);
    setReceipt(null);
    setError("");
  }
  async function sync() {
    setSyncing(true);
    setError("");
    try {
      await shop.sync();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setSyncing(false);
    }
  }
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Settings2 className="h-6 w-6 text-brand" />
            Back office
          </h1>
          <p className="text-sm text-muted-foreground">
            Reglas de los encuentros, precios del Poké Mart y Pokedollars de los
            jugadores.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => void sync()}
            disabled={syncing || shop.busy}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
          <ModeToggle />
          <Button asChild variant="outline" size="icon">
            <Link to="/logout" aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>
      {!ready && (
        <p role="status" className="rounded-xl border p-3 text-sm">
          Conectando y recuperando precios y saldos…
        </p>
      )}
      {(error || shop.error) && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error || shop.error}
        </p>
      )}
      {shop.catalog && <CaptureDifficultyPanel catalog={shop.catalog} />}
      {shop.catalog && <OpponentAutomationPanel catalog={shop.catalog} />}
      <section className="space-y-3" aria-labelledby="back-office-prices">
        <h2 id="back-office-prices" className="text-xl font-semibold">
          Precios de los objetos
        </h2>
        <p className="text-sm text-muted-foreground">
          Se aplican a toda la tienda y se conservan al reconectar. Precio 0
          permite entregar objetos gratis. Las compras confirmadas conservan su
          precio.
        </p>
        {shop.catalog ? (
          <ul className="space-y-3">
            {SHOP_ITEMS.map((item) => (
              <PriceRow key={item.id} item={item} catalog={shop.catalog!} />
            ))}
          </ul>
        ) : (
          <p role="status">Recuperando el catálogo…</p>
        )}
      </section>
      <section className="space-y-3" aria-labelledby="back-office-players">
        {shop.adjustments.some((entry) => entry.status === "pending") && (
          <section
            className="space-y-3 rounded-xl border border-destructive/30 p-4"
            aria-label="Ajustes pendientes"
          >
            <h2 className="font-semibold">Ajustes pendientes de guardar</h2>
            {shop.adjustments
              .filter((entry) => entry.status === "pending")
              .map((entry) => (
                <div
                  key={entry.adjustmentId}
                  data-adjustment-id={entry.adjustmentId}
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <p className="text-sm">
                    {players.find((player) => player.user.id === entry.userId)
                      ?.user.email ?? `Jugador #${entry.userId}`}{" "}
                    · {entry.delta > 0 ? "+" : ""}
                    {formatShopMoney(entry.delta)} PD · Esperando guardado
                  </p>
                  <BalanceAbortButton receipt={entry} />
                </div>
              ))}
          </section>
        )}
        <h2
          id="back-office-players"
          className="flex items-center gap-2 text-xl font-semibold"
        >
          <Coins className="h-5 w-5" />
          Pokedollars · jugadores conectados
        </h2>
        <p className="text-sm text-muted-foreground">
          Agrega o quita una cantidad exacta fuera de batalla. Espera a que
          termine cualquier operación pendiente.
        </p>
        {!players.length && (
          <p role="status" className="rounded-xl border p-4">
            No hay jugadores conectados.
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {players.map((player) => {
            const quantity = amount(amounts[player.user.id] ?? "", 1),
              balance = player.wallet?.balance ?? 0;
            return (
              <article
                key={player.user.id}
                data-testid={`back-office-player-${player.user.id}`}
                className="space-y-3 rounded-xl border bg-card p-4 text-card-foreground"
              >
                <div>
                  <h3 className="font-semibold">{name(player)}</h3>
                  <p className="break-all text-xs text-muted-foreground">
                    {player.user.email}
                  </p>
                </div>
                <p className="text-2xl font-bold tabular-nums">
                  {player.wallet ? formatShopMoney(balance) : "…"} PD
                </p>
                <p className="text-sm text-muted-foreground" role="status">
                  {player.supportsBalanceAdjustments !== true
                    ? "Actualiza y recarga el frontend del jugador para ajustar Pokedollars."
                    : player.inBattle
                      ? "En batalla · ajustes bloqueados"
                      : player.pending
                        ? "Esperando guardado de una operación"
                        : !player.ready
                          ? "Sincronizando"
                          : "Disponible"}
                </p>
                <label className="block space-y-1 text-sm">
                  <span>Cantidad de Pokedollars</span>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    aria-label={`Cantidad de Pokedollars para ${player.user.email}`}
                    value={amounts[player.user.id] ?? ""}
                    onChange={(event) =>
                      setAmounts({
                        ...amounts,
                        [player.user.id]: event.target.value,
                      })
                    }
                    disabled={!available(player)}
                  />
                </label>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={
                      !available(player) ||
                      !quantity ||
                      !Number.isSafeInteger(balance + quantity)
                    }
                    aria-label={`Agregar Pokedollars a ${player.user.email}`}
                    onClick={() => open(player, 1)}
                  >
                    Agregar
                  </Button>
                  <Button
                    className="flex-1"
                    variant="outline"
                    disabled={
                      !available(player) || !quantity || quantity > balance
                    }
                    aria-label={`Quitar Pokedollars a ${player.user.email}`}
                    onClick={() => open(player, -1)}
                  >
                    Quitar
                  </Button>
                </div>
                {quantity !== null && quantity > balance && (
                  <p className="text-xs text-muted-foreground">
                    No puedes quitar más Pokedollars de los disponibles.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar ajuste de Pokedollars</DialogTitle>
            <DialogDescription>
              {draft ? name(draft.player) : ""} · {draft?.player.user.email}
            </DialogDescription>
          </DialogHeader>
          {draft &&
            (transaction ? (
              <div role="status" className="space-y-2">
                <p>
                  {transaction.status === "applied"
                    ? "El jugador guardó el ajuste."
                    : transaction.status === "cancelled"
                      ? "Ajuste cancelado. Se restableció el saldo anterior."
                      : "Esperando guardado en el dispositivo del jugador."}
                </p>
                <p>
                  Saldo resultante:{" "}
                  {formatShopMoney(
                    transaction.cancelledBalance ?? transaction.balanceAfter,
                  )}{" "}
                  PD
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <dl className="grid grid-cols-2 gap-2 rounded-xl border p-3 text-sm">
                  <dt>Saldo actual</dt>
                  <dd className="text-right">
                    {formatShopMoney(draft.balance)} PD
                  </dd>
                  <dt>{draft.delta > 0 ? "Agregar" : "Quitar"}</dt>
                  <dd className="text-right">
                    {formatShopMoney(Math.abs(draft.delta))} PD
                  </dd>
                  <dt>Saldo resultante</dt>
                  <dd className="text-right font-bold">
                    {formatShopMoney(draft.balance + draft.delta)} PD
                  </dd>
                </dl>
                {changed && !draft.attempted && (
                  <p role="alert" className="text-sm">
                    El saldo o la conexión cambió. Cancela y revisa el ajuste.
                  </p>
                )}
                {draft.attempted && (
                  <p className="text-sm text-muted-foreground">
                    Si no llegó la confirmación, reintenta la misma solicitud
                    para recuperar su resultado.
                  </p>
                )}
              </div>
            ))}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            {transaction?.status === "pending" && (
              <BalanceAbortButton receipt={transaction} />
            )}
            <Button variant="outline" onClick={close} disabled={submitting}>
              {transaction ? "Listo" : "Cancelar"}
            </Button>
            {!transaction && (
              <Button
                data-testid="balance-adjust-confirm"
                disabled={!canConfirm}
                onClick={() => void confirm()}
              >
                {submitting
                  ? "Confirmando…"
                  : draft?.attempted
                    ? "Recuperar ajuste"
                    : "Confirmar ajuste"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
