import { useEffect } from "react";
import { useAppContext } from "@/context/AppContext";
import { useAppSelector } from "@/store/hooks";
import { getPvpLock } from "@/lib/pvpParty";

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

const IdleTimer = ({ children }) => {
  const { logout, setIsIdle } = useAppContext();
  const reserved = useAppSelector((state) => !!getPvpLock(state.party));

  useEffect(() => {
    // Players watch while the administrator acts; watching a reserved battle is active use.
    if (reserved) return;
    let timer;
    let lastActivity = Date.now();
    let closing = false;
    setIsIdle(false);

    function checkIdle() {
      window.clearTimeout(timer);
      if (closing) return;
      const remaining = IDLE_TIMEOUT_MS - (Date.now() - lastActivity);
      if (remaining <= 0) {
        closing = true;
        setIsIdle(true);
        void logout();
      } else {
        timer = window.setTimeout(checkIdle, remaining);
      }
    }

    function activity() {
      if (closing) return;
      // Background tabs may delay timers: a late touch must not renew an expired session.
      if (Date.now() - lastActivity >= IDLE_TIMEOUT_MS) {
        checkIdle();
        return;
      }
      lastActivity = Date.now();
      checkIdle();
    }

    function visibilityChanged() {
      if (document.visibilityState === "visible") checkIdle();
    }

    const events = [
      "pointerdown",
      "pointermove",
      "keydown",
      "input",
      "wheel",
      "touchstart",
    ];
    events.forEach((event) =>
      document.addEventListener(event, activity, { passive: true }),
    );
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("focus", checkIdle);
    checkIdle();

    return () => {
      events.forEach((event) => document.removeEventListener(event, activity));
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("focus", checkIdle);
      window.clearTimeout(timer);
    };
  }, [logout, setIsIdle, reserved]);

  return <div>{children}</div>;
};
export default IdleTimer;
