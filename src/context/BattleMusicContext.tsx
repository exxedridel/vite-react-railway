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
  holdEncounter: () => () => void;
  holdCapture: () => () => void;
} | null>(null);

export function BattleMusicProvider({ children }: { children: ReactNode }) {
  const opponent = useAppSelector((state) => state.party.opponent);
  const { key, active } = getBattlePresence(opponent);
  const [held, setHeld] = useState<{
    key: string | null;
    active: boolean;
  } | null>(null);
  const holdToken = useRef<symbol | null>(null);
  const captureToken = useRef<symbol | null>(null);
  const captureSequence = useRef(0);
  const [captureKey, setCaptureKey] = useState<string | null>(null);
  const playbackKey = captureKey ?? (held ? held.key : key);
  const playbackActive = captureKey !== null || (held?.active ?? active);
  const playbackTrack = captureKey === null ? "battle" : "capture";
  const holdEncounter = () => {
    const token = Symbol("capture-presentation");
    holdToken.current = token;
    setHeld({ key, active });
    return () => {
      if (holdToken.current !== token) return;
      holdToken.current = null;
      setHeld(null);
    };
  };
  const holdCapture = () => {
    const token = Symbol("capture-success");
    captureToken.current = token;
    setCaptureKey(`captured:${++captureSequence.current}`);
    return () => {
      if (captureToken.current !== token) return;
      captureToken.current = null;
      setCaptureKey(null);
    };
  };
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
      async (context, signal, track) => {
        const response = await fetch(
          `${import.meta.env.BASE_URL}audio/${track === "capture" ? "wild-pokemon-captured" : "trainer-battle"}.wav`,
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
    // Touch receives user activation on release, so the first throw can unlock audio.
    document.addEventListener("pointerup", unlock);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("pointerup", unlock);
      document.removeEventListener("keydown", keyboard);
      player.dispose();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.setEncounter(playbackKey, enabled, playbackTrack);
  }, [playbackKey, enabled, playbackTrack]);
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
    engine.current?.setEncounter(playbackKey, next, playbackTrack);
    if (next) engine.current?.unlock();
  };
  return (
    <MusicContext.Provider
      value={{
        active: playbackActive,
        enabled,
        phase,
        toggle,
        holdEncounter,
        holdCapture,
      }}
    >
      {children}
    </MusicContext.Provider>
  );
}
export function useBattleMusic() {
  const value = useContext(MusicContext);
  if (!value) throw new Error("BattleMusicProvider debe envolver Layout.");
  return value;
}
