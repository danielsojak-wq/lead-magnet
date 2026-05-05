import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  subtitle?: string;
  change?: number | null;
  changeLabel?: string;
  /** When true, negative change = good (green), positive = bad (red). For cost metrics. */
  invertChange?: boolean;
  /** When true, change is always shown in neutral color (no green/red). */
  neutralChange?: boolean;
}

export function StatCard({ title, value, icon: Icon, subtitle, change, changeLabel, invertChange, neutralChange }: StatCardProps) {
  const noData = change === null;
  const hasChange = change !== undefined && change !== null && isFinite(change);
  const isUp = hasChange && change > 0;
  const isDown = hasChange && change < 0;
  const isZero = hasChange && change === 0;

  const isPositive = neutralChange ? false : invertChange ? isDown : isUp;
  const isNegative = neutralChange ? false : invertChange ? isUp : isDown;
  const isNeutral = neutralChange || isZero;

  return (
     <Card className="border border-border/50 shadow-sm bg-card hover:shadow-md transition-shadow">
       <CardContent className="p-3 sm:p-6">
         <div className="flex items-start justify-between gap-2">
           <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
             <p className="text-[11px] sm:text-sm text-muted-foreground leading-tight">{title}</p>
             <p className="text-lg sm:text-2xl font-bold tracking-tight font-[family-name:var(--font-heading)]">
               {value}
             </p>
             {hasChange ? (
               <div className="flex items-center gap-1 flex-wrap">
                 {isUp && <TrendingUp className={cn("h-3 w-3 sm:h-3.5 sm:w-3.5", isPositive ? "text-accent-text" : isNegative ? "text-destructive" : "text-muted-foreground")} />}
                 {isDown && <TrendingDown className={cn("h-3 w-3 sm:h-3.5 sm:w-3.5", isPositive ? "text-accent-text" : isNegative ? "text-destructive" : "text-muted-foreground")} />}
                 {isZero && <Minus className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />}
                 <span
                   className={cn(
                     "text-[11px] sm:text-xs font-medium",
                     isPositive && "text-accent-text",
                     isNegative && "text-destructive",
                     isNeutral && "text-muted-foreground"
                   )}
                 >
                   {change > 0 ? "+" : ""}{change.toFixed(1)} %
                 </span>
                 {changeLabel && (
                   <span className="text-[11px] sm:text-xs text-muted-foreground">
                     vs {changeLabel}
                   </span>
                 )}
               </div>
             ) : noData && changeLabel ? (
               <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">Data pro porovnání nejsou k dispozici</p>
             ) : subtitle ? (
               <p className="text-[11px] sm:text-xs text-muted-foreground">{subtitle}</p>
             ) : null}
           </div>
           <div className="rounded-lg bg-primary/10 p-2 sm:p-2.5 shrink-0">
             <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
           </div>
         </div>
       </CardContent>
     </Card>
  );
}
