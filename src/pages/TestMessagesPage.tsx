import { useEffect, useRef, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  LogOut,
  MessageCircle,
  RefreshCw,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { useAppContext } from "@/context/AppContext";
import {
  useTestMessages,
  type TestMessagesConnection,
} from "@/hooks/useTestMessages";
import {
  TEST_MESSAGE_MAX_LENGTH,
  TEST_MESSAGES_LIMIT,
} from "@/lib/testMessages";

const connectionLabels: Record<TestMessagesConnection, string> = {
  connecting: "Conectando…",
  connected: "Conectado con Nest",
  disconnected: "Desconectado",
  error: "Error de conexión",
  "session-ended": "Sesión de mensajes cerrada",
};

export default function TestMessagesPage() {
  const { user } = useAppContext();
  const chat = useTestMessages(user);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [chat.messages]);

  const connected = chat.connection === "connected";
  const canSend =
    connected &&
    !!chat.peerUserId &&
    !chat.sending &&
    chat.draft.trim().length > 0 &&
    chat.draft.length <= TEST_MESSAGE_MAX_LENGTH;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSend) chat.send();
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-brand" aria-hidden="true" />
          <h1 className="text-xl font-bold">Mensajes de prueba</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
            </Link>
          </Button>
          <ModeToggle />
          <Button asChild variant="outline" size="icon">
            <Link to="/logout" aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {
        <>
          <section className="space-y-3 rounded-xl border bg-card p-4 text-sm">
            <p className="break-all">
              <span className="font-semibold">Tu cuenta:</span> {chat.selfEmail}
            </p>
            <p className="break-all">
              <span className="font-semibold">Destinatario:</span>{" "}
              {chat.peerEmail || "Selecciona una cuenta registrada"}
            </p>
            <div className="flex flex-wrap gap-2">
              <label htmlFor="message-recipient" className="sr-only">
                Destinatario del mensaje
              </label>
              <select
                id="message-recipient"
                value={chat.peerUserId ?? ""}
                onChange={(event) =>
                  chat.selectPeer(Number(event.target.value))
                }
                disabled={!connected || chat.sending}
                className="min-h-11 min-w-0 flex-1 rounded-md border bg-background px-3"
              >
                <option value="" disabled>
                  {chat.contacts.length
                    ? "Selecciona un usuario"
                    : "Sin otros usuarios disponibles"}
                </option>
                {chat.contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.first_name} · {contact.email}
                    {contact.online ? " · conectado" : ""}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                disabled={!connected || chat.sending}
                onClick={chat.refreshContacts}
              >
                Actualizar contactos
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div aria-live="polite" className="space-y-1">
                <p className="font-medium">
                  {connectionLabels[chat.connection]}
                </p>
                <p className="text-muted-foreground">
                  {connected
                    ? chat.peerOnline
                      ? "Destinatario conectado"
                      : "Destinatario desconectado"
                    : "Estado del destinatario no disponible"}
                </p>
              </div>
              {!connected && (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={chat.retry}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />{" "}
                  Reintentar conexión
                </Button>
              )}
            </div>
            {chat.connectionError && (
              <p role="alert" className="text-destructive">
                {chat.connectionError}
              </p>
            )}
          </section>

          <p className="text-sm text-muted-foreground">
            Sin historial persistente. Esta página muestra hasta{" "}
            {TEST_MESSAGES_LIMIT} mensajes y se vacía al salir o recargar. El
            destinatario debe estar conectado para recibirlos. La confirmación
            indica que Nest aceptó el envío.
          </p>
          <section
            role="log"
            aria-label="Conversación de prueba"
            aria-live="polite"
            aria-relevant="additions"
            className="h-[45dvh] min-h-[240px] space-y-3 overflow-y-auto overscroll-contain rounded-xl border bg-muted/20 p-4"
          >
            {chat.messages.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">
                Aún no hay mensajes en esta página.
              </p>
            )}
            {chat.messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-[95%] rounded-xl border p-3 text-sm sm:max-w-[85%] ${message.from === chat.selfEmail ? "ml-auto bg-brand/10" : "mr-auto bg-card"}`}
              >
                <p className="break-all text-xs font-semibold">
                  {message.fromUserId === chat.selfUserId ? "Tú" : message.from}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {message.text}
                </p>
                <time
                  dateTime={message.sentAt}
                  className="mt-2 block text-xs text-muted-foreground"
                >
                  {new Date(message.sentAt).toLocaleTimeString("es-MX", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
              </article>
            ))}
            <div ref={endRef} />
          </section>

          <form onSubmit={submit} className="space-y-2">
            <label htmlFor="test-message" className="text-sm font-semibold">
              Mensaje
            </label>
            <Textarea
              id="test-message"
              value={chat.draft}
              onChange={(event) => chat.setDraft(event.target.value)}
              maxLength={TEST_MESSAGE_MAX_LENGTH}
              rows={3}
              placeholder="Escribe un mensaje para la otra cuenta"
              aria-describedby="test-message-help"
            />
            <div className="flex items-center justify-between gap-3">
              <p
                id="test-message-help"
                className="text-xs text-muted-foreground"
              >
                {chat.draft.length}/{TEST_MESSAGE_MAX_LENGTH} caracteres
              </p>
              <Button type="submit" disabled={!canSend} className="gap-2">
                <Send className="h-4 w-4" aria-hidden="true" />{" "}
                {chat.sending ? "Confirmando…" : "Enviar"}
              </Button>
            </div>
            {chat.sendError && (
              <p role="alert" className="text-sm text-destructive">
                {chat.sendError}
              </p>
            )}
          </form>
        </>
      }
    </main>
  );
}
