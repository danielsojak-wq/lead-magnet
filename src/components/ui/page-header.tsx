import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ElementType;
}

interface PageHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  actions?: React.ReactNode;
  maxWidth?: string;
}

export function PageHeader({ breadcrumbs, actions, maxWidth = "max-w-6xl" }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border/50">
      <div className={`${maxWidth} mx-auto px-4 sm:px-6 lg:px-8 h-[56px] flex items-center gap-3`}>
        <nav className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
          {breadcrumbs.map((item, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={i} className="flex items-center gap-1 min-w-0">
                {i > 0 && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                )}
                {item.icon && (
                  <item.icon
                    className={`h-3.5 w-3.5 flex-shrink-0 ${isLast ? "text-foreground/60" : "text-muted-foreground/60"}`}
                  />
                )}
                {isLast ? (
                  <span className="text-sm font-semibold truncate">{item.label}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => item.href && navigate(item.href)}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate cursor-pointer"
                  >
                    {item.label}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>
    </header>
  );
}
