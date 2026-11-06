import { useEffect, useRef, useState } from "react";
import { BattleMusicButton } from "@/components/pokemon/BattleMusicControl";
import { BattleMusic, type MusicPhase } from "@/lib/battleMusic";
import type { TrainerBattleSession } from "@/lib/trainerBattle/types";

const STORAGE_KEY = "pokemon-battle-music-enabled";

export default function TrainerBattleMusicControl({
  session,
}: {
  session: TrainerBattleSession;
}) {
  const active = session.phase === "battle" && !session.runtime?.ended;
  const encounterKey = active ? session.id : null;
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
        const baseUrl =
          (import.meta.env as ImportMetaEnv & { BASE_URL?: string }).BASE_URL ??
          "/";
        const response = await fetch(`${baseUrl}audio/trainer-battle.wav`, {
          signal,
        });
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
    engine.current?.setEncounter(encounterKey, enabled);
  }, [encounterKey, enabled]);

  function toggle() {
    if (enabled && (phase === "blocked" || phase === "error")) {
      engine.current?.unlock();
      return;
    }
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // The preference still applies for the current mounted battle.
    }
    engine.current?.setEncounter(encounterKey, next);
    if (next) engine.current?.unlock();
  }

  return (
    <BattleMusicButton
      active={active}
      enabled={enabled}
      phase={phase}
      toggle={toggle}
      compact
    />
  );
}
