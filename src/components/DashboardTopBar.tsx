import { useNavigate } from "react-router-dom";
import { Shield, Megaphone, LogOut } from "lucide-react";
import { HelpDialog } from "@/components/HelpDialog";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";

const SESSION_KEY = "dashboard_auth";

interface DashboardTopBarProps {
  role: "admin" | "am" | "marketing";
  userName: string;
}

export function DashboardTopBar({ role, userName }: DashboardTopBarProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    navigate("/");
  };

  const roleIcon = role === "marketing" ? Megaphone : Shield;
  const RoleIcon = roleIcon;
  const roleLabel = role === "admin" ? "Admin" : role === "am" ? userName : userName;
  const helpRole = role === "marketing" ? "admin" as const : role === "admin" ? "admin" as const : "account_manager" as const;

  return (
    <div className="sticky top-0 z-[60] bg-foreground text-background">
      <div className="px-3 sm:px-4 h-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="text-background hover:text-background hover:bg-background/10 h-7 w-7" />
          <span className="text-xs opacity-40 mx-0.5">|</span>
          <RoleIcon className="h-3.5 w-3.5 opacity-70 shrink-0" />
          <span className="text-xs font-medium opacity-70">{roleLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <HelpDialog role={helpRole} darkBar />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 sm:px-2 text-xs text-background hover:text-background hover:bg-background/10"
            onClick={handleLogout}
          >
            <LogOut className="h-3 w-3 sm:mr-1" />
            <span className="hidden sm:inline">Odhlásit</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
