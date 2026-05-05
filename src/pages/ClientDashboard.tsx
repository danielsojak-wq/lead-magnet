import { useState, useCallback, useEffect, useRef } from "react";
import { Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import Index from "./Index";
import { AdminOverview } from "@/components/AdminOverview";
import { AMOverview } from "@/components/AMDashboard";
import { MarketingOverview } from "@/components/MarketingDashboard";
import { EcommerceOverview, EcommerceClientPage } from "@/components/EcommerceDashboard";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { SidebarProvider } from "@/components/ui/sidebar";
import { EcommerceDigestPage } from "@/components/EcommerceDigestPage";
import { HomeDashboard } from "@/components/HomeDashboard";
import { AMClientSettings } from "@/components/AMClientSettings";
import { TeamUsersSettings } from "@/components/TeamUsersSettings";
import { useIsMobile } from "@/hooks/use-mobile";
import { CreativeOverview } from "@/components/creative/CreativeOverview";
import { BrandDnaPage } from "@/components/creative/BrandDnaPage";
import { BriefFormPage } from "@/components/creative/BriefFormPage";
import { BriefDetailPage } from "@/components/creative/BriefDetailPage";
import { CompetitorAdsPage } from "@/components/creative/CompetitorAdsPage";
import { ClientCreativePage } from "@/components/creative/ClientCreativePage";
import { ClientsHubPage } from "@/components/ClientsHubPage";

const SESSION_KEY = "dashboard_auth";

interface ClientInfo {
  slug: string;
  display_name: string | null;
  name: string;
}

interface AuthData {
  slug: string;
  name: string;
  adminName?: string;
  isAdmin?: boolean;
  isAccountManager?: boolean;
  isMarketing?: boolean;
  amId?: string;
  clients?: ClientInfo[];
  assignedSlugs?: string[];
}

const ClientDashboard = () => {
  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) {
    return <Navigate to="/" replace />;
  }

  let auth: AuthData;
  try {
    auth = JSON.parse(stored);
  } catch {
    return <Navigate to="/" replace />;
  }

  return <ClientDashboardInner auth={auth} />;
};

// Derive section, slug, and subview from URL
function useRouteState() {
  const location = useLocation();
  const params = useParams<{ slug?: string; briefId?: string }>();
  const path = location.pathname;

  let section: "leadgen" | "ecommerce" | "creative" = "leadgen";
  let subView: string | null = null;
  let currentSlug: string | null = null;
  let briefId: string | null = null;
  let initialSection: string | undefined;

  if (path === "/home") {
    subView = "home";
  } else if (path === "/clients") {
    subView = "clients-hub";
  } else if (path === "/settings/clients") {
    subView = "settings-clients";
  } else if (path === "/settings/team") {
    subView = "settings-team";
  } else if (path.startsWith("/creative")) {
    section = "creative";
    subView = "creative";
    if (params.slug) currentSlug = params.slug;
    if (path.endsWith("/brand")) subView = "creative-brand";
    else if (path.endsWith("/new")) subView = "creative-new";
    else if (path.endsWith("/competitors")) subView = "creative-competitors";
    else if (params.briefId) { subView = "creative-brief"; briefId = params.briefId; }
    else if (params.slug) subView = "creative-client";
  } else if (path.startsWith("/ecommerce")) {
    section = "ecommerce";
    if (path === "/ecommerce/notifications") {
      subView = "digest";
    } else if (params.slug) {
      currentSlug = params.slug;
    }
  } else if (path.startsWith("/leadgen")) {
    section = "leadgen";
    if (params.slug) {
      currentSlug = params.slug;
      if (path.endsWith("/crm")) {
        initialSection = "poptavky";
      }
    }
  }

  return { section, subView, currentSlug, initialSection, briefId };
}

