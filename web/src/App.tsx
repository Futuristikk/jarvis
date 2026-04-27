import { useEffect, useState } from "react";
import { getHealth } from "./api";

export default function App() {
  const [status, setStatus] = useState<string>("checking…");

  useEffect(() => {
    getHealth()
      .then((r) => setStatus(r.ok ? `up — ${r.service}` : "down"))
      .catch((e) => setStatus(`error: ${e.message}`));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>Jarvis</h1>
      <p>backend: {status}</p>
    </main>
  );
}
