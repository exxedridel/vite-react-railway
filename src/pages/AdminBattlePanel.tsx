import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import PvpBattlePanel from "@/components/admin/PvpBattlePanel";
import { usePvpContext } from "@/context/PvpContext";

export default function AdminBattlePanel() {
  const pvp = usePvpContext();
  const [mode, setMode] = useState<"pvp" | "trainer">("pvp");
  const reserved =
    !!pvp.state && !["finalized", "cancelled"].includes(pvp.state.phase);
  const selectedMode = reserved
    ? pvp.state?.mode === "trainer"
      ? "trainer"
      : "pvp"
    : mode;
  useEffect(() => {
    if (reserved) setMode(pvp.state?.mode === "trainer" ? "trainer" : "pvp");
  }, [reserved, pvp.state?.mode]);
  return (
    <div>
      <nav
        aria-label="Modo de batalla"
        className="mx-auto flex max-w-7xl flex-wrap gap-2 border-b px-3 py-3 sm:px-6"
      >
        <Button
          variant={selectedMode === "pvp" ? "default" : "outline"}
          disabled={reserved && selectedMode !== "pvp"}
          onClick={() => setMode("pvp")}
        >
          Jugadores conectados · PvP
        </Button>
        <Button
          variant={selectedMode === "trainer" ? "default" : "outline"}
          disabled={reserved && selectedMode !== "trainer"}
          onClick={() => setMode("trainer")}
        >
          Trainer Battle
        </Button>
      </nav>
      <main className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-6">
        <PvpBattlePanel mode={selectedMode} />
      </main>
    </div>
  );
}
