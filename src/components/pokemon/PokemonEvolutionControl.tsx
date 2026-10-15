import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { store } from "@/store/store";
import { useLazyGetPokemonQuery } from "@/api/pokeApi";
import { evolvePokemon } from "@/slices/partySlice";
import { evolutionOptions } from "@/lib/gen3Evolutions";
import {
  evolutionBattleActive,
  evolutionLevelError,
  evolutionRequirements,
} from "@/lib/pokemonEvolution";

export default function PokemonEvolutionControl({
  captureId,
}: {
  captureId: string;
}) {
  const dispatch = useAppDispatch();
  const capture = useAppSelector((s) =>
    s.party.pokemons.find((p) => p.captureId === captureId),
  );
  const opponent = useAppSelector((s) => s.party.opponent);
  const partySize = useAppSelector((s) => s.party.pokemons.length);
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [getPokemon] = useLazyGetPokemonQuery();
  const requests = useRef<Array<ReturnType<typeof getPokemon>>>([]);
  const operation = useRef(0);
  const busyRef = useRef(false);
  const options = evolutionOptions(capture?.pokemon.id ?? 0);
  const rule = options.find((r) => r.to === targetId);
  const battleActive = evolutionBattleActive(opponent);
  const requirements = rule ? evolutionRequirements(rule) : [];
  const levelError =
    capture && rule ? evolutionLevelError(capture, rule) : null;
  const cancel = () => {
    operation.current += 1;
    requests.current.forEach((r) => r.abort());
    requests.current = [];
    busyRef.current = false;
    setBusy(false);
  };
  useEffect(
    () => () => {
      operation.current += 1;
      requests.current.forEach((r) => r.abort());
    },
    [],
  );
  useEffect(() => {
    if (battleActive) {
      cancel();
      setConfirmed(false);
    }
  }, [battleActive]);
  useEffect(() => {
    setConfirmed(false);
  }, [capture?.pokemon.level, capture?.pokemon.id, targetId]);
  if (!capture) return null;

  async function confirmEvolution() {
    if (!capture || !rule || !confirmed || busyRef.current) return;
    const live = store.getState().party;
    const current = live.pokemons.find((p) => p.captureId === captureId);
    if (!current || evolutionBattleActive(live.opponent)) {
      toast.error("No puedes evolucionar durante un combate activo.");
      return;
    }
    const error = evolutionLevelError(current, rule);
    if (error) {
      toast.error(error);
      return;
    }
    const expectedCapture = JSON.stringify(current);
    const token = ++operation.current;
    busyRef.current = true;
    setBusy(true);
    try {
      const targetRequest = getPokemon(String(rule.to), true);
      requests.current.push(targetRequest);
      const bonusRequest =
        rule.method === "level_ninjask" && live.pokemons.length < 6
          ? getPokemon("292", true)
          : null;
      if (bonusRequest) requests.current.push(bonusRequest);
      const [evolution, shedinja] = await Promise.all([
        targetRequest.unwrap(),
        bonusRequest ? bonusRequest.unwrap() : Promise.resolve(undefined),
      ]);
      if (token !== operation.current) return;
      dispatch(
        evolvePokemon({
          captureId,
          expectedCapture,
          evolution,
          requirementsConfirmed: confirmed,
          shedinja,
        }),
      );
      const updated = store
        .getState()
        .party.pokemons.find((p) => p.captureId === captureId);
      if (updated?.pokemon.id !== rule.to) {
        toast.error(
          "El equipo o el combate cambió. Revisa los requisitos e intenta de nuevo.",
        );
        return;
      }
      setOpen(false);
      toast.success(`${current.pokemon.name} evolucionó a ${evolution.name}.`);
    } catch {
      if (token === operation.current)
        toast.error(
          "No se pudo cargar la evolución. Tu Pokémon se conserva; intenta nuevamente.",
        );
    } finally {
      if (token === operation.current) {
        requests.current = [];
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
  const reason = battleActive
    ? "No puedes evolucionar durante un combate activo"
    : options.length === 0
      ? "No tiene una evolución disponible en Gen 3"
      : `Evolucionar a ${capture.pokemon.name}`;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0 rounded-full"
        disabled={battleActive || options.length === 0}
        aria-label={reason}
        title={reason}
        onClick={() => {
          setTargetId(options.length === 1 ? options[0].to : null);
          setConfirmed(false);
          setOpen(true);
        }}
      >
        <Sparkles className="h-4 w-4 text-brand" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) cancel();
          setOpen(value);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="capitalize">
              Evolucionar · {capture.pokemon.name}
            </DialogTitle>
            <DialogDescription>
              Elige una evolución de Gen 3 y confirma sus requisitos. Mantendrá
              su lugar en el equipo, movimientos, nivel y estados.
            </DialogDescription>
          </DialogHeader>
          <div
            className="grid grid-cols-2 gap-2"
            role="group"
            aria-label="Evoluciones disponibles"
          >
            {options.map((option) => (
              <button
                key={option.to}
                type="button"
                disabled={busy}
                aria-pressed={targetId === option.to}
                onClick={() => {
                  setTargetId(option.to);
                  setConfirmed(false);
                }}
                className={`rounded-xl border p-2 text-center capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${targetId === option.to ? "border-brand bg-muted ring-1 ring-brand" : "bg-card"}`}
              >
                <img
                  src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${option.to}.png`}
                  alt=""
                  className="mx-auto h-16 w-16 object-contain"
                />
                <span className="text-sm font-semibold">{option.name}</span>
              </button>
            ))}
          </div>
          {rule && (
            <div className="space-y-3">
              <ul className="list-disc space-y-2 pl-5 text-sm">
                {requirements.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
              {rule.method === "level_ninjask" && (
                <p className="text-xs text-muted-foreground">
                  {partySize < 6
                    ? "Hay espacio: también se añadirá Shedinja al final del equipo con el nivel, movimientos y estados conservados."
                    : "Tu equipo está lleno: evolucionará a Ninjask sin generar a Shedinja."}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Los stats se recalculan al mismo nivel y se conserva la
                proporción de HP. Los requisitos del tablero se declaran
                manualmente; la app no consume objetos.
              </p>
              {levelError && (
                <p role="alert" className="text-sm text-destructive">
                  {levelError}
                </p>
              )}
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy || battleActive || !!levelError}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--brand))]"
                />
                Confirmo que se cumplieron los requisitos para esta evolución.
              </label>
            </div>
          )}
          {battleActive && (
            <p role="alert" className="text-sm text-destructive">
              Hay un combate activo. Termina el encuentro antes de evolucionar.
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                cancel();
                setOpen(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                !rule || !confirmed || busy || battleActive || !!levelError
              }
              onClick={() => void confirmEvolution()}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {busy ? "Preparando evolución…" : "Evolucionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
