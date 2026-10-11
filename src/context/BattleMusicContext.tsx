import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAppSelector } from "@/store/hooks";
import { BattleMusic, type MusicPhase } from "@/lib/battleMusic";
import { getBattlePresence } from "@/lib/battlePresence";

const STORAGE_KEY = "pokemon-battle-music-enabled";
const MusicContext = createContext<{
  active: boolean;
  enabled: boolean;
  phase: MusicPhase;
  toggle: () => void;
} | null>(null);

export function BattleMusicProvider({ children }: { children: ReactNode }) {
  const opponent = useAppSelector((state) => state.party.opponent);
  const { key, active } = getBattlePresence(opponent);
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const [phase, setPhase] = useState<MusicPhase>("idle");
  const engine = useRef<BattleMusic | null>(null);
  useEffect(() => {
    const player = new BattleMusic(
      setPhase,
      () => new AudioContext(),
      async (context, signal) => {
        const response = await fetch(
          `${import.meta.env.BASE_URL}audio/trainer-battle.wav`,
          { signal },
        );
        if (!response.ok) throw new Error("Audio no disponible");
        return context.decodeAudioData(await response.arrayBuffer());
      },
    );
    engine.current = player;
    const unlock = () => player.unlock();
    const keyboard = (event: KeyboardEvent) => {
      if (!event.repeat) unlock();
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", keyboard);
      player.dispose();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.setEncounter(key, enabled);
  }, [key, enabled]);
  const toggle = () => {
    if (enabled && (phase === "blocked" || phase === "error")) {
      engine.current?.unlock();
      return;
    }
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* Preferencia solo en memoria. */
    }
    engine.current?.setEncounter(key, next);
    if (next) engine.current?.unlock();
  };
  return (
    <MusicContext.Provider value={{ active, enabled, phase, toggle }}>
      {children}
    </MusicContext.Provider>
  );
}
export function useBattleMusic() {
  const value = useContext(MusicContext);
  if (!value) throw new Error("BattleMusicProvider debe envolver Layout.");
  return value;
}
