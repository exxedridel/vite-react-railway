import { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "@reduxjs/toolkit";
import { jwtDecode } from "jwt-decode";
import { io, type Socket } from "socket.io-client";
import {
  appendTestMessage,
  isChatContact,
  isTestMessage,
  testMessageErrorText,
  testMessagesUrl,
  TEST_MESSAGE_MAX_LENGTH,
  type ChatUser,
  type ChatContact,
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
const ACK_TIMEOUT_MS = 15000;
const SESSION_ERROR_CODES = new Set([
  "TOKEN_REQUIRED",
  "INVALID_TOKEN",
  "TOKEN_EXPIRED",
  "SESSION_REVOKED",
  "ACCOUNT_NOT_FOUND",
]);

export function useTestMessages(user: ChatUser | null | undefined) {
  const selfUserId = user?.id ?? 0;
  const selfEmail = user?.email.trim().toLowerCase() ?? "";
  const [connection, setConnection] =
    useState<TestMessagesConnection>("disconnected");
  const [connectionError, setConnectionError] = useState("");
  const [sendError, setSendError] = useState("");
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [peerUserId, updatePeerUserId] = useState<number | null>(null);
  const [allMessages, setMessages] = useState<TestMessage[]>([]);
  const [draft, updateDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const socketRef = useRef<MessagesSocket | null>(null);
  const pendingRef = useRef<TestMessagePayload | null>(null);
  const draftRef = useRef("");
  const sendingRef = useRef(false);
  const attemptRef = useRef(0);
  const peer = contacts.find((contact) => contact.id === peerUserId) ?? null;

  const setDraft = useCallback((value: string) => {
    draftRef.current = value;
    updateDraft(value);
  }, []);
  useEffect(() => {
    setMessages([]);
    setDraft("");
    setSendError("");
    setContacts([]);
    updatePeerUserId(null);
    pendingRef.current = null;
  }, [selfUserId, setDraft]);

  const acceptMessage = useCallback(
    (value: unknown) => {
      if (
        !isTestMessage(value) ||
        (value.fromUserId !== selfUserId && value.toUserId !== selfUserId)
      )
        return false;
      setMessages((current) => appendTestMessage(current, value));
      const pending = pendingRef.current;
      if (
        value.fromUserId === selfUserId &&
        pending?.clientMessageId === value.clientMessageId &&
        pending.toUserId === value.toUserId &&
        pending.text === value.text
      ) {
        pendingRef.current = null;
        sendingRef.current = false;
        setSending(false);
        setSendError("");
        if (draftRef.current.trim() === pending.text) setDraft("");
      }
      return true;
    },
    [selfUserId, setDraft],
  );

  useEffect(() => {
    if (!selfUserId) return;
    sendingRef.current = false;
    setSending(false);
    let token: string | null;
    let expiresAt: number;
    let endpoint: string;
    try {
      token = localStorage.getItem("bearer_token");
      if (!token)
        throw new Error(
          "Inicia sesión con tu correo para conectar los mensajes.",
        );
      const decoded = jwtDecode<{ exp?: number; id?: number }>(token);
      if (
        typeof decoded.exp !== "number" ||
        !Number.isFinite(decoded.exp) ||
        Number(decoded.id) !== selfUserId
      )
        throw new Error("La sesión no corresponde a esta cuenta.");
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
    socketRef.current = socket;
    setConnection("connecting");
    setConnectionError("");
    let sessionEnded = false;
    const isCurrent = () => socketRef.current === socket;
    function endSession(message: string) {
      if (!isCurrent() || sessionEnded) return;
      sessionEnded = true;
      socket.disconnect();
      attemptRef.current += 1;
      sendingRef.current = false;
      setSending(false);
      setContacts([]);
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
    function updateContacts(values: unknown) {
      if (
        !isCurrent() ||
        !Array.isArray(values) ||
        !values.every(isChatContact)
      )
        return;
      const next = values.filter((contact) => contact.id !== selfUserId);
      setContacts(next);
      updatePeerUserId((current) =>
        next.some((contact) => contact.id === current)
          ? current
          : (next.find((contact) => contact.role === "admin")?.id ??
            next[0]?.id ??
            null),
      );
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
      setContacts((current) =>
        current.map((contact) => ({ ...contact, online: false })),
      );
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
        isCurrent() &&
        (state?.selfUserId !== selfUserId || state.selfEmail !== selfEmail)
      )
        endSession("La conexión no corresponde a tu cuenta autenticada.");
    });
    socket.on("mensajes:contactos", (state) => updateContacts(state?.users));
    socket.on("mensajes:recibir", (message) => {
      if (isCurrent()) acceptMessage(message);
    });
    socket.on("mensajes:error", (error) => {
      if (!isCurrent()) return;
      const message = testMessageErrorText(
        error,
        "No se pudo completar la operación.",
      );
      if (
        typeof error === "object" &&
        error &&
        SESSION_ERROR_CODES.has(error.code)
      )
        endSession(message);
      else setConnectionError(message);
    });
    const reconnectAttempt = () => {
      if (isCurrent()) setConnection("connecting");
    };
    socket.io.on("reconnect_attempt", reconnectAttempt);
    const timer = window.setInterval(checkSession, 1000);
    window.addEventListener("storage", checkSession);
    socket.connect();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", checkSession);
      if (isCurrent()) socketRef.current = null;
      attemptRef.current += 1;
      sendingRef.current = false;
      socket.removeAllListeners();
      socket.io.off("reconnect_attempt", reconnectAttempt);
      socket.disconnect();
    };
  }, [selfUserId, selfEmail, retryVersion, acceptMessage]);

  function refreshContacts() {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket
      .timeout(ACK_TIMEOUT_MS)
      .emit("mensajes:contactos:solicitar", (error: Error | null, response) => {
        if (socketRef.current !== socket) return;
        if (
          error ||
          !response?.ok ||
          !Array.isArray(response.users) ||
          !response.users.every(isChatContact)
        ) {
          setConnectionError(
            error
              ? "No se pudo actualizar la lista de contactos."
              : testMessageErrorText(
                  response && !response.ok ? response.error : null,
                  "No se pudieron actualizar los contactos.",
                ),
          );
          return;
        }
        setConnectionError("");
        setContacts(
          response.users.filter((contact) => contact.id !== selfUserId),
        );
      });
  }
  function selectPeer(value: number) {
    if (sendingRef.current || !contacts.some((contact) => contact.id === value))
      return;
    updatePeerUserId(value);
    pendingRef.current = null;
    setDraft("");
    setSendError("");
  }
  function send() {
    const socket = socketRef.current;
    if (sendingRef.current) return;
    if (!socket?.connected || !peer) {
      setSendError("Conecta y selecciona un destinatario antes de enviar.");
      return;
    }
    const text = draftRef.current.trim();
    if (!text || text.length > TEST_MESSAGE_MAX_LENGTH) {
      setSendError("Escribe un mensaje de entre 1 y 1000 caracteres.");
      return;
    }
    const payload =
      pendingRef.current?.text === text &&
      pendingRef.current.toUserId === peer.id
        ? pendingRef.current
        : {
            clientMessageId: globalThis.crypto?.randomUUID?.() ?? nanoid(),
            text,
            toUserId: peer.id,
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
          if (
            socketRef.current !== socket ||
            attemptRef.current !== attempt ||
            pendingRef.current?.clientMessageId !== payload.clientMessageId
          )
            return;
          sendingRef.current = false;
          setSending(false);
          if (error) {
            setSendError(
              "No llegó la confirmación. Reintenta sin cambiar el texto ni el destinatario.",
            );
            return;
          }
          if (
            response?.ok === true &&
            isTestMessage(response.message) &&
            response.message.clientMessageId === payload.clientMessageId &&
            response.message.fromUserId === selfUserId &&
            response.message.toUserId === payload.toUserId &&
            response.message.text === text &&
            acceptMessage(response.message)
          )
            return;
          setSendError(
            response?.ok === false
              ? testMessageErrorText(response.error, "Nest rechazó el mensaje.")
              : "La confirmación recibida no es válida. Reintenta.",
          );
        },
      );
  }
  return {
    selfEmail,
    selfUserId,
    contacts,
    peerUserId,
    selectPeer,
    refreshContacts,
    peerEmail: peer?.email ?? "",
    peerOnline: !!peer?.online,
    connection,
    connectionError,
    sendError,
    messages: allMessages.filter(
      (message) =>
        (message.fromUserId === selfUserId &&
          message.toUserId === peerUserId) ||
        (message.toUserId === selfUserId && message.fromUserId === peerUserId),
    ),
    draft,
    setDraft,
    sending,
    send,
    retry: () => setRetryVersion((version) => version + 1),
  };
}
