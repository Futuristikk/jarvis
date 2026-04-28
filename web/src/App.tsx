import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "./components/Icon";
import { VoicePage } from "./pages/VoicePage";
import { SpanishPage } from "./pages/SpanishPage";
import { VaultPage } from "./pages/VaultPage";

type PageId = "voice" | "spanish" | "vault";

const TABS: { id: PageId; label: string; icon: IconName }[] = [
  { id: "voice", label: "Voice", icon: "voice" },
  { id: "spanish", label: "Spanish", icon: "headphones" },
  { id: "vault", label: "Vault", icon: "book" },
];

const PAGES: Record<PageId, ReactNode> = {
  voice: <VoicePage />,
  spanish: <SpanishPage />,
  vault: <VaultPage />,
};

export default function App() {
  const [page, setPage] = useState<PageId>("voice");

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
