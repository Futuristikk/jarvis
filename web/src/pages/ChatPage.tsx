import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendChat, type ChatMessage } from "../api";

const WELCOME: ChatMessage = {
  role: "assistant",
  content: "Hallo. Ich bin Jarvis. Wie kann ich dir helfen?",
};

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;

    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    setSending(true);
    setError(null);

    try {
      const { reply } = await sendChat(next.slice(-20));
      setMessages((current) => [
        ...current,
        { role: "assistant", content: reply },
      ]);
    } catch {
      setError("Jarvis ist gerade nicht erreichbar. Bitte versuche es erneut.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page page-enter">
      <div className="topbar">
        <div className="topbar-title">
          <span className="dot" />
          Jarvis
        </div>
        <span className="chat-status">Deutsch · bereit</span>
      </div>

      <div className="chat-messages" aria-live="polite">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`turn ${message.role === "user" ? "user" : "agent"}`}
          >
            <div className="turn-meta">
              {message.role === "user" ? "Du" : "Jarvis"}
            </div>
            <div className="turn-text">{message.content}</div>
          </div>
        ))}
        {sending && (
          <div className="turn agent">
            <div className="turn-meta">Jarvis</div>
            <div className="turn-text chat-thinking">denkt nach…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && <div className="chat-error">{error}</div>}

      <form className="chat-composer" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Schreib Jarvis eine Nachricht…"
          aria-label="Nachricht an Jarvis"
          rows={1}
          maxLength={4_000}
        />
        <button type="submit" disabled={!draft.trim() || sending}>
          Senden
        </button>
      </form>
    </div>
  );
}
