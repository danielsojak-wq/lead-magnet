import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeroPanelProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * HeroPanel — stěžejní vizuální blok Performind Studia.
 * Gradient primary → lime, blurred glow accents, prominentní ikona.
 * Použití: hlavní výsledek / shrnutí na dashboardu sekce.
 */
export function HeroPanel({ icon: Icon, title, subtitle, actions, children, className }: HeroPanelProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-[#b0f221]/10 p-5 sm:p-6 shadow-lg",
        className
      )}
    >
      <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-10 h-60 w-60 rounded-full bg-[#b0f221]/15 blur-3xl pointer-events-none" />
      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-primary text-primary-foreground shadow-md shrink-0">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold tracking-tight truncate">{title}</h2>
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </section>
  );
}