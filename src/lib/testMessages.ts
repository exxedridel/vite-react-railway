export const TEST_MESSAGES_NAMESPACE = "/mensajes-prueba";
export const TEST_MESSAGES_LIMIT = 200;
export const TEST_MESSAGE_MAX_LENGTH = 1000;
export const TEST_MESSAGE_ACCOUNTS = [
  "hevedrios@gmail.com",
  "najerad2223@gmail.com",
] as const;

export type TestMessage = {
  id: string;
  clientMessageId: string;
  from: string;
  to: string;
  text: string;
  sentAt: string;
};

export type TestMessageState = {
  selfEmail: string;
  peerEmail: string;
  peerOnline: boolean;
};

export type TestMessageError = { code: string; message: string };
export type TestMessagePayload = { clientMessageId: string; text: string };
export type TestMessageAck =
  | { ok: true; message: TestMessage }
  | { ok: false; error: TestMessageError };

export interface TestMessagesServerEvents {
  "mensajes:recibir": (message: TestMessage) => void;
  "mensajes:estado": (state: TestMessageState) => void;
  "mensajes:error": (error: TestMessageError | string) => void;
}

export interface TestMessagesClientEvents {
  "mensajes:enviar": (
    payload: TestMessagePayload,
    acknowledge: (response: TestMessageAck) => void,
  ) => void;
}

export function testMessagePeer(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  if (normalized === TEST_MESSAGE_ACCOUNTS[0]) return TEST_MESSAGE_ACCOUNTS[1];
  if (normalized === TEST_MESSAGE_ACCOUNTS[1]) return TEST_MESSAGE_ACCOUNTS[0];
  return null;
}

/** Both variables point at Nest; its HTTP API prefix is not a Socket.IO namespace. */
export function testMessagesUrl(
  websocketUrl?: string,
  servicesUrl?: string,
): string {
  const base = websocketUrl?.trim() || servicesUrl?.trim();
  if (!base)
    throw new Error("Configura VITE_WEBSOCKET_URL con la dirección de Nest.");
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error(
      "La dirección de Nest debe ser una URL HTTP o HTTPS válida.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "La dirección de Nest debe ser una URL HTTP o HTTPS válida.",
    );
  return `${url.origin}${TEST_MESSAGES_NAMESPACE}`;
}

export function isTestMessage(value: unknown): value is TestMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    ["id", "clientMessageId", "from", "to", "text", "sentAt"].every(
      (key) => typeof message[key] === "string" && message[key].length > 0,
    ) &&
    (message.text as string).length <= TEST_MESSAGE_MAX_LENGTH &&
    Number.isFinite(Date.parse(message.sentAt as string))
  );
}

export function appendTestMessage(
  messages: TestMessage[],
  incoming: TestMessage,
): TestMessage[] {
  if (messages.some((message) => message.id === incoming.id)) return messages;
  return [...messages, incoming].slice(-TEST_MESSAGES_LIMIT);
}

export function testMessageErrorText(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && "message" in value) {
    const message = value.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
