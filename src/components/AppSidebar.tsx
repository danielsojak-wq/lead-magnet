import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, ShoppingCart, Home, LogOut, HelpCircle, Shield, Megaphone, Bell, Users, Sparkles } from "lucide-react";
import performindLogo from "@/assets/performind-logo.png";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { HelpDialog } from "@/components/HelpDialog";

const SESSION_KEY = "dashboard_auth";

interface AppSidebarProps {
  section: "leadgen" | "ecommerce";
  currentSlug: string | null;
  role: "admin" | "am" | "marketing";
  userName: string;
  amId?: string;
  subView?: string | null;
}

export function AppSidebar({
  section,
  currentSlug,
  role,
  userName,
  amId,
  subView,
}: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();

  const showEcommerce = role === "admin" || role === "am";
  const showCreative = role === "admin" || role === "am";
  const showClientsHub = role === "admin" || role === "am";
  const RoleIcon = role === "marketing" ? Megaphone : Shield;
  const helpRole = role === "marketing" ? "admin" as const : role === "admin" ? "admin" as const : "account_manager" as const;

  const handleLogout = async () => {
    localStorage.removeItem(SESSION_KEY);
    await supabase.auth.signOut().catch(() => {});
    navigate("/");
  };

  const isHome = subView === "home";
  const isClientsHub = subView === "clients-hub";
  const isLeadgen = section === "leadgen" && !isHome && !subView;
  const isEcommerce = section === "ecommerce" && !isHome && subView !== "digest";
  const isDigest = subView === "digest";
  const isSettingsClients = subView === "settings-clients";
  const isCreative = subView === "creative";
  const hasSettings = (role === "am" && !!amId) || role === "admin";

  // Brand kit: active = #4f11ff pill, icons get lime #b0f221
  const activeClass = "bg-[#4f11ff] text-white font-semibold rounded-xl shadow-sm [&_svg]:text-[#b0f221]";
  const inactiveClass = "text-[#070707]/55 hover:text-[#070707] hover:bg-white/50 rounded-xl transition-colors duration-150";

  return (
    <Sidebar collapsible="icon">
      {/* Header — logo */}
      <SidebarHeader className="p-3">
        <div className="flex items-center justify-center rounded-xl bg-white px-3 py-2.5 shadow-sm">
          {collapsed ? (
            <img src={performindLogo} alt="Performind" className="h-5 w-5 object-contain" />
          ) : (
            <img src={performindLogo} alt="Performind" className="h-7 w-full object-contain" />
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 gap-0.5">
        {/* Obecné */}
        <SidebarGroup className="p-0 pb-3">
          {!collapsed && (
            <SidebarGroupLabel className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-[#4f11ff]/40">
              Obecné
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigate("/home")}
                  className={isHome ? activeClass : inactiveClass}
                  tooltip="Domů"
                >
                  <Home className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span>Domů</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
              {showClientsHub && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => navigate("/clients")}
                    className={isClientsHub ? activeClass : inactiveClass}
                    tooltip="Klienti"
                  >
                    <Users className="h-4 w-4 flex-shrink-0" />
                    {!collapsed && <span>Klienti</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Výkonnost */}
        <SidebarGroup className="p-0 pb-3">
          {!collapsed && (
            <SidebarGroupLabel className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-[#4f11ff]/40">
              Výkonnost
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => navigate("/leadgen")}
                  className={isLeadgen ? activeClass : inactiveClass}
                  tooltip="Leadgen"
                >
                  <BarChart3 className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span>Leadgen</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
              {showEcommerce && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => navigate("/ecommerce")}
                    className={isEcommerce ? activeClass : inactiveClass}
                    tooltip="Ecommerce"
                  >
                    <ShoppingCart className="h-4 w-4 flex-shrink-0" />
                    {!collapsed && <span>Ecommerce</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {showCreative && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => navigate("/creative")}
                    className={isCreative ? activeClass : inactiveClass}
                    tooltip="Creative Lab"
                  >
                    <Sparkles className="h-4 w-4 flex-shrink-0" />
                    {!collapsed && <span>Creative Lab</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Nastavení */}
        {hasSettings && (
          <SidebarGroup className="p-0 pb-3">
            {!collapsed && (
              <SidebarGroupLabel className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-[#4f11ff]/40">
                Nastavení
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {role === "am" && amId && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => navigate("/settings/clients")}
                      className={isSettingsClients ? activeClass : inactiveClass}
                      tooltip="Nastavit klienty"
                    >
                      <Users className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span>Nastavit klienty</span>}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {role === "admin" && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => navigate("/settings/team")}
                      className={subView === "settings-team" ? activeClass : inactiveClass}
                      tooltip="Správa týmu"
                    >
                      <Users className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span>Správa týmu</span>}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {role === "am" && amId && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => navigate("/ecommerce/notifications")}
                      className={isDigest ? activeClass : inactiveClass}
                      tooltip="Notifikace"
                    >
                      <Bell className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span>Notifikace</span>}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="px-2 py-3 border-t border-[#4f11ff]/10">
        {/* User chip */}
        {!collapsed ? (
          <div className="mx-1 mb-2 flex items-center gap-2.5 rounded-xl bg-white/50 px-3 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4f11ff]/10 flex-shrink-0">
              <RoleIcon className="h-3.5 w-3.5 text-[#4f11ff]" />
            </div>
            <span className="text-xs font-medium text-[#070707] truncate">{userName}</span>
            {/* lime accent dot */}
            <span className="ml-auto h-2 w-2 rounded-full bg-[#b0f221] flex-shrink-0" />
          </div>
        ) : (
          <div className="flex justify-center mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/60">
              <RoleIcon className="h-3.5 w-3.5 text-[#4f11ff]" />
            </div>
          </div>
        )}

        <SidebarMenu>
          <SidebarMenuItem>
            <HelpDialog role={helpRole}>
              <SidebarMenuButton tooltip="Nápověda" asChild className={inactiveClass}>
                <button type="button">
                  <HelpCircle className="h-4 w-4" />
                  {!collapsed && <span>Nápověda</span>}
                </button>
              </SidebarMenuButton>
            </HelpDialog>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              tooltip="Odhlásit"
              className={`${inactiveClass} hover:!text-red-500`}
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Odhlásit</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
