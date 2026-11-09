import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "@reduxjs/toolkit";
import { jwtDecode } from "jwt-decode";
import { io, type Socket } from "socket.io-client";
import {
  appendTestMessage,
  isTestMessage,
  testMessageErrorText,
  testMessagePeer,
  testMessagesUrl,
  TEST_MESSAGE_MAX_LENGTH,
  type TestMessage,
  type TestMessageAck,
  type TestMessagePayload,
  type TestMessagesClientEvents,
  type TestMessagesServerEvents,
} from "@/lib/testMessages";

type MessagesSocket = Socket<
  TestMessagesServerEvents,
  TestMessagesClientEvents
>;
export type TestMessagesConnection =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"
  | "session-ended";
const ACK_TIMEOUT_MS = 8000;
const SESSION_ERROR_CODES = new Set([
  "TOKEN_REQUIRED",
  "INVALID_TOKEN",
  "TOKEN_EXPIRED",
  "ACCOUNT_NOT_ALLOWED",
]);

export function useTestMessages(email: string | undefined) {
  const selfEmail = email?.trim().toLowerCase() ?? "";
  const peerEmail = testMessagePeer(selfEmail);
  const [connection, setConnection] =
    useState<TestMessagesConnection>("disconnected");
  const [connectionError, setConnectionError] = useState("");
  const [sendError, setSendError] = useState("");
  const [peerOnline, setPeerOnline] = useState(false);
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [draft, updateDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const socketRef = useRef<MessagesSocket | null>(null);
  const pendingRef = useRef<TestMessagePayload | null>(null);
  const draftRef = useRef("");
  const sendingRef = useRef(false);
  const attemptRef = useRef(0);

  const setDraft = useCallback((value: string) => {
    draftRef.current = value;
    updateDraft(value);
  }, []);

  useEffect(() => {
    setMessages([]);
    setDraft("");
    setSendError("");
    pendingRef.current = null;
  }, [selfEmail, setDraft]);

  const acceptMessage = useCallback(
    (message: unknown) => {
      if (!isTestMessage(message) || !peerEmail) return false;
      if (
        !(
          (message.from === selfEmail && message.to === peerEmail) ||
          (message.from === peerEmail && message.to === selfEmail)
        )
      )
        return false;
      setMessages((current) => appendTestMessage(current, message));
      const pending = pendingRef.current;
      if (
        message.from === selfEmail &&
        pending?.clientMessageId === message.clientMessageId &&
        pending.text === message.text
      ) {
        pendingRef.current = null;
        sendingRef.current = false;
        setSending(false);
        setSendError("");
        if (draftRef.current.trim() === pending.text) setDraft("");
      }
      return true;
    },
    [selfEmail, peerEmail, setDraft],
  );

  useEffect(() => {
    if (!peerEmail) return;
    sendingRef.current = false;
    setSending(false);
    setPeerOnline(false);
    let token: string | null;
    let expiresAt: number;
    let endpoint: string;
    try {
      token = localStorage.getItem("bearer_token");
      if (!token) throw new Error("Inicia sesión para conectar los mensajes.");
      const decoded = jwtDecode<{ exp?: number }>(token);
      if (typeof decoded.exp !== "number" || !Number.isFinite(decoded.exp))
        throw new Error("La sesión no tiene una fecha de expiración válida.");
      expiresAt = decoded.exp * 1000;
      if (expiresAt <= Date.now())
        throw new Error("La sesión expiró. Vuelve a iniciar sesión.");
      endpoint = testMessagesUrl(
        import.meta.env.VITE_WEBSOCKET_URL,
        import.meta.env.VITE_BASE_SERVICES,
      );
    } catch (error) {
      setConnection("error");
      setConnectionError(testMessageErrorText(error, "No se pudo conectar."));
      return;
    }

    const socket: MessagesSocket = io(endpoint, {
      auth: { token },
      autoConnect: false,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      timeout: ACK_TIMEOUT_MS,
    });
    let sessionEnded = false;
    socketRef.current = socket;
    setConnection("connecting");
    setConnectionError("");
    setPeerOnline(false);
    sendingRef.current = false;
    setSending(false);
    const isCurrent = () => socketRef.current === socket;

    function endSession(message: string) {
      if (!isCurrent() || sessionEnded) return;
      sessionEnded = true;
      socket.disconnect();
      attemptRef.current += 1;
      sendingRef.current = false;
      setSending(false);
      setPeerOnline(false);
      setConnection("session-ended");
      setConnectionError(message);
    }
    function checkSession() {
      if (!isCurrent() || sessionEnded) return;
      try {
        if (localStorage.getItem("bearer_token") !== token)
          endSession(
            "La sesión cambió. Vuelve a iniciar sesión para conectar.",
          );
        else if (Date.now() >= expiresAt)
          endSession("La sesión expiró. Vuelve a iniciar sesión.");
      } catch {
        endSession("No se pudo comprobar la sesión del navegador.");
      }
    }
    socket.on("connect", () => {
      if (!isCurrent()) return;
      checkSession();
      if (!socket.connected) return;
      setConnection("connected");
      setConnectionError("");
    });
    socket.on("disconnect", () => {
      if (!isCurrent()) return;
      attemptRef.current += 1;
      sendingRef.current = false;
      setSending(false);
      setPeerOnline(false);
      setConnection("disconnected");
      if (pendingRef.current)
        setSendError(
          "Se perdió la conexión. Reintenta para confirmar el envío.",
        );
    });
    socket.on("connect_error", (error) => {
      if (!isCurrent()) return;
      const code = (error as Error & { data?: { code?: string } }).data?.code;
      const message = testMessageErrorText(
        error,
        "No se pudo conectar con Nest.",
      );
      if (code && SESSION_ERROR_CODES.has(code)) endSession(message);
      else {
        setConnection("error");
        setConnectionError(message);
      }
    });
    socket.on("mensajes:estado", (state) => {
      if (
        !isCurrent() ||
        state?.selfEmail !== selfEmail ||
        state.peerEmail !== peerEmail ||
        typeof state.peerOnline !== "boolean"
      )
        return;
      setPeerOnline(state.peerOnline);
    });
    socket.on("mensajes:recibir", (message) => {
      if (isCurrent()) acceptMessage(message);
    });
    socket.on("mensajes:error", (error) => {
      endSession(testMessageErrorText(error, "La sesión de mensajes terminó."));
    });
    const reconnectAttempt = () => {
      if (isCurrent()) setConnection("connecting");
    };
    socket.io.on("reconnect_attempt", reconnectAttempt);
    const sessionTimer = window.setInterval(checkSession, 1000);
    window.addEventListener("storage", checkSession);
    socket.connect();

    return () => {
      window.clearInterval(sessionTimer);
      window.removeEventListener("storage", checkSession);
      if (isCurrent()) socketRef.current = null;
      attemptRef.current += 1;
      sendingRef.current = false;
      socket.removeAllListeners();
      socket.io.off("reconnect_attempt", reconnectAttempt);
      socket.disconnect();
    };
  }, [selfEmail, peerEmail, retryVersion, acceptMessage]);

  function send() {
    const socket = socketRef.current;
    if (sendingRef.current) return;
    if (!socket?.connected) {
      setSendError("Conecta con Nest antes de enviar.");
      return;
    }
    const text = draftRef.current.trim();
    if (!text || text.length > TEST_MESSAGE_MAX_LENGTH) {
      setSendError("Escribe un mensaje de entre 1 y 1000 caracteres.");
      return;
    }
    const payload =
      pendingRef.current?.text === text
        ? pendingRef.current
        : {
            clientMessageId: globalThis.crypto?.randomUUID?.() ?? nanoid(),
            text,
          };
    pendingRef.current = payload;
    sendingRef.current = true;
    setSending(true);
    setSendError("");
    const attempt = ++attemptRef.current;
    socket
      .timeout(ACK_TIMEOUT_MS)
      .emit(
        "mensajes:enviar",
        payload,
        (error: Error | null, response: TestMessageAck | undefined) => {
          if (socketRef.current !== socket || attemptRef.current !== attempt)
            return;
          // The broadcast may have already confirmed the same message before its ACK.
          if (pendingRef.current?.clientMessageId !== payload.clientMessageId)
            return;
          sendingRef.current = false;
          setSending(false);
          if (error) {
            setSendError(
              "No llegó la confirmación. Reintenta sin cambiar el texto; se usará el mismo identificador.",
            );
            return;
          }
          if (
            response?.ok === true &&
            isTestMessage(response.message) &&
            response.message.clientMessageId === payload.clientMessageId &&
            response.message.from === selfEmail &&
            response.message.to === peerEmail &&
            response.message.text === text &&
            acceptMessage(response.message)
          )
            return;
          setSendError(
            response?.ok === false
              ? testMessageErrorText(response.error, "Nest rechazó el mensaje.")
              : "La confirmación recibida no es válida. Reintenta el envío.",
          );
        },
      );
  }

  return {
    selfEmail,
    peerEmail,
    connection,
    connectionError,
    sendError,
    peerOnline,
    messages,
    draft,
    setDraft,
    sending,
    send,
    retry: () => setRetryVersion((version) => version + 1),
  };
}
