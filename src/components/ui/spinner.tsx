import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  label?: string;
}

export function Spinner({ className, size = "md", label }: SpinnerProps) {
  const sizeMap = {
    sm: "h-5 w-5",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  const dotSize = {
    sm: "h-1 w-1",
    md: "h-1.5 w-1.5",
    lg: "h-2 w-2",
  };

  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <div className={cn("relative", sizeMap[size])}>
        {/* Outer ring */}
        <div
          className={cn(
            "absolute inset-0 rounded-full border-2 border-primary/20",
          )}
        />
        {/* Spinning arc */}
        <div
          className={cn(
            "absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin",
          )}
        />
        {/* Orbiting dots */}
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: "1.8s" }}>
          <div
            className={cn(
              "absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary",
              dotSize[size],
            )}
          />
        </div>
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: "1.8s", animationDelay: "0.6s" }}>
          <div
            className={cn(
              "absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent",
              dotSize[size],
            )}
          />
        </div>
      </div>
      {label && (
        <p className="text-sm text-muted-foreground animate-pulse">{label}</p>
      )}
    </div>
  );
}

/** Full-page centered spinner with optional message */
export function PageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Spinner size="lg" label={label} />
    </div>
  );
}
