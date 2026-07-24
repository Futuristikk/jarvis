import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./components/Icon";
import { Login } from "./components/Login";
import { ChatPage } from "./pages/ChatPage";
import { VoicePage } from "./pages/VoicePage";
import { SpanishPage } from "./pages/SpanishPage";
import { VaultPage } from "./pages/VaultPage";
import { getToken, onTokenChange } from "./auth";

type PageId = "chat" | "voice" | "spanish" | "vault";

const TABS: { id: PageId; label: string; icon: IconName }[] = [
  { id: "chat", label: "Chat", icon: "book" },
  { id: "voice", label: "Sprache", icon: "voice" },
  { id: "spanish", label: "Spanisch", icon: "headphones" },
  { id: "vault", label: "Notizen", icon: "book" },
];

const PAGES: Record<PageId, ReactNode> = {
  chat: <ChatPage />,
  voice: <VoicePage />,
  spanish: <SpanishPage />,
  vault: <VaultPage />,
};

export default function App() {
  const [page, setPage] = useState<PageId>("chat");
  const [token, setTokenState] = useState<string | null>(() => getToken());

  useEffect(() => onTokenChange(setTokenState), []);

  if (!token) return <Login />;

  return (
    <div className="app">
      {PAGES[page]}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={page === t.id ? "active" : ""}
            onClick={() => setPage(t.id)}
          >
            <span className="tab-icon">
              <Icon name={t.icon} size={20} stroke={1.6} />
            </span>
            {t.label}
            <span className="tab-dot" />
          </button>
        ))}
      </nav>
    </div>
  );
}
