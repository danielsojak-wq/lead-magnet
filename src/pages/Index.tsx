import { useState, useCallback, useEffect, useRef } from "react";
import { startOfMonth } from "date-fns";
import { DateRange } from "react-day-picker";
import { useLeadGenData } from "@/hooks/useLeadGen";
import { StatCard } from "@/components/StatCard";
import { LeadGenChart } from "@/components/LeadGenChart";
import { LeadGenTable } from "@/components/LeadGenTable";
import { PeriodSwitcher } from "@/components/PeriodSwitcher";
import { LeadReviewBoard } from "@/components/LeadReviewBoard";
import { logActivity } from "@/lib/activity-log";

import { Users, UserCheck, Coins, Target, BarChart3, Percent, LogOut, ChevronLeft } from "lucide-react";
import performindLogo from "@/assets/performind-logo.png";
import { ClientLogo } from "@/components/ClientLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpDialog } from "@/components/HelpDialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const formatCZK = (v: number) =>
  new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(v);

function ClientHeaderLogo({ slug, name }: { slug: string; name: string }) {
  const storageUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/client-logos/`;
  const [src, setSrc] = useState(`${storageUrl}${slug}.png`);
  const [showText, setShowText] = useState(false);

  if (showText) return <h1 className="text-sm font-semibold tracking-tight text-foreground">{name}</h1>;

  return (
    <img
      src={src}
      alt={name}
      className="h-6 sm:h-8 object-contain"
      onError={() => {
        if (src.endsWith(".png")) setSrc(`${storageUrl}${slug}.webp`);
        else if (src.endsWith(".webp")) setSrc(`/logos/${slug}.webp`);
        else setShowText(true);
      }}
    />
  );
}

const SESSION_KEY = "dashboard_auth";

interface IndexProps {
  clientName: string;
  clientSlug: string;
  isAdmin?: boolean;
  initialSection?: string;
  onBack?: () => void;
}

type Section = "statistiky" | "poptavky";

const Index = ({ clientName, clientSlug, isAdmin, initialSection, onBack }: IndexProps) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    navigate("/");
  };

  // Log page visit (once per mount, only for non-admin users)
  const hasLoggedVisit = useRef(false);
  const lastVisibilityLog = useRef(0);
  useEffect(() => {
    if (!isAdmin && clientSlug && !hasLoggedVisit.current) {
      hasLoggedVisit.current = true;
      lastVisibilityLog.current = Date.now();
      logActivity(clientSlug, "page_view", "Návštěva dashboardu");
    }
  }, [clientSlug, isAdmin]);

  // Log activity on visibility change (tab return) – debounced 30 min
  useEffect(() => {
    if (isAdmin || !clientSlug) return;
    const DEBOUNCE_MS = 30 * 60 * 1000;
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastVisibilityLog.current < DEBOUNCE_MS) return;
      lastVisibilityLog.current = Date.now();
      logActivity(clientSlug, "page_view", "Návštěva dashboardu");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [clientSlug, isAdmin]);

  const isCrmDefault = initialSection === "poptavky";
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    isCrmDefault ? undefined : { from: startOfMonth(new Date()), to: new Date() }
  );
  const [activeSection, setActiveSection] = useState<Section>(
    isCrmDefault ? "poptavky" : "statistiky"
  );

  const handleSectionChange = useCallback((section: Section) => {
    setActiveSection(section);
    if (section === "poptavky") {
      setDateRange(undefined);
    } else {
      setDateRange({ from: startOfMonth(new Date()), to: new Date() });
    }
    navigate(section === "poptavky" ? `/leadgen/${clientSlug}/crm` : `/leadgen/${clientSlug}/dashboard`, { replace: true });
  }, [navigate, clientSlug]);

  const {
    monthly, totalLeads, totalQualified, totalAdCost,
    cpl, cplQualified, qualifiedPct,
    isLoading, error, comparison, granularity,
    tableData, tableGranularity,
    rawLeads, rawCosts,
  } = useLeadGenData(dateRange, clientSlug);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">Chyba při načítání dat</p>
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  // Privileged role header (admin, AM, marketing)
  const isPrivileged = isAdmin && onBack;

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          {isPrivileged ? (
            <>
              {/* Privileged header — unified with ecommerce */}
              <div className="sm:h-[56px] py-3 sm:py-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <ClientLogo slug={clientSlug} name={clientName} className="h-6 w-6 object-contain" />
                  <h1 className="text-sm font-semibold tracking-tight text-foreground">{clientName}</h1>
                </div>
                <PeriodSwitcher dateRange={dateRange} onChange={setDateRange} />
              </div>
              {/* Section tabs */}
              <nav className="flex gap-1 -mb-px pl-11">
                <button
                  onClick={() => handleSectionChange("statistiky")}
                  className={`px-3 py-2 text-xs font-medium transition-colors relative ${
                    activeSection === "statistiky" ? "text-foreground" : "text-muted-foreground hover:text-foreground/70"
                  }`}
                >
                  Statistiky
                  {activeSection === "statistiky" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                </button>
                <button
                  onClick={() => handleSectionChange("poptavky")}
                  className={`px-3 py-2 text-xs font-medium transition-colors relative ${
                    activeSection === "poptavky" ? "text-foreground" : "text-muted-foreground hover:text-foreground/70"
                  }`}
                >
                  Poptávky
                  {activeSection === "poptavky" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                </button>
              </nav>
            </>
          ) : (
            <>
              {/* Client header — original layout */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-3 sm:pt-0 sm:h-[72px]">
                <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-4">
                  <img src={performindLogo} alt="Performind Marketing" className="w-[120px] sm:w-[180px] block" />
                  <div className="h-5 sm:h-6 w-px bg-border" />
                  <ClientHeaderLogo key={clientSlug} slug={clientSlug} name={clientName} />
                </div>
                <div className="flex items-center gap-2">
                  <PeriodSwitcher dateRange={dateRange} onChange={setDateRange} />
                  <HelpDialog role="client" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-muted-foreground hover:text-foreground"
                    onClick={handleLogout}
                    title="Odhlásit se"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {/* Section tabs */}
              <nav className="flex gap-1 -mb-px">
                <button
                  onClick={() => handleSectionChange("statistiky")}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                    activeSection === "statistiky" ? "text-foreground" : "text-muted-foreground hover:text-foreground/70"
                  }`}
                >
                  Statistiky
                  {activeSection === "statistiky" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                </button>
                <button
                  onClick={() => handleSectionChange("poptavky")}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                    activeSection === "poptavky" ? "text-foreground" : "text-muted-foreground hover:text-foreground/70"
                  }`}
                >
                  Poptávky
                  {activeSection === "poptavky" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                </button>
              </nav>
            </>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-8">
        {activeSection === "statistiky" && (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-border/50 bg-card p-4 sm:p-6 space-y-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))
              ) : (
                <>
                  <StatCard title="Poptávky" value={totalLeads.toLocaleString("cs-CZ")} icon={Users} change={comparison.totalLeadsChange} changeLabel={comparison.changeLabel} />
                  <StatCard title="Kvalifikované poptávky" value={totalQualified.toLocaleString("cs-CZ")} icon={UserCheck} change={comparison.totalQualifiedChange} changeLabel={comparison.changeLabel} />
                  <StatCard title="Investice do marketingu" value={formatCZK(totalAdCost)} icon={Coins} change={comparison.totalAdCostChange} changeLabel={comparison.changeLabel} neutralChange />
                  <StatCard title="Cena za poptávku" value={cpl > 0 ? formatCZK(cpl) : "—"} icon={Target} change={comparison.cplChange} changeLabel={comparison.changeLabel} invertChange />
                  <StatCard title="Cena za kval. poptávku" value={cplQualified > 0 ? formatCZK(cplQualified) : "—"} icon={BarChart3} change={comparison.cplQualifiedChange} changeLabel={comparison.changeLabel} invertChange />
                  <StatCard title="Relevance poptávek" value={totalLeads > 0 ? `${qualifiedPct.toFixed(1)} %` : "—"} icon={Percent} change={comparison.qualifiedPctChange} changeLabel={comparison.changeLabel} />
                </>
              )}
            </div>

            {/* Chart */}
            {isLoading ? (
              <div className="rounded-xl border border-border/50 bg-card p-4 sm:p-6 space-y-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-[300px] w-full rounded-lg" />
              </div>
            ) : (
              <LeadGenChart data={monthly} granularity={granularity} clientSlug={clientSlug} leads={rawLeads} costs={rawCosts} dateRange={dateRange} />
            )}

            {/* Table */}
            {isLoading ? (
              <div className="rounded-xl border border-border/50 bg-card p-4 sm:p-6 space-y-3">
                <Skeleton className="h-5 w-40" />
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <LeadGenTable data={tableData} granularity={tableGranularity} />
            )}
          </>
        )}

        {activeSection === "poptavky" && (
          <LeadReviewBoard clientSlug={clientSlug} dateRange={dateRange} />
        )}
      </main>

      {!isPrivileged && (
        <footer className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pb-6 pt-2 text-center">
          <p className="text-xs text-muted-foreground/60">Developed by Performind</p>
        </footer>
      )}
    </div>
  );
};

export default Index;
