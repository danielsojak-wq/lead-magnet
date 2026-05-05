import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getActorDisplayLabel } from "@/lib/session-actor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { LogIn, MessageSquare, RefreshCw, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ActivityEvent {
  id: string;
  event_type: string;
  description: string | null;
  actor: string;
  created_at: string;
}

interface Props {
  clientSlug: string;
  clientName: string;
  children: React.ReactNode;
}

type ActorFilter = "all" | "client" | "admin" | "am" | "marketing";

const formatDateTime = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("cs-CZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
};

const getEventIcon = (eventType: string) => {
  switch (eventType) {
    case "login":
      return <LogIn className="h-4 w-4 text-primary" />;
    case "review":
      return <RefreshCw className="h-4 w-4 text-orange-500" />;
    case "note":
      return <MessageSquare className="h-4 w-4 text-primary" />;
    default:
      return <ClipboardList className="h-4 w-4 text-muted-foreground" />;
  }
};

const getActorCategory = (actor: string): ActorFilter => {
  if (actor === "admin") return "admin";
  if (actor.startsWith("am:")) return "am";
  if (actor.startsWith("marketing:")) return "marketing";
  return "client";
};

const FILTER_OPTIONS: { value: ActorFilter; label: string }[] = [
  { value: "all", label: "Vše" },
  { value: "client", label: "Klient" },
  { value: "admin", label: "Admin" },
  { value: "am", label: "AM" },
  { value: "marketing", label: "Marketing" },
];

export function ClientActivityDialog({ clientSlug, clientName, children }: Props) {
  const [actorFilter, setActorFilter] = useState<ActorFilter>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["client-activity", clientSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_activity_log" as any)
        .select("*")
        .eq("client_slug", clientSlug)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as ActivityEvent[];
    },
    staleTime: 1000 * 30,
  });

  // Determine which actor categories exist in the data
  const availableFilters = useMemo(() => {
    if (!data?.length) return new Set<ActorFilter>(["all"]);
    const cats = new Set<ActorFilter>(["all"]);
    for (const e of data) cats.add(getActorCategory(e.actor));
    return cats;
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (actorFilter === "all") return data;
    return data.filter((e) => getActorCategory(e.actor) === actorFilter);
  }, [data, actorFilter]);

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-heading)]">
            Aktivita – {clientName}
          </DialogTitle>
        </DialogHeader>

        {/* Actor filter chips */}
        {availableFilters.size > 2 && (
          <div className="flex flex-wrap gap-1.5 pb-1">
            {FILTER_OPTIONS.filter((f) => availableFilters.has(f.value)).map((f) => (
              <Badge
                key={f.value}
                variant={actorFilter === f.value ? "default" : "outline"}
                className="cursor-pointer text-xs select-none"
                onClick={() => setActorFilter(f.value)}
              >
                {f.label}
              </Badge>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : !filtered.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {data?.length ? "Žádné záznamy pro vybraného aktéra" : "Zatím žádná zaznamenaná aktivita"}
          </p>
        ) : (
          <div className="relative">
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
            <div className="space-y-3">
              {filtered.map((event) => (
                <div key={event.id} className="flex gap-3 relative">
                  <div className="shrink-0 mt-0.5 z-10 bg-card rounded-full p-0.5">
                    {getEventIcon(event.event_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{event.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(event.created_at)}
                      </span>
                      <span className="text-xs text-muted-foreground/60">
                        • {getActorDisplayLabel(event.actor)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
