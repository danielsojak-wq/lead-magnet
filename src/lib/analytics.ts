declare global {
  interface Window {
    // GTM dataLayer — intentional any[] per GTM spec
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer: any[];
  }
}

export function trackEvent(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}

export function getUtmData(): Record<string, string | null> | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = sessionStorage.getItem("utm_data");
    return stored ? (JSON.parse(stored) as Record<string, string | null>) : null;
  } catch {
    return null;
  }
}

export function getLandingUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem("landing_url");
  } catch {
    return null;
  }
}

export function captureUtm(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const utmData: Record<string, string | null> = {
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
    utm_content: params.get("utm_content"),
    utm_term: params.get("utm_term"),
  };
  if (Object.values(utmData).some((v) => v !== null)) {
    sessionStorage.setItem("utm_data", JSON.stringify(utmData));
  }
  // Landing URL — ulož jednou (first-touch), i když UTM chybí: u prázdných
  // leadů pak jde poznat, jestli UTM v URL vůbec byla.
  try {
    if (!sessionStorage.getItem("landing_url")) {
      sessionStorage.setItem("landing_url", window.location.href);
    }
  } catch { /* sessionStorage nedostupné (private mode / in-app browser) */ }
  trackEvent({ event: "page_view_with_utm", ...utmData });
}
