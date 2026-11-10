export const TEST_MESSAGES_NAMESPACE = "/mensajes-prueba";
export const TEST_MESSAGES_LIMIT = 200;
export const TEST_MESSAGE_MAX_LENGTH = 1000;

export type ChatUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: "admin" | "player";
};
export type ChatContact = ChatUser & { online: boolean };
export type TestMessage = {
  id: string;
  clientMessageId: string;
  fromUserId: number;
  toUserId: number;
  from: string;
  to: string;
  text: string;
  sentAt: string;
};
export type TestMessageState = { selfEmail: string; selfUserId: number };
export type TestMessageError = { code: string; message: string };
export type TestMessagePayload = {
  clientMessageId: string;
  text: string;
  toUserId: number;
};
export type TestMessageAck =
  | { ok: true; message: TestMessage }
  | { ok: false; error: TestMessageError };
export type ContactsAck =
  | { ok: true; users: ChatContact[] }
  | { ok: false; error: TestMessageError };
export interface TestMessagesServerEvents {
  "mensajes:recibir": (message: TestMessage) => void;
  "mensajes:estado": (state: TestMessageState) => void;
  "mensajes:contactos": (state: { users: ChatContact[] }) => void;
  "mensajes:error": (error: TestMessageError | string) => void;
}
export interface TestMessagesClientEvents {
  "mensajes:enviar": (
    payload: TestMessagePayload,
    acknowledge: (response: TestMessageAck) => void,
  ) => void;
  "mensajes:contactos:solicitar": (
    acknowledge: (response: ContactsAck) => void,
  ) => void;
}

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

export function isChatContact(value: unknown): value is ChatContact {
  if (!value || typeof value !== "object") return false;
  const user = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(user.id) &&
    Number(user.id) > 0 &&
    ["email", "first_name", "last_name"].every(
      (key) => typeof user[key] === "string",
    ) &&
    (user.role === "admin" || user.role === "player") &&
    typeof user.online === "boolean"
  );
}
export function isTestMessage(value: unknown): value is TestMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    ["id", "clientMessageId", "from", "to", "text", "sentAt"].every(
      (key) => typeof message[key] === "string" && message[key].length > 0,
    ) &&
    [message.fromUserId, message.toUserId].every(
      (id) => Number.isSafeInteger(id) && Number(id) > 0,
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
  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string" &&
    value.message.trim()
  )
    return value.message;
  return fallback;
}
