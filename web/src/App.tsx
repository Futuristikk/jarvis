import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./components/Icon";
import { Login } from "./components/Login";
import { ChatPage } from "./pages/ChatPage";
import { NotesPage } from "./pages/NotesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TasksPage } from "./pages/TasksPage";
import { VoicePage } from "./pages/VoicePage";
import { getToken, onTokenChange } from "./auth";

type PageId = "chat" | "voice" | "tasks" | "notes" | "settings";

const TABS: { id: PageId; label: string; icon: IconName }[] = [
  { id: "chat", label: "Chat", icon: "send" },
  { id: "voice", label: "Sprache", icon: "voice" },
  { id: "tasks", label: "Aufgaben", icon: "calendar" },
  { id: "notes", label: "Notizen", icon: "book" },
  { id: "settings", label: "Einstellungen", icon: "settings" },
];

const PAGES: Record<PageId, ReactNode> = {
  chat: <ChatPage />,
  voice: <VoicePage />,
  tasks: <TasksPage />,
  notes: <NotesPage />,
  settings: <SettingsPage />,
};

export default function App() {
  const [page, setPage] = useState<PageId>("chat");
  const [token, setTokenState] = useState<string | null>(() => getToken());

  useEffect(() => onTokenChange(setTokenState), []);

  if (!token) return <Login />;

  return (
    <div className="app">
      {PAGES[page]}
      <nav className="tabbar" aria-label="Hauptnavigation">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={page === tab.id ? "active" : ""}
            onClick={() => setPage(tab.id)}
            aria-current={page === tab.id ? "page" : undefined}
          >
            <span className="tab-icon">
              <Icon name={tab.icon} size={20} stroke={1.6} />
            </span>
            {tab.label}
            <span className="tab-dot" />
          </button>
        ))}
      </nav>
    </div>
  );
}
