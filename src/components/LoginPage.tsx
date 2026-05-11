import { useState, FormEvent, useEffect, useCallback } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { logActivity } from "@/lib/activity-log";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import performindLogo from "@/assets/performind-logo.png";

const SESSION_KEY = "dashboard_auth";
const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 30;

export function useClientAuth() {
  const [authenticated, setAuthenticated] = useState(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as { slug: string; name: string };
    } catch {
      return null;
    }
  });

  const login = (slug: string, name: string) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ slug, name }));
    setAuthenticated({ slug, name });
  };

  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setAuthenticated(null);
  };

  return { authenticated, login, logout };
}

export function LoginPage() {
  const stored = localStorage.getItem(SESSION_KEY);
  if (stored) {
    try {
      const auth = JSON.parse(stored);
      if (auth.slug) {
        return <Navigate to="/home" replace />;
      }
    } catch {}
  }

  return <LoginForm />;
}

function LoginForm() {
  const navigate = useNavigate();
  const [client, setClient] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockoutEnd, setLockoutEnd] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Handle Google OAuth callback
  const handleGoogleCallback = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.email) return;

    const email = session.user.email;
    
    // Verify with our edge function
    try {
      const { data, error: fnError } = await supabase.functions.invoke("verify-google-login", {
        body: { email },
      });

      if (fnError || !data?.valid) {
        // Not authorized - sign out and show error
        await supabase.auth.signOut();
        if (data?.error === "domain_not_allowed") {
          setError("Přihlášení je povoleno pouze pro @performind.cz účty.");
        } else if (data?.error === "not_registered") {
          setError("Váš účet není registrován. Požádejte administrátora o přidání.");
        } else {
          setError("Přihlášení se nezdařilo.");
        }
        return;
      }

      // Build auth session
      const authData: Record<string, unknown> = {
        slug: data.slug,
        name: data.name,
        googleAuth: true,
      };

      if (data.isAdmin && data.clients) {
        authData.isAdmin = true;
        authData.adminName = data.name;
        authData.clients = data.clients;
        const firstSlug = data.clients[0]?.slug;
        if (firstSlug) {
          authData.slug = firstSlug;
          authData.name = data.clients[0]?.display_name || data.clients[0]?.name;
        }
      }
      if (data.isAccountManager && data.clients) {
        authData.isAccountManager = true;
        authData.amId = data.amId;
        authData.clients = data.clients;
        authData.assignedSlugs = data.assignedSlugs || [];
      }
      if (data.isMarketing && data.clients) {
        authData.isMarketing = true;
        authData.clients = data.clients;
      }

      localStorage.setItem(SESSION_KEY, JSON.stringify(authData));
      navigate("/home");
    } catch {
      await supabase.auth.signOut();
      setError("Chyba při ověřování Google účtu.");
    }
  }, [navigate]);

  // Check for existing Supabase auth session on mount (OAuth redirect back)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        handleGoogleCallback();
      }
    });

    // Also check current session (in case we already have one from redirect)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email?.endsWith("@performind.cz")) {
        handleGoogleCallback();
      }
    });

    return () => subscription.unsubscribe();
  }, [handleGoogleCallback]);

  useEffect(() => {
    if (!lockoutEnd) return;
    const tick = () => {
      const remaining = Math.ceil((lockoutEnd - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutEnd(null);
        setCountdown(0);
        setAttempts(0);
      } else {
        setCountdown(remaining);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lockoutEnd]);

  const isLocked = lockoutEnd !== null && Date.now() < lockoutEnd;

  const handleGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
        extraParams: {
          hd: "performind.cz",
          prompt: "select_account",
        },
      });

      if (result.error) {
        setError("Přihlášení přes Google se nezdařilo.");
        setGoogleLoading(false);
        return;
      }

      if (result.redirected) {
        // Browser will redirect to Google
        return;
      }

      // Tokens received directly — handle callback
      await handleGoogleCallback();
    } catch {
      setError("Chyba při přihlašování přes Google.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setError("");
    setLoading(true);

    const invokeVerify = () =>
      Promise.race([
        supabase.functions.invoke("verify-password", {
          body: { client: client.trim(), password },
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("VERIFY_TIMEOUT")), 12000);
        }),
      ]);

    try {
      let response: Awaited<ReturnType<typeof supabase.functions.invoke>> | null = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await invokeVerify();
          break;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const isTransientNetworkError = message.includes("Failed to fetch") || message.includes("NetworkError");
          if (attempt === 0 && isTransientNetworkError) {
            await new Promise((r) => setTimeout(r, 500));
            continue;
          }
          throw err;
        }
      }

      type VerifyResponse = { valid: boolean; slug?: string; name?: string; isAdmin?: boolean; isAccountManager?: boolean; isMarketing?: boolean; amId?: string; clients?: Array<{ slug: string; display_name: string | null; name: string }>; assignedSlugs?: string[] };
      const { data, error: fnError } = (response ?? {}) as {
        data?: VerifyResponse;
        error?: unknown;
      };
      if (fnError) throw fnError;

      if (data?.valid && data.slug) {
        const authData: Record<string, unknown> = { slug: data.slug, name: data.name || client.trim() };
        if (data.isAdmin && data.clients) {
          authData.isAdmin = true;
          authData.adminName = data.name || "Admin";
          authData.clients = data.clients;
          const firstSlug = data.clients[0]?.slug;
          if (firstSlug) {
            authData.slug = firstSlug;
            authData.name = data.clients[0]?.display_name || data.clients[0]?.name;
          }
        }
        if (data.isAccountManager && data.clients) {
          authData.isAccountManager = true;
          authData.amId = data.amId;
          authData.clients = data.clients;
          authData.assignedSlugs = data.assignedSlugs || [];
        }
        if (data.isMarketing && data.clients) {
          authData.isMarketing = true;
          authData.clients = data.clients;
        }
        localStorage.setItem(SESSION_KEY, JSON.stringify(authData));

        if (!data.isAdmin && !data.isAccountManager) {
          logActivity(data.slug!, "login", "Přihlášení klienta", "client");
        }

        navigate("/home");
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= MAX_ATTEMPTS) {
          setLockoutEnd(Date.now() + LOCKOUT_SECONDS * 1000);
          setError(`Příliš mnoho pokusů. Zkuste to za ${LOCKOUT_SECONDS} sekund.`);
        } else {
          setError(`Nesprávné přihlašovací údaje (${MAX_ATTEMPTS - newAttempts} pokusů zbývá)`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("VERIFY_TIMEOUT")) {
        setError("Ověření trvá příliš dlouho. Zkuste to prosím znovu.");
      } else {
        setError("Chyba při ověřování");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[40%] -right-[20%] w-[800px] h-[800px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-[30%] -left-[15%] w-[600px] h-[600px] rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary/3 blur-[120px]" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo + branding */}
        <div className="flex flex-col items-center mb-12">
          <img
            src={performindLogo}
            alt="Performind Marketing"
            className="w-[180px] mb-6 drop-shadow-lg"
          />
          <div className="h-px w-16 bg-gradient-to-r from-transparent via-primary/40 to-transparent mb-6" />
          <h1 className="text-2xl font-heading font-bold tracking-tight text-foreground">
            Klientský portál
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Přihlaste se pro přístup k vašemu dashboardu
          </p>
        </div>

        {/* Login card */}
        <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl shadow-2xl shadow-primary/5 p-8">
          {/* Google login for team */}
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 text-base font-medium gap-3 mb-6"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <Spinner size="sm" className="inline-flex" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            Přihlásit se přes Google
          </Button>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/60" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card/80 px-3 text-muted-foreground">nebo heslem klienta</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Klient
              </label>
              <Input
                type="text"
                placeholder="Zadejte název klienta"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                disabled={isLocked}
                className="h-12 bg-background/50 border-border/60 focus:border-primary/50 transition-colors text-base"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Heslo
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Zadejte heslo"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLocked}
                  className="h-12 bg-background/50 border-border/60 focus:border-primary/50 transition-colors pr-12 text-base"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {isLocked && countdown > 0 && (
              <p className="text-sm text-muted-foreground text-center">
                Další pokus za {countdown} s
              </p>
            )}

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold gap-2 group"
              disabled={loading || !client.trim() || !password || isLocked}
            >
              {loading ? (
                <>
                  <Spinner size="sm" className="inline-flex" /> Ověřuji…
                </>
              ) : (
                <>
                  Vstoupit
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/50 mt-8">
          © {new Date().getFullYear()} Performind Marketing
        </p>
      </div>
    </div>
  );
}
