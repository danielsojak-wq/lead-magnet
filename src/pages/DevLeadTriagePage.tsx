import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
// SINGLE SOURCE OF TRUTH — stejný soubor importuje i lm-lead-triage-scan.
// Žádná z těchto hodnot nesmí být v UI hardcoded.
import { DAY_CHECKPOINT, ICP_CRITERIA } from "../../supabase/functions/_shared/lm-triage-config";

// ── Design tokeny (varianta 6a) ──────────────────────────────────────────────
const C = {
  page: "#eceae6", card: "#f7f8fa", white: "#fff", ink: "#111827", ink2: "#1f2937",
  muted: "#6b7280", muted2: "#9ca3af", muted3: "#9aa2b1", blue: "#2f6bff",
  blueBg: "#eaf0ff", green: "#16a34a", track: "#eef1f5", border: "#e5e7eb",
  detailBg: "#fafbfc", grey: "#d1d5db",
};
const SANS = "'IBM Plex Sans',system-ui,sans-serif";
const MONO = "'IBM Plex Mono',monospace";
// Barvy teček u quick winů — jediný akcent brand barev v designu.
const DOT = ["#7c5cff", "#2f6bff", "#e8791a"];

const SHADOW_CARD = "0 1px 2px rgba(16,24,40,.04)";
const SHADOW_SUB = "0 1px 3px rgba(16,24,40,.06)";

interface QuickWin { akce: string; proc: string }
interface Lead {
  id: string;
  email: string;
  domain: string | null;
  session_id: string | null;
  checkpoint_reached_at: string | null;
  icp_fit: boolean | null;
  draft_message: string | null;
  status: string;
  quick_wins: QuickWin[];
  competitors: string[];
  analysis_url: string | null;
}
interface Funnel {
  total: number;
  email_pending: number;
  analyza_ok: number;
  no_ads: number;
  failed_other: number;
  in_progress: number;
}
interface DayBucket {
  date: string;
  analyza_ok: number;
  no_ads: number;
  email_pending: number;
  other: number;
}
interface TriageData {
  config: { day_checkpoint: number; icp_criteria: string };
  counts: { needs_review: number; moved_to_manual: number };
  funnel?: Funnel;
  daily?: DayBucket[];
  leads: Lead[];
}

const dateCz = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }) : "—";

