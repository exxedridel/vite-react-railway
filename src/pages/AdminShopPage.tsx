import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  Minus,
  Plus,
  Coins,
  LogOut,
  Settings2,
  Store,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModeToggle } from "@/components/ui/mode-toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ADMIN_SHOP_STORAGE_KEY,
  assignPlayerColor,
  calculatePlayerBalance,
  changePlayerMoney,
  type MoneyOperation,
  PLAYER_COLORS,
  SHOP_ITEMS,
  formatShopMoney,
  parsePlayerCount,
  parsePlayerMoney,
  readAdminSession,
  validAdminSession,
  writeAdminSession,
  type AdminShopSession,
  type PlayerColorId,
  type ShopPlayer,
} from "@/lib/adminShop";
import "./AdminShopPage.css";

function loadSession() {
  try {
    return { session: readAdminSession(localStorage), error: "" };
  } catch {
    return {
      session: null,
      error:
        "No se pudo recuperar la configuración guardada. Puedes configurar la mesa nuevamente.",
    };
  }
}
function playerStyle(colorId: PlayerColorId): CSSProperties {
  const color = PLAYER_COLORS.find((c) => c.id === colorId)!;
  return {
    "--player-color": color.hsl || "var(--primary)",
    "--player-foreground": color.foreground || "var(--primary-foreground)",
  } as CSSProperties;
}

