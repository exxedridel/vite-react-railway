import React, { useEffect } from "react";
import { useAppContext } from "@/context/AppContext";

const IdleTimer = ({ children }) => {
  const { logout, navigate, isIdle, setIsIdle } = useAppContext();

  const idleTimeout = 5 * 60 * 1000;
  let timer;
  let resetEvents = [];

  const resetTimer = () => {
    clearTimeout(timer);
    startIdleTimer();
  };

  const handleIdle = async () => {
    setIsIdle(true);
    try {
      const bearer_token = localStorage.getItem("bearer_token");
      await logout(bearer_token);
      localStorage.removeItem("bearer_token");
      localStorage.removeItem("usuario");
      navigate("/");
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const startIdleTimer = () => {
    timer = setTimeout(handleIdle, idleTimeout);
  };

  useEffect(() => {
    if (isIdle) {
      setIsIdle(false);
    }
    startIdleTimer();

    const events = ["mousemove", "keydown"];
    resetEvents = events.map((event) => {
      const eventHandler = () => {
        resetTimer();
      };
      document.addEventListener(event, eventHandler);
      return { event, eventHandler };
    });

    return () => {
      resetEvents.forEach(({ event, eventHandler }) => {
        document.removeEventListener(event, eventHandler);
      });
      clearTimeout(timer);
    };
  }, []);

  return <div>{children}</div>;
};

export default IdleTimer;