function ClientDashboardInner({ auth }: { auth: AuthData }) {
  const isPrivileged = auth.isAdmin || auth.isAccountManager || auth.isMarketing;
  const navigate = useNavigate();
  const { section, subView, currentSlug, initialSection, briefId } = useRouteState();

  // Non-privileged (client) — redirect to /leadgen/:slug/dashboard on first load
  useEffect(() => {
    if (!isPrivileged) {
      const path = window.location.pathname;
      if (path === "/home" || path === "/leadgen" || path === "/") {
        navigate(`/leadgen/${auth.slug}/dashboard`, { replace: true });
      }
    }
  }, [isPrivileged, auth.slug, navigate]);

  // AM assigned slugs – always refresh from DB
  const [resolvedAssignedSlugs, setResolvedAssignedSlugs] = useState<string[]>(auth.assignedSlugs || []);
  const slugsReady = useRef(false);

  useEffect(() => {
    if (!auth.isAccountManager || !auth.amId) return;
    supabase
      .from("account_manager_clients")
      .select("client_slug")
      .eq("account_manager_id", auth.amId)
      .then(({ data }) => {
        const allSlugs = (data || []).map((r) => r.client_slug);
        // Deduplicate (same client can appear in both sections)
        const uniqueSlugs = [...new Set(allSlugs)];
        setResolvedAssignedSlugs(uniqueSlugs);
        slugsReady.current = true;
        const stored = localStorage.getItem(SESSION_KEY);
        if (stored) {
          const s = JSON.parse(stored);
          s.assignedSlugs = uniqueSlugs;
          localStorage.setItem(SESSION_KEY, JSON.stringify(s));
        }
      });
  }, [auth.isAccountManager, auth.amId]);

  // Activity logging
  const hasLoggedVisit = useRef(false);
  const lastVisibilityLog = useRef(0);

  const logAmVisit = useCallback((slugs: string[]) => {
    if (!auth.isAccountManager || slugs.length === 0) return;
    const actor = `am:${auth.name}`;
    for (const slug of slugs) {
      logActivity(slug, "am_visit", `Návštěva dashboardu (${auth.name})`, actor);
    }
  }, [auth.isAccountManager, auth.name]);

  useEffect(() => {
    if (hasLoggedVisit.current) return;
    if (auth.isAccountManager && !slugsReady.current) return;
    hasLoggedVisit.current = true;
    lastVisibilityLog.current = Date.now();
    logAmVisit(resolvedAssignedSlugs);
    if (auth.isAdmin) {
      const adminActor = `admin:${auth.adminName || "Admin"}`;
      logActivity("__admin__", "admin_visit", `Návštěva přehledu (${auth.adminName || "Admin"})`, adminActor);
    }
  }, [auth, resolvedAssignedSlugs, logAmVisit]);

  useEffect(() => {
    const DEBOUNCE_MS = 30 * 60 * 1000;
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastVisibilityLog.current < DEBOUNCE_MS) return;
      lastVisibilityLog.current = Date.now();
      logAmVisit(resolvedAssignedSlugs);
      if (auth.isAdmin) {
        const adminActor = `admin:${auth.adminName || "Admin"}`;
        logActivity("__admin__", "admin_visit", `Návštěva přehledu (${auth.adminName || "Admin"})`, adminActor);
      }
      if (!isPrivileged && auth.slug) {
        logActivity(auth.slug, "page_view", "Návštěva dashboardu", "client");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [auth, isPrivileged, resolvedAssignedSlugs, logAmVisit]);

  const [assignedSlugs, setAssignedSlugs] = useState<string[]>(resolvedAssignedSlugs);
  const [adminClients, setAdminClients] = useState<ClientInfo[]>(auth.clients || []);

  useEffect(() => {
    setAssignedSlugs(resolvedAssignedSlugs);
  }, [resolvedAssignedSlugs]);

  useEffect(() => {
    if (!auth.isAccountManager && !auth.isAdmin) return;
    const handleStorage = () => {
      const stored = localStorage.getItem(SESSION_KEY);
      if (!stored) return;
      try {
        const parsed = JSON.parse(stored);
        if (auth.isAccountManager) setAssignedSlugs(parsed.assignedSlugs || []);
        if (auth.isAdmin) setAdminClients(parsed.clients || []);
      } catch {}
    };
    const interval = setInterval(handleStorage, 500);
    return () => clearInterval(interval);
  }, [auth.isAccountManager, auth.isAdmin]);

  const handleAdminClientsChange = useCallback((clients: ClientInfo[]) => {
    setAdminClients(clients);
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      const session = JSON.parse(stored);
      session.clients = clients;
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
  }, []);

  const handleSelectClient = useCallback((slug: string) => {
    // Log AM activity
    if (auth.isAccountManager) {
      const clientName = (auth.clients || []).find(c => c.slug === slug)?.display_name || slug;
      logActivity(slug, "am_client_view", `${auth.name} otevřel/a dashboard: ${clientName}`, `am:${auth.name}`);
    }
    // Navigate to client page
    if (section === "ecommerce") {
      navigate(`/ecommerce/${slug}`);
    } else {
      navigate(`/leadgen/${slug}/dashboard`);
    }
  }, [auth, section, navigate]);

  // Non-privileged user (client) – no sidebar
  if (!isPrivileged) {
    return <Index clientName={auth.name} clientSlug={auth.slug} isAdmin={false} initialSection={initialSection} />;
  }

  // Determine role
  const role: "admin" | "am" | "marketing" = auth.isAdmin ? "admin" : auth.isAccountManager ? "am" : "marketing";
  const userName = auth.isAdmin ? (auth.adminName || "Admin") : auth.name;

  // Render content based on URL
  const renderContent = () => {
    // Creative Lab (admin/AM only)
    if (section === "creative" && (auth.isAdmin || auth.isAccountManager)) {
      const sourceClients = auth.isAdmin
        ? adminClients
        : (auth.clients || []).filter(c => assignedSlugs.includes(c.slug));
      if (subView === "creative-brand" && currentSlug) {
        const dn = sourceClients.find(c => c.slug === currentSlug)?.display_name || currentSlug;
        return <BrandDnaPage slug={currentSlug} clientName={dn} />;
      }
      if (subView === "creative-new" && currentSlug) {
        const dn = sourceClients.find(c => c.slug === currentSlug)?.display_name || currentSlug;
        return <BriefFormPage slug={currentSlug} clientName={dn} />;
      }
      if (subView === "creative-brief" && currentSlug && briefId) {
        const dn = sourceClients.find(c => c.slug === currentSlug)?.display_name || currentSlug;
        return <BriefDetailPage slug={currentSlug} briefId={briefId} clientName={dn} />;
      }
      if (subView === "creative-competitors" && currentSlug) {
        const dn = sourceClients.find(c => c.slug === currentSlug)?.display_name || currentSlug;
        return <CompetitorAdsPage slug={currentSlug} clientName={dn} />;
      }
      if (subView === "creative-client" && currentSlug) {
        const dn = sourceClients.find(c => c.slug === currentSlug)?.display_name || currentSlug;
        return <ClientCreativePage slug={currentSlug} clientName={dn} />;
      }
      return <CreativeOverview clients={sourceClients} amId={auth.amId} isAdmin={!!auth.isAdmin} />;
    }

    // Home dashboard
    if (subView === "home") {
      const homeSlugs = auth.isAdmin ? undefined : auth.isAccountManager ? assignedSlugs : (auth.clients || []).map(c => c.slug);
      return (
        <HomeDashboard
          slugs={homeSlugs}
          onNavigateEcommerce={(slug) => navigate(`/ecommerce/${slug}`)}
          onNavigateLeadgen={(slug) => navigate(`/leadgen/${slug}/dashboard`)}
          onNavigateEcommerceSection={() => navigate("/ecommerce")}
          onNavigateLeadgenSection={() => navigate("/leadgen")}
          userName={userName}
        />
      );
    }

    // Digest / notifications
    if (subView === "digest" && auth.isAccountManager && auth.amId) {
      return <EcommerceDigestPage amId={auth.amId} onBack={() => navigate("/ecommerce")} />;
    }

    // AM client settings
    if (subView === "settings-clients" && auth.isAccountManager && auth.amId) {
      return <AMClientSettings amId={auth.amId} amName={auth.name} onBack={() => navigate("/home")} />;
    }

    // Clients hub (admin + AM)
    if (subView === "clients-hub" && (auth.isAdmin || auth.isAccountManager)) {
      return <ClientsHubPage role={auth.isAdmin ? "admin" : "am"} amId={auth.amId} />;
    }

    // Admin team settings
    if (subView === "settings-team" && auth.isAdmin) {
      return <TeamUsersSettings />;
    }

    // Marketing
    if (auth.isMarketing) {
      if (currentSlug === null) {
        return (
          <MarketingOverview
            clients={auth.clients || []}
            onSelectClient={handleSelectClient}
          />
        );
      }
      const displayName = auth.clients?.find((c) => c.slug === currentSlug)?.display_name || currentSlug;
      return <Index clientName={displayName} clientSlug={currentSlug} isAdmin initialSection={initialSection} onBack={() => navigate("/leadgen")} />;
    }

    // AM
    if (auth.isAccountManager) {
      if (section === "ecommerce") {
        if (currentSlug === null) {
          return (
            <EcommerceOverview
              clients={auth.clients || []}
              onSelectClient={handleSelectClient}
              userType="am"
              userId={auth.name}
              userDisplayName={auth.name}
              assignedSlugs={assignedSlugs}
              amId={auth.amId}
            />
          );
        }
        const displayName = auth.clients?.find((c) => c.slug === currentSlug)?.display_name || currentSlug;
        return <EcommerceClientPage clientSlug={currentSlug} clientName={displayName} onBack={() => navigate("/ecommerce")} />;
      }
      // Leadgen
      if (currentSlug === null) {
        return (
          <AMOverview
            amId={auth.amId!}
            amName={auth.name}
            clients={auth.clients || []}
            assignedSlugs={assignedSlugs}
            onSelectClient={handleSelectClient}
          />
        );
      }
      const displayName = auth.clients?.find((c) => c.slug === currentSlug)?.display_name || currentSlug;
      return <Index clientName={displayName} clientSlug={currentSlug} isAdmin initialSection={initialSection} onBack={() => navigate("/leadgen")} />;
    }

    // Admin
    if (section === "ecommerce") {
      if (currentSlug === null) {
        return (
          <EcommerceOverview
            clients={adminClients}
            onSelectClient={handleSelectClient}
            userType="admin"
            userId={auth.adminName || auth.name}
            userDisplayName={auth.adminName || auth.name}
          />
        );
      }
      const displayName = adminClients.find((c) => c.slug === currentSlug)?.display_name || currentSlug;
      return <EcommerceClientPage clientSlug={currentSlug} clientName={displayName} onBack={() => navigate("/ecommerce")} />;
    }
    // Leadgen
    if (currentSlug === null) {
      return <AdminOverview onSelectClient={handleSelectClient} onClientsChange={handleAdminClientsChange} />;
    }
    const displayName = adminClients.find((c) => c.slug === currentSlug)?.display_name || currentSlug;
    return <Index clientName={displayName} clientSlug={currentSlug} isAdmin initialSection={initialSection} onBack={() => navigate("/leadgen")} />;
  };

  const isMobile = useIsMobile();
  const showNotifications = role === "am" && !!auth.amId;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {!isMobile && (
          <AppSidebar
            section={section === "creative" ? "leadgen" : section}
            currentSlug={currentSlug}
            role={role}
            userName={userName}
            amId={auth.amId}
            subView={subView}
          />
        )}
        <div className="flex-1 flex flex-col min-w-0">
          <main className={isMobile ? "flex-1 pb-16" : "flex-1"}>
            {renderContent()}
          </main>
        </div>
        {isMobile && <MobileBottomNav showNotifications={showNotifications} />}
      </div>
    </SidebarProvider>
  );
}

export default ClientDashboard;
