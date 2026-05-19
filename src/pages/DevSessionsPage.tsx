import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SessionRow {
  id: string;
  created_at: string;
  eshop_url: string | null;
  eshop_name: string | null;
  status: string;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });
}

const SESSION_KEY = "dev_sessions_authed";

export default function DevSessionsPage() {
  const [password, setPassword] = useState("");
  const [sessions, setSessions] = useState<SessionRow[] | null>(() => {
    const cached = sessionStorage.getItem(SESSION_KEY);
    return cached ? JSON.parse(cached) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (pw = password) => {
    setLoading(true);
    setError("");
    const { data, error: fnErr } = await supabase.functions.invoke("list-dev-sessions", {
      body: { password: pw },
    });
    setLoading(false);
    if (fnErr || data?.error) {
      const msg = data?.error ?? fnErr?.message ?? "Chyba";
      setError(msg === "Unauthorized" ? "Špatné heslo" : msg);
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data.sessions));
      setSessions(data.sessions);
    }
  };

  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setSessions(null);
    setPassword("");
  };

  const refresh = () => {
    const pw = prompt("Heslo:");
    if (pw !== null) load(pw);
  };

  if (sessions !== null) {
    return (
      <div style={{ padding: 32, fontFamily: "monospace", fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={{ margin: 0 }}>Sessions ({sessions.length})</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={refresh}>Obnovit</button>
            <button onClick={logout}>Odhlásit</button>
          </div>
        </div>
        <table border={1} cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={{ textAlign: "left" }}>Vytvořeno</th>
              <th style={{ textAlign: "left" }}>E-shop URL</th>
              <th style={{ textAlign: "left" }}>Název</th>
              <th style={{ textAlign: "left" }}>Stav</th>
              <th style={{ textAlign: "left" }}>Akce</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fmt(s.created_at)}</td>
                <td>{s.eshop_url || "—"}</td>
                <td>{s.eshop_name || "—"}</td>
                <td>
                  <span style={{
                    background: s.status === "ready" ? "#dcfce7" : s.status === "failed" ? "#fee2e2" : "#fef9c3",
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}>
                    {s.status}
                  </span>
                </td>
                <td>
                  {s.status === "ready"
                    ? <a href={`/results/${s.id}`} target="_blank" rel="noreferrer">Otevřít →</a>
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, fontFamily: "monospace" }}>
      <h1 style={{ marginBottom: 16 }}>Dev: Session list</h1>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !loading && load()}
          placeholder="Heslo"
          style={{ border: "1px solid #ccc", padding: "6px 10px", fontFamily: "monospace" }}
          autoFocus
        />
        <button
          onClick={() => load()}
          disabled={loading}
          style={{ padding: "6px 16px", cursor: loading ? "default" : "pointer" }}
        >
          {loading ? "…" : "Vstoupit"}
        </button>
      </div>
      {error && <p style={{ color: "red", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