function PlayerMoneyCard({
  player,
  onChange,
}: {
  player: ShopPlayer;
  onChange: (id: string, amount: number, operation: MoneyOperation) => boolean;
}) {
  const [operation, setOperation] = useState<MoneyOperation | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);
  useEffect(() => {
    if (operation) inputRef.current?.focus();
  }, [operation]);
  const amount = parsePlayerMoney(draft);
  const nextBalance =
    operation && amount !== null
      ? calculatePlayerBalance(player.money, amount, operation)
      : null;
  const insufficient =
    operation === "subtract" && amount !== null && amount > player.money;
  function chooseOperation(next: MoneyOperation) {
    submitted.current = false;
    setDraft("");
    setOperation(next);
    inputRef.current?.focus();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!operation || submitted.current) return;
    if (amount === null || amount <= 0) {
      toast.error("Ingresa una cantidad entera mayor que cero.");
      return;
    }
    submitted.current = true;
    if (onChange(player.id, amount, operation)) {
      setOperation(null);
      setDraft("");
    } else submitted.current = false;
  }
  const color = PLAYER_COLORS.find((c) => c.id === player.colorId)!;
  return (
    <article className="admin-player-card" style={playerStyle(player.colorId)}>
      <div className="admin-player-card__heading">
        <span className="admin-player-dot" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="break-words font-semibold">{player.nickname}</h3>
          <p className="text-xs text-muted-foreground">{color.name}</p>
        </div>
      </div>
      <p className="mb-1 text-xs text-muted-foreground">Dinero actual</p>
      <p
        className="mb-3 break-all text-3xl font-bold tabular-nums"
        aria-live="polite"
      >
        ${formatShopMoney(player.money)}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          onClick={() => chooseOperation("subtract")}
          disabled={player.money === 0}
          aria-label={`Restar dinero a ${player.nickname}`}
        >
          <Minus className="h-4 w-4" aria-hidden="true" /> Restar
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          onClick={() => chooseOperation("add")}
          aria-label={`Agregar dinero a ${player.nickname}`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Agregar
        </Button>
      </div>
      {operation && (
        <form onSubmit={submit} className="mt-3 space-y-3 border-t pt-3">
          <label
            htmlFor={`money-${player.id}`}
            className="block text-sm font-medium"
          >
            {operation === "add" ? "Cantidad a agregar" : "Cantidad a restar"}
          </label>
          <Input
            ref={inputRef}
            id={`money-${player.id}`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]+"
            maxLength={16}
            autoComplete="off"
            placeholder="0"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={draft !== "" && nextBalance === null}
            aria-describedby={`money-help-${player.id}`}
          />
          <p
            id={`money-help-${player.id}`}
            className={`text-xs ${insufficient ? "text-destructive" : "text-muted-foreground"}`}
          >
            {insufficient
              ? "El saldo no alcanza para restar esa cantidad."
              : nextBalance !== null
                ? `Nuevo saldo: $${formatShopMoney(nextBalance)}`
                : "Ingresa una cantidad entera mayor que cero, sin comas ni decimales."}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOperation(null);
                setDraft("");
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={nextBalance === null}>
              Confirmar
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}

export default function AdminShopPage() {
  const [loaded] = useState(loadSession);
  const [session, setSession] = useState<AdminShopSession | null>(
    loaded.session,
  );
  const sessionRef = useRef(session);
  const [storageError, setStorageError] = useState(loaded.error);
  const [step, setStep] = useState<"count" | "players" | "shop">(
    loaded.session ? "shop" : "count",
  );
  const [countDraft, setCountDraft] = useState(
    String(loaded.session?.players.length ?? 2),
  );
  const [playersDraft, setPlayersDraft] = useState<ShopPlayer[]>(
    loaded.session?.players ?? [],
  );
  const [resetOpen, setResetOpen] = useState(false);
  const count = parsePlayerCount(countDraft);

  function persist(next: AdminShopSession): boolean {
    try {
      writeAdminSession(localStorage, next);
      sessionRef.current = next;
      setSession(next);
      setStorageError("");
      return true;
    } catch {
      setStorageError(
        "No se pudo guardar en este navegador. Revisa el espacio o los permisos de almacenamiento e intenta nuevamente.",
      );
      return false;
    }
  }
  function chooseCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (count === null) return;
    const players = playersDraft.slice(0, count);
    while (players.length < count) {
      const saved = session?.players[players.length];
      const color = PLAYER_COLORS.find(
        (c) => !players.some((p) => p.colorId === c.id),
      )!;
      players.push({
        id: saved?.id ?? crypto.randomUUID(),
        nickname: saved?.nickname ?? "",
        colorId:
          saved && !players.some((p) => p.colorId === saved.colorId)
            ? saved.colorId
            : color.id,
        money: saved?.money ?? 0,
      });
    }
    setPlayersDraft(players);
    setStep("players");
  }
  function updateDraft(
    id: string,
    change: Partial<Pick<ShopPlayer, "nickname" | "colorId">>,
  ) {
    setPlayersDraft((current) =>
      change.colorId
        ? assignPlayerColor(current, id, change.colorId)
        : current.map((p) => (p.id === id ? { ...p, ...change } : p)),
    );
  }
  function confirmPlayers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: AdminShopSession = {
      version: 1,
      players: playersDraft.map((p) => ({ ...p, nickname: p.nickname.trim() })),
    };
    if (!validAdminSession(next)) {
      toast.error(
        "Cada jugador necesita un nickname y color distintos. El nickname admite hasta 30 caracteres.",
      );
      return;
    }
    if (persist(next)) {
      setStep("shop");
      toast.success("Mesa de jugadores guardada.");
    }
  }
  function adjustMoney(
    id: string,
    amount: number,
    operation: MoneyOperation,
  ): boolean {
    const current = sessionRef.current;
    if (!current) return false;
    const next = changePlayerMoney(current, id, amount, operation);
    if (!next) {
      const player = current.players.find((p) => p.id === id);
      toast.error(
        operation === "subtract" && player && amount > player.money
          ? "El jugador no tiene suficiente dinero."
          : "No se pudo aplicar esa cantidad. Revisa el valor ingresado.",
      );
      return false;
    }
    if (!persist(next)) return false;
    toast.success(
      `${operation === "add" ? "Agregaste" : "Restaste"} $${formatShopMoney(amount)} a ${next.players.find((p) => p.id === id)!.nickname}.`,
    );
    return true;
  }
  function resetTable() {
    try {
      localStorage.removeItem(ADMIN_SHOP_STORAGE_KEY);
    } catch {
      setStorageError("No se pudo reiniciar la mesa. Intenta nuevamente.");
      return;
    }
    sessionRef.current = null;
    setSession(null);
    setPlayersDraft([]);
    setCountDraft("2");
    setStep("count");
    setResetOpen(false);
    setStorageError("");
  }

  return (
    <main className="admin-shop-page">
      <header className="admin-shop-header">
        <div className="flex min-w-0 items-center gap-2.5">
          <Store className="h-7 w-7 shrink-0 text-brand" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Administrador
            </p>
            <h1 className="text-xl font-bold">Poké Mart</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ModeToggle />
          <Button asChild variant="outline" size="icon">
            <Link to="/logout" aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>
      {storageError && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          {storageError}
        </p>
      )}

      {step !== "shop" ? (
        <section className="admin-setup">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand">
            Configuración · Paso {step === "count" ? "1" : "2"} de 2
          </p>
          {step === "count" ? (
            <form onSubmit={chooseCount} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold">
                  ¿Cuántos jugadores están jugando?
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  De 1 a 8 jugadores, uno por cada color disponible.
                </p>
              </div>
              <label
                htmlFor="admin-player-count"
                className="block text-sm font-medium"
              >
                Número de jugadores
              </label>
              <Input
                id="admin-player-count"
                type="text"
                inputMode="numeric"
                pattern="[0-9]+"
                maxLength={2}
                value={countDraft}
                onChange={(e) => setCountDraft(e.target.value)}
                className="max-w-32 text-center text-xl"
                autoFocus
              />
              {session && count !== null && count < session.players.length && (
                <p className="text-sm text-destructive">
                  Se retirarán los últimos {session.players.length - count}{" "}
                  jugadores y sus saldos al guardar la configuración.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {session && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("shop")}
                  >
                    Cancelar
                  </Button>
                )}
                <Button type="submit" disabled={count === null}>
                  Continuar
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={confirmPlayers} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold">
                  Presenta a los entrenadores
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Escribe sus nicknames y asigna el color que usa cada uno.
                </p>
              </div>
              <div className="space-y-3">
                {playersDraft.map((player, index) => (
                  <fieldset key={player.id} className="rounded-xl border p-3">
                    <legend className="px-1 text-sm font-semibold">
                      Jugador {index + 1}
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`name-${player.id}`}
                          className="mb-1.5 block text-xs font-medium"
                        >
                          Nickname
                        </label>
                        <Input
                          id={`name-${player.id}`}
                          value={player.nickname}
                          maxLength={30}
                          autoComplete="off"
                          placeholder="Nombre del entrenador"
                          onChange={(e) =>
                            updateDraft(player.id, { nickname: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`color-${player.id}`}
                          className="mb-1.5 block text-xs font-medium"
                        >
                          Color
                        </label>
                        <div
                          className="flex items-center gap-2"
                          style={playerStyle(player.colorId)}
                        >
                          <span
                            className="admin-player-dot"
                            aria-hidden="true"
                          />
                          <select
                            id={`color-${player.id}`}
                            value={player.colorId}
                            onChange={(e) =>
                              updateDraft(player.id, {
                                colorId: e.target.value as PlayerColorId,
                              })
                            }
                            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {PLAYER_COLORS.map((color) => (
                              <option key={color.id} value={color.id}>
                                {color.name}
                                {playersDraft.some(
                                  (p) =>
                                    p.id !== player.id &&
                                    p.colorId === color.id,
                                )
                                  ? " · Intercambiar"
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </fieldset>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("count")}
                >
                  Volver
                </Button>
                <Button type="submit">
                  {session ? "Guardar configuración" : "Abrir tienda"}
                </Button>
              </div>
            </form>
          )}
        </section>
      ) : (
        session && (
          <>
            <section
              className="admin-mart-scene"
              aria-labelledby="admin-shop-prices"
            >
              <div className="admin-mart-menu">
                <div className="admin-mart-menu__title">
                  <h2 id="admin-shop-prices">Poké Mart</h2>
                  <span>Lista de precios</span>
                </div>
                <ul className="admin-mart-items">
                  {SHOP_ITEMS.map((item) => (
                    <li key={item.id} className="admin-mart-item">
                      <img src={item.image} alt="" draggable={false} />
                      <span className="admin-mart-item__name">{item.name}</span>
                      <strong>${formatShopMoney(item.price)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
            <section className="mt-6" aria-labelledby="admin-players-heading">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2
                  id="admin-players-heading"
                  className="flex items-center gap-2 text-lg font-bold"
                >
                  <Users className="h-5 w-5 text-brand" /> Jugadores ·{" "}
                  {session.players.length}
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPlayersDraft(session.players.map((p) => ({ ...p })));
                    setCountDraft(String(session.players.length));
                    setStep("count");
                  }}
                  className="gap-1.5"
                >
                  <Settings2 className="h-4 w-4" /> Configurar
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {session.players.map((player) => (
                  <PlayerMoneyCard
                    key={player.id}
                    player={player}
                    onChange={adjustMoney}
                  />
                ))}
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Coins className="h-4 w-4 shrink-0" />
                Control manual de la mesa. Los saldos se guardan en este
                navegador.
              </p>
            </section>
            <div className="mt-6 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setResetOpen(true)}
              >
                Nueva mesa
              </Button>
            </div>
          </>
        )
      )}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>¿Comenzar una nueva mesa?</DialogTitle>
            <DialogDescription>
              Se borrarán los jugadores y saldos de este panel administrador.
              Después podrás configurar la nueva mesa.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={resetTable}>
              Nueva mesa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
