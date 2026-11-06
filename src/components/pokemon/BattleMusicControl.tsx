import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBattleMusic } from "@/context/BattleMusicContext";
import type { MusicPhase } from "@/lib/battleMusic";

export function BattleMusicButton({
  active,
  enabled,
  phase,
  toggle,
  compact = false,
}: {
  active: boolean;
  enabled: boolean;
  phase: MusicPhase;
  toggle: () => void;
  compact?: boolean;
}) {
  if (!active) return null;
  const label = !enabled
    ? "Activar música"
    : phase === "blocked"
      ? "Activar música"
      : phase === "error"
        ? "Reintentar música"
        : "Silenciar música";
  const Icon = phase === "loading" ? Loader2 : enabled ? Volume2 : VolumeX;
  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "icon" : "sm"}
      onClick={toggle}
      aria-label={label}
      title={label}
      className={compact ? "h-11 w-11 shrink-0 rounded-full" : "gap-2"}
    >
      <Icon
        className={`h-4 w-4 ${phase === "loading" ? "animate-spin" : ""}`}
      />
      {!compact && <span>{label}</span>}
    </Button>
  );
}

export default function BattleMusicControl({
  compact = false,
}: {
  compact?: boolean;
}) {
  const music = useBattleMusic();
  return <BattleMusicButton {...music} compact={compact} />;
}
