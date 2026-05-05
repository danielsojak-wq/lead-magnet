import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, LogOut, ChevronDown, LayoutDashboard, BarChart3, ShoppingCart } from "lucide-react";
import { HelpDialog } from "@/components/HelpDialog";
import { ClientLogo } from "@/components/ClientLogo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface ClientInfo {
  slug: string;
  display_name: string | null;
  name: string;
}

interface AdminBarProps {
  clients: ClientInfo[];
  currentSlug: string | null;
  onSwitch: (slug: string | null) => void;
  section?: "leadgen" | "ecommerce";
  onSectionChange?: (section: "leadgen" | "ecommerce") => void;
}

const SESSION_KEY = "dashboard_auth";

export function AdminBar({ clients, currentSlug, onSwitch, section = "leadgen", onSectionChange }: AdminBarProps) {
  const navigate = useNavigate();
  const currentClient = currentSlug ? clients.find((c) => c.slug === currentSlug) : null;

  const handleSwitch = (client: ClientInfo) => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      const auth = JSON.parse(stored);
      auth.slug = client.slug;
      auth.name = client.display_name || client.name;
      localStorage.setItem(SESSION_KEY, JSON.stringify(auth));
    }
    onSwitch(client.slug);
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    navigate("/");
  };

  return (
    <div className="sticky top-0 z-[60] bg-foreground text-background">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-10 flex items-center justify-between">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <Shield className="h-3.5 w-3.5 opacity-70 shrink-0" />
          <span className="text-xs font-medium opacity-70 hidden sm:inline">Admin</span>
          <span className="text-xs opacity-40 mx-0.5 sm:mx-1">|</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-1.5 sm:px-2 text-xs text-background hover:text-background hover:bg-background/10 max-w-[120px] sm:max-w-none"
              >
                <span className="truncate">{currentClient ? (currentClient.display_name || currentClient.name) : "Přehled"}</span>
                <ChevronDown className="h-3 w-3 ml-1 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[180px]">
              <DropdownMenuItem
                onClick={() => onSwitch(null)}
                className={currentSlug === null ? "bg-accent" : ""}
              >
                <LayoutDashboard className="h-4 w-4 mr-2 opacity-60" />
                Přehled klientů
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {[...clients].sort((a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name, "cs")).map((client) => (
                <DropdownMenuItem
                  key={client.slug}
                  onClick={() => handleSwitch(client)}
                  className={client.slug === currentSlug ? "bg-accent" : ""}
                >
                  <ClientLogo slug={client.slug} name={client.display_name || client.name} className="h-4 w-4 object-contain mr-2" />
                  {client.display_name || client.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-1">
          {onSectionChange && (
            <div className="flex items-center bg-background/10 rounded-md p-0.5 mr-1">
              <Button
                variant="ghost"
                size="sm"
                className={`h-6 px-2 text-[10px] rounded-sm ${section === "leadgen" ? "bg-background/20 text-background" : "text-background/60 hover:text-background hover:bg-transparent"}`}
                onClick={() => { onSectionChange("leadgen"); onSwitch(null); }}
              >
                <BarChart3 className="h-3 w-3 mr-1" />
                Leadgen
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-6 px-2 text-[10px] rounded-sm ${section === "ecommerce" ? "bg-background/20 text-background" : "text-background/60 hover:text-background hover:bg-transparent"}`}
                onClick={() => { onSectionChange("ecommerce"); onSwitch(null); }}
              >
                <ShoppingCart className="h-3 w-3 mr-1" />
                Ecommerce
              </Button>
            </div>
          )}
          <HelpDialog role="admin" darkBar />
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
