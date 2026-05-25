import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

export const RATE_LIMITS = {
  ip:     { daily: 2, weekly: 3 },
  email:  { daily: 2, weekly: 3 },
  domain: { daily: 3, weekly: 5 },
} as const;

export type IdentifierType = keyof typeof RATE_LIMITS;
type Period = "daily" | "weekly";

export interface RateLimitHit {
  layer: IdentifierType;
  period: Period;
  domain: string;
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeDomain(url: string): string {
  if (!url.trim()) return "";
  const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    return new URL(withProtocol).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*$/, "");
  }
}

export function normalizeIp(raw: string): string {
  const ip = raw.trim();
  if (!ip) return "unknown";
  if (ip.includes(":")) {
    // IPv6: normalize to /64 prefix — keep first 4 groups, replace rest with ::
    const segments = ip.split(":");
    const prefix = segments.slice(0, 4);
    while (prefix.length < 4) prefix.push("0");
    return prefix.join(":") + "::";
  }
  return ip; // IPv4 — full address
}

export function extractIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) {
    console.log(JSON.stringify({ level: "warn", message: "x-forwarded-for header missing, rate limit skipped for IP" }));
    return "unknown";
  }
  return normalizeIp(forwarded.split(",")[0].trim());
}

// ─── Logging (PII-safe) ───────────────────────────────────────────────────────

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 0) return "***";
  return email.slice(0, Math.min(2, at)) + "***" + email.slice(at);
}

function maskIp(ip: string): string {
  if (ip === "unknown") return ip;
  if (ip.includes(":")) return ip.slice(0, 9) + "…";
  const parts = ip.split(".");
  return parts.slice(0, 2).join(".") + ".x.x";
}

export function logRateEvent(fields: {
  level: "info" | "warn" | "error";
  message: string;
  session_id?: string;
  identifier_type?: IdentifierType;
  identifier_value?: string;
  limit_hit?: boolean;
  error?: string;
}): void {
  const { identifier_type, identifier_value, ...rest } = fields;
  let masked: string | undefined;
  if (identifier_value && identifier_type) {
    if (identifier_type === "email") masked = maskEmail(identifier_value);
    else if (identifier_type === "ip") masked = maskIp(identifier_value);
    else masked = identifier_value; // domain is OK plain in logs
  }
  console.log(JSON.stringify({ ...rest, identifier_type, identifier_value_masked: masked }));
}

// ─── Rate limit CHECK ─────────────────────────────────────────────────────────

export async function checkRateLimit(
  supa: SupabaseClient,
  identifiers: { ip: string; email: string; domain: string },
): Promise<RateLimitHit | null> {
  const now = Date.now();
  const dayAgo  = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const checks: Array<[IdentifierType, string]> = [
    ["email",  identifiers.email],
    ["ip",     identifiers.ip],
    ["domain", identifiers.domain],
  ];

  for (const [type, value] of checks) {
    if (!value || value === "unknown") continue;
    const limits = RATE_LIMITS[type];

    const { count: daily } = await supa
      .from("rate_limit_attempts")
      .select("id", { count: "exact", head: true })
      .eq("identifier_type", type)
      .eq("identifier_value", value)
      .gte("created_at", dayAgo);

    if ((daily ?? 0) >= limits.daily) {
      return { layer: type, period: "daily", domain: identifiers.domain };
    }

    const { count: weekly } = await supa
      .from("rate_limit_attempts")
      .select("id", { count: "exact", head: true })
      .eq("identifier_type", type)
      .eq("identifier_value", value)
      .gte("created_at", weekAgo);

    if ((weekly ?? 0) >= limits.weekly) {
      return { layer: type, period: "weekly", domain: identifiers.domain };
    }
  }

  return null;
}

// ─── Rate limit INSERT ────────────────────────────────────────────────────────

export async function insertRateLimitAttempts(
  supa: SupabaseClient,
  identifiers: { ip: string; email: string; domain: string },
  sessionId: string,
): Promise<void> {
  const rows = [
    { identifier_type: "ip" as IdentifierType,     identifier_value: identifiers.ip,     session_id: sessionId },
    { identifier_type: "email" as IdentifierType,  identifier_value: identifiers.email,  session_id: sessionId },
    { identifier_type: "domain" as IdentifierType, identifier_value: identifiers.domain, session_id: sessionId },
  ].filter((r) => r.identifier_value && r.identifier_value !== "unknown");

  if (!rows.length) return;

  const { error } = await supa.from("rate_limit_attempts").insert(rows);
  if (error) {
    console.log(JSON.stringify({
      level: "error",
      message: "rate_limit_insert_failed",
      session_id: sessionId,
      error: error.message,
    }));
  }
}

// ─── Friendly messages ────────────────────────────────────────────────────────

export function buildRateLimitResponse(hit: RateLimitHit): { message: string; retry_after_hours: number } {
  const { layer, period, domain } = hit;

  if (layer === "email") {
    if (period === "daily") return {
      message: "Tato e-mailová adresa už dnes spustila 2 analýzy. Vraťte se zítra, nebo nám napište na daniel@performind.cz pokud potřebujete víc.",
      retry_after_hours: 24,
    };
    return {
      message: "Tato e-mailová adresa už tento týden spustila 3 analýzy. Další analýzu můžete spustit za pár dní, nebo nám napište na daniel@performind.cz.",
      retry_after_hours: 72,
    };
  }

  if (layer === "ip") {
    if (period === "daily") return {
      message: "Z této sítě už dnes proběhly 2 analýzy. Pokud nejste vy, ale váš kolega, zkuste se přihlásit z jiné sítě. Jinak se vraťte zítra, nebo nám napište na daniel@performind.cz.",
      retry_after_hours: 24,
    };
    return {
      message: "Z této sítě už tento týden proběhly 3 analýzy. Vraťte se za pár dní, nebo nám napište na daniel@performind.cz.",
      retry_after_hours: 72,
    };
  }

  // domain
  const d = domain || "tato doména";
  if (period === "daily") return {
    message: `Doména ${d} už byla dnes analyzována 3×. Reanalýzu doporučujeme ne dříve než za 24 hodin pro smysluplné porovnání.`,
    retry_after_hours: 24,
  };
  return {
    message: `Doména ${d} už tento týden byla analyzována 5×. Pro reanalýzu nám napište na daniel@performind.cz.`,
    retry_after_hours: 120,
  };
}
