import { useNavigate, useLocation } from "react-router-dom";
import { Home, BarChart3, ShoppingCart, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileBottomNavProps {
  showNotifications?: boolean;
}

const navItems = [
  { path: "/home", label: "Domů", icon: Home, match: "/home" },
  { path: "/leadgen", label: "Leadgen", icon: BarChart3, match: "/leadgen" },
  { path: "/ecommerce", label: "Ecommerce", icon: ShoppingCart, match: "/ecommerce" },
];

export function MobileBottomNav({ showNotifications }: MobileBottomNavProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const items = showNotifications
    ? [...navItems, { path: "/ecommerce/notifications", label: "Notifikace", icon: Bell, match: "/ecommerce/notifications" }]
    : navItems;

  const isActive = (match: string) => {
    if (match === "/ecommerce/notifications") return pathname === match;
    if (match === "/ecommerce") return pathname.startsWith("/ecommerce") && pathname !== "/ecommerce/notifications";
    if (match === "/leadgen") return pathname.startsWith("/leadgen");
    return pathname === match;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background md:hidden">
      <div className="flex items-center justify-around h-14">
        {items.map((item) => {
          const active = isActive(item.match);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] transition-colors",
                active
                  ? "text-primary font-semibold"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", active && "text-primary")} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      {/* Safe area for phones with home indicator */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
