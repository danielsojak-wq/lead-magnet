const SESSION_KEY = "dashboard_auth";

interface AuthData {
  slug: string;
  name: string;
  isAdmin?: boolean;
  isAccountManager?: boolean;
  isMarketing?: boolean;
}

/**
 * Returns a short actor string for timeline/activity logging.
 * e.g. "admin", "client", "am:Jirka", "marketing:Karel"
 */
export function getSessionActor(): string {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return "client";
    const auth: AuthData = JSON.parse(stored);
    if (auth.isAdmin) return "admin";
    if (auth.isAccountManager) return `am:${auth.name}`;
    if (auth.isMarketing) return `marketing:${auth.name}`;
    return "client";
  } catch {
    return "client";
  }
}

/** Czech-friendly label for display */
export function getActorDisplayLabel(actor: string): string {
  if (actor === "admin") return "Admin";
  if (actor === "client") return "Klient";
  if (actor.startsWith("am:")) return actor.replace("am:", "");
  if (actor.startsWith("marketing:")) return actor.replace("marketing:", "");
  return actor;
}