export default function DevLeadTriagePage() {
  const [password, setPassword] = useState("");
  const [pw, setPw] = useState<string | null>(null);   // uložené heslo pro další akce (jen v paměti)
  const [data, setData] = useState<TriageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  // Fonty z designu (IBM Plex) — načti jednou.
  useEffect(() => {
    const id = "lead-triage-fonts";
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id;
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap";
    document.head.appendChild(l);
  }, []);

  // supabase.functions.invoke při non-2xx NEDÁ tělo do `data` — hodí FunctionsHttpError
  // a odpověď schová do `err.context` (Response). Bez tohohle vytažení se každá serverová
  // hláška ("Unauthorized", "AI odpověď useknutá" apod.) zobrazí
  // jako neužitečné "Edge Function returned a non-2xx status code".
  const invoke = async (fn: string, body: Record<string, unknown>) => {
    const { data: res, error: err } = await supabase.functions.invoke(fn, { body });
    if (err || (res as any)?.error) {
      let msg = (res as any)?.error ?? err?.message ?? "Chyba";
      const ctx = (err as unknown as { context?: unknown })?.context;
      if (ctx instanceof Response) {
        const parsed = await ctx.clone().json().catch(() => null);
        if (parsed?.error) msg = parsed.error;
      }
      throw new Error(msg === "Unauthorized" ? "Špatné heslo" : String(msg));
    }
    return res as any;
  };

  const call = (fn: string, body: Record<string, unknown>) =>
    invoke(fn, { password: pw ?? password, ...body });

  const load = async (usePw?: string) => {
    setLoading(true); setError("");
    try {
      const res = await invoke("lm-lead-triage-data", { password: usePw ?? pw ?? password, action: "list" });
      setPw(usePw ?? pw ?? password);
      setData(res as TriageData);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const runScan = async () => {
    setBusy("scan"); setNote(""); setError("");
    try {
      const r = await call("lm-lead-triage-scan", {});
      // `unknown` = není v Ecomail sekvenci → o otevřeních nevíme nic, vědomě nehodnotíme.
      setNote(
        `Scan: ${r.scanned} prošlo · ${r.engaged} otevřelo · ${r.unsubscribed} odhlášeno · ` +
        `${r.unknown} mimo sekvenci (nehodnoceno) · ${r.already_in_triage} už v triage · ${r.created} nových`
      );
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  const genDraft = async (id: string) => {
    setBusy(`draft:${id}`); setNote(""); setError("");
    try {
      const r = await call("lm-generate-draft", { id });
      setDrafts(d => ({ ...d, [id]: r.draft_message }));
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  const reject = async (id: string) => {
    setBusy(`reject:${id}`); setNote(""); setError("");
    try {
      await call("lm-lead-triage-data", { action: "skip", id });
      setNote("Lead odmítnut — zmizel z dashboardu.");
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  const saveDraft = async (id: string) => {
    setBusy(`save:${id}`); setError("");
    try {
      await call("lm-lead-triage-data", { action: "update", id, draft_message: drafts[id] ?? "" });
      setNote("Draft uložen.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  const move = async (id: string) => {
    setBusy(`move:${id}`); setNote(""); setError("");
    try {
      const r = await call("lm-move-to-manual", { id });
      setNote(`Přesunuto. Ecomail tag: ${r.ecomail_tagged ? "ok" : "ne — " + (r.ecomail_detail ?? "")} · Make: ${r.make_posted ? "ok" : (r.make_detail ?? "skip")}`);
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  // ── Login gate (stejná konvence jako /dev/sessions) ────────────────────────
  if (!data) {
    return (
      <div style={{ minHeight: "100vh", background: C.page, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS }}>
        <div style={{ background: C.card, borderRadius: 20, boxShadow: SHADOW_CARD, padding: 30, width: 360 }}>
          <span style={{ font: `600 11px ${MONO}`, background: C.blue, color: "#fff", padding: "5px 10px", borderRadius: 20 }}>/dev/lead-triage</span>
          <h1 style={{ margin: "14px 0 6px", font: `700 21px ${SANS}`, color: C.ink, letterSpacing: "-.02em" }}>Lead triage</h1>
          <p style={{ margin: "0 0 16px", font: `400 13px/1.6 ${SANS}`, color: C.muted }}>Interní nástroj. Zadej heslo.</p>
          <input
            type="password" value={password} autoFocus
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(password)}
            placeholder="Heslo"
            style={{ width: "100%", padding: "10px 13px", borderRadius: 12, border: `1px solid ${C.border}`, font: `400 13px ${SANS}`, outline: "none", background: "#fff" }}
          />
          <button onClick={() => load(password)} disabled={loading}
            style={{ marginTop: 12, width: "100%", border: "none", cursor: "pointer", background: C.blue, color: "#fff", font: `600 13px ${SANS}`, padding: "11px 17px", borderRadius: 999 }}>
            {loading ? "Načítám…" : "Vstoupit"}
          </button>
          {error && <p style={{ marginTop: 10, font: `500 12px ${SANS}`, color: "#dc2626" }}>{error}</p>}
        </div>
      </div>
    );
  }

  const { counts, leads } = data;
  const total = counts.needs_review + counts.moved_to_manual;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);

  return (
    <div style={{ minHeight: "100vh", background: C.page, padding: "44px 48px", display: "flex", justifyContent: "center", fontFamily: SANS }}>
      <div style={{ width: 880, maxWidth: "100%", background: C.card, borderRadius: 20, boxShadow: SHADOW_CARD }}>

        {/* Header + scoring */}
        <div style={{ padding: "30px 34px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ font: `600 11px ${MONO}`, background: C.blue, color: "#fff", padding: "5px 10px", borderRadius: 20 }}>/dev/lead-triage</span>
            <h1 style={{ margin: 0, font: `700 21px ${SANS}`, color: C.ink, letterSpacing: "-.02em" }}>Lead triage</h1>
            <button onClick={runScan} disabled={!!busy}
              style={{ marginLeft: "auto", border: "none", cursor: busy ? "wait" : "pointer", background: C.blue, color: "#fff", font: `600 12.5px ${SANS}`, padding: "9px 15px", borderRadius: 999, opacity: busy ? .6 : 1 }}>
              {busy === "scan" ? "Skenuji…" : "Aktualizovat data"}
            </button>
          </div>
          <p style={{ margin: "9px 0 0", font: `400 14px/1.6 ${SANS}`, color: C.muted, maxWidth: "60ch" }}>
            Ruční průchod leadů, kterým e-mail jako nurturing kanál nefunguje. Rozhodni o přesunu na manuální outreach.
          </p>

          {data.funnel && (() => {
            const f = data.funnel;
            const tot = f.total || 1;
            const seg = [
              { key: "ok",    val: f.analyza_ok,   label: "Analýza OK",          sub: "plný nurturing",   color: C.green },
              { key: "noads", val: f.no_ads,       label: "Bez reklam",          sub: "no-ads sekvence",  color: "#e8791a" },
              { key: "pend",  val: f.email_pending,label: "Nepotvrzený e-mail",  sub: "není v Ecomailu",  color: "#dc2626" },
              { key: "other", val: f.failed_other + f.in_progress, label: "Selhalo / rozpracováno", sub: "není v Ecomailu", color: C.grey },
            ];
            return (
              <div style={{ marginTop: 18, background: C.white, borderRadius: 16, boxShadow: SHADOW_SUB, padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ font: `700 15px ${SANS}`, color: C.ink }}>Leady z magnetu</span>
                  <span style={{ font: `700 15px ${SANS}`, color: C.ink }}>{f.total}</span>
                  <span style={{ marginLeft: "auto", font: `500 12px ${SANS}`, color: C.muted }}>
                    {Math.round(((f.total - f.email_pending) / tot) * 100)} % potvrdilo e-mail
                  </span>
                </div>
                <div style={{ display: "flex", height: 10, marginTop: 12, borderRadius: 20, overflow: "hidden", background: C.track }}>
                  {seg.map(s => s.val > 0 && <div key={s.key} style={{ width: `${(s.val / tot) * 100}%`, background: s.color }} />)}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 14 }}>
                  {seg.map(s => (
                    <div key={s.key}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
                        <span style={{ font: `700 19px ${SANS}`, color: C.ink }}>{s.val}</span>
                      </div>
                      <div style={{ font: `600 11.5px ${SANS}`, color: C.ink2, marginTop: 2 }}>{s.label}</div>
                      <div style={{ font: `400 10.5px ${SANS}`, color: C.muted2 }}>{s.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {data.daily && data.daily.length > 0 && (() => {
            const days = data.daily;
            const totalOf = (d: DayBucket) => d.analyza_ok + d.no_ads + d.email_pending + d.other;
            const max = Math.max(1, ...days.map(totalOf));
            const sum = days.reduce((a, d) => a + totalOf(d), 0);
            const keys = ["analyza_ok", "no_ads", "email_pending", "other"] as const;
            const col: Record<typeof keys[number], string> = {
              analyza_ok: C.green, no_ads: "#e8791a", email_pending: "#dc2626", other: C.grey,
            };
            const H = 96;
            return (
              <div style={{ marginTop: 12, background: C.white, borderRadius: 16, boxShadow: SHADOW_SUB, padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ font: `700 15px ${SANS}`, color: C.ink }}>Leady po dnech</span>
                  <span style={{ font: `500 12px ${SANS}`, color: C.muted2 }}>posledních 30 dní</span>
                  <span style={{ marginLeft: "auto", font: `500 12px ${SANS}`, color: C.muted }}>{sum} celkem · barvy jako výše</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: H, marginTop: 14 }}>
                  {days.map(d => {
                    const t = totalOf(d);
                    return (
                      <div key={d.date} title={`${d.date}: ${t} leadů`}
                        style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                        <div style={{ display: "flex", flexDirection: "column-reverse", borderRadius: "3px 3px 0 0", overflow: "hidden" }}>
                          {keys.map(k => d[k] > 0 && (
                            <div key={k} style={{ height: `${(d[k] / max) * H}px`, background: col[k] }} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
                  {days.map((d, i) => (
                    <div key={d.date} style={{ flex: 1, textAlign: "center", font: `400 9px ${MONO}`, color: C.muted2 }}>
                      {i % 5 === 0 ? d.date.slice(5).replace("-", "/") : ""}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ background: C.white, borderRadius: 16, boxShadow: SHADOW_SUB, padding: "15px 18px" }}>
              <div style={{ font: `600 10px ${SANS}`, letterSpacing: ".04em", textTransform: "uppercase", color: C.muted3 }}>ICP kritérium</div>
              <div style={{ marginTop: 6, font: `400 13px/1.4 ${SANS}`, color: C.ink2 }}>{ICP_CRITERIA}</div>
            </div>
            <div style={{ background: C.white, borderRadius: 16, boxShadow: SHADOW_SUB, padding: "15px 18px" }}>
              <div style={{ font: `600 10px ${SANS}`, letterSpacing: ".04em", textTransform: "uppercase", color: C.muted3 }}>Checkpoint</div>
              {/* text z configu — žádná hardcoded hodnota */}
              <div style={{ marginTop: 6, font: `400 13px/1.4 ${SANS}`, color: C.ink2 }}>0 otevření ≥ {DAY_CHECKPOINT} dní od vstupu do sekvence</div>
              {/* Zdroj = Ecomail stats-detail (kumulativně za celou dobu), ne webhook. */}
              <div style={{ marginTop: 4, font: `400 11.5px/1.4 ${SANS}`, color: C.muted2 }}>
                zdroj: Ecomail · odhlášení a leady mimo sekvenci se nehodnotí
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, background: C.white, borderRadius: 16, boxShadow: SHADOW_SUB, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", height: 8, flex: 1, borderRadius: 20, overflow: "hidden", background: C.track }}>
              <div style={{ width: `${pct(counts.needs_review)}%`, background: C.blue }} />
              <div style={{ width: `${pct(counts.moved_to_manual)}%`, background: C.green }} />
            </div>
            <div style={{ display: "flex", gap: 12, font: `600 12px ${SANS}` }}>
              <span style={{ color: C.blue }}>{counts.needs_review} k review</span>
              <span style={{ color: C.green }}>{counts.moved_to_manual} přesunuto</span>
            </div>
          </div>

          {(note || error) && (
            <div style={{ marginTop: 12, font: `500 12.5px ${SANS}`, color: error ? "#dc2626" : C.green }}>{error || note}</div>
          )}
        </div>

        {/* Seznam */}
        <div style={{ padding: "6px 34px 30px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0 16px" }}>
            <span style={{ font: `500 13px ${SANS}`, color: C.muted }}>
              <strong style={{ color: C.ink, fontWeight: 700 }}>{leads.length}</strong> leadů · channel mismatch
            </span>
            <span style={{ font: `500 12px ${SANS}`, color: C.muted2 }}>řazeno dle checkpointu</span>
          </div>

          {leads.length === 0 && (
            <div style={{ background: C.white, borderRadius: 16, boxShadow: SHADOW_SUB, padding: 24, font: `400 13px ${SANS}`, color: C.muted }}>
              Žádné leady k review. Spusť „Aktualizovat data".
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {leads.map(L => {
              const isOpen = open === L.id;
              const draft = drafts[L.id] ?? L.draft_message ?? "";
              return (
                <div key={L.id} style={{ background: C.white, borderRadius: 16, boxShadow: SHADOW_SUB, overflow: "hidden" }}>
                  <div onClick={() => setOpen(isOpen ? null : L.id)}
                    style={{ display: "grid", gridTemplateColumns: "1fr 190px", gap: 16, alignItems: "center", padding: "16px 20px", cursor: "pointer" }}>
                    <div>
                      <span style={{ font: `600 15px ${SANS}`, color: C.ink, letterSpacing: "-.01em" }}>{L.domain ?? "—"}</span>
                      <div style={{ font: `400 12.5px ${SANS}`, color: C.muted2, marginTop: 4 }}>
                        {L.email}{L.competitors.length ? ` · vs ${L.competitors.slice(0, 2).join(", ")}` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ display: "inline-flex", gap: 5, alignItems: "center", font: `600 11.5px ${SANS}`, color: C.blue, background: C.blueBg, padding: "5px 11px", borderRadius: 999 }}>
                        0 otevření · checkpoint {dateCz(L.checkpoint_reached_at)}
                      </span>
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ padding: "18px 20px 22px", background: C.detailBg, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
                      {/* Quick wins */}
                      <div>
                        <div style={{ font: `600 10px ${SANS}`, letterSpacing: ".04em", textTransform: "uppercase", color: C.muted3, marginBottom: 10 }}>Quick wins</div>
                        {L.quick_wins.length === 0 && <div style={{ font: `400 13px ${SANS}`, color: C.muted2 }}>Bez quick winů v analýze.</div>}
                        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                          {L.quick_wins.map((q, i) => (
                            <li key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", font: `400 13px/1.5 ${SANS}`, color: C.ink2 }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", marginTop: 6, flex: "none", background: DOT[i % DOT.length] }} />
                              <span>{q.akce}</span>
                            </li>
                          ))}
                        </ul>
                        {L.analysis_url && (
                          <a href={L.analysis_url} target="_blank" rel="noopener noreferrer"
                            style={{ display: "inline-block", marginTop: 12, font: `500 12px ${SANS}`, color: C.blue, textDecoration: "none" }}>
                            Otevřít analýzu →
                          </a>
                        )}
                      </div>

                      {/* Draft + akce */}
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                          <span style={{ font: `600 10px ${SANS}`, letterSpacing: ".04em", textTransform: "uppercase", color: C.muted3 }}>Draft LinkedIn zprávy</span>
                          <button onClick={() => genDraft(L.id)} disabled={!!busy}
                            style={{ marginLeft: "auto", border: "none", cursor: "pointer", background: C.track, color: C.ink2, font: `600 11.5px ${SANS}`, padding: "6px 11px", borderRadius: 999 }}>
                            {busy === `draft:${L.id}` ? "Generuji…" : draft ? "Přegenerovat" : "Vygenerovat"}
                          </button>
                        </div>
                        <textarea
                          value={draft} spellCheck={false}
                          onChange={e => setDrafts(d => ({ ...d, [L.id]: e.target.value }))}
                          placeholder="Zatím bez draftu — vygeneruj ho tlačítkem výše."
                          style={{ width: "100%", minHeight: 130, resize: "vertical", fontSize: 13, lineHeight: 1.6, fontFamily: SANS, color: C.ink2, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 15px", outline: "none" }}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                          <button onClick={() => saveDraft(L.id)} disabled={!!busy}
                            style={{ border: "none", cursor: "pointer", background: C.track, color: C.ink2, font: `600 12px ${SANS}`, padding: "8px 13px", borderRadius: 999 }}>
                            {busy === `save:${L.id}` ? "Ukládám…" : "Uložit draft"}
                          </button>
                        </div>

                        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <button onClick={() => move(L.id)} disabled={!!busy}
                            style={{
                              border: "none", cursor: busy ? "not-allowed" : "pointer",
                              background: C.blue, color: "#fff",
                              font: `600 13px ${SANS}`, padding: "11px 17px", borderRadius: 999,
                              opacity: busy ? .6 : 1,
                            }}>
                            {busy === `move:${L.id}` ? "Přesouvám…" : "Přesunout na manual outreach →"}
                          </button>
                          <button onClick={() => reject(L.id)} disabled={!!busy}
                            title="Není fit — odebrat z dashboardu"
                            style={{
                              border: `1px solid ${C.border}`, cursor: busy ? "not-allowed" : "pointer",
                              background: "transparent", color: C.muted,
                              font: `600 13px ${SANS}`, padding: "10px 16px", borderRadius: 999,
                            }}>
                            {busy === `reject:${L.id}` ? "Odmítám…" : "Odmítnout"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
