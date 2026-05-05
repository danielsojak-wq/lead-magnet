import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { getSessionActor, getActorDisplayLabel } from "@/lib/session-actor";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquarePlus,
  PhoneOff,
  Send,
  StickyNote,
  Check,
  X,
  RotateCcw,
  Trash2,
  User,
  Phone,
  Calendar,
  AlertTriangle,
  ArrowLeft,
  Mail,
  Building2,
  Copy,
  RefreshCw,
  Hash,
  Tag,
  Car,
  MapPin,
  Globe,
  Briefcase,
  Package,
  Star,
  DollarSign,
  ShoppingCart,
  FileText,
  Clock,
  Truck,
  Home,
  Users,
  Layers,
  type LucideIcon,
} from "lucide-react";

interface LeadDetail {
  submissionId: string;
  date: string;
  firstName: string;
  lastName?: string;
  phone: string;
  qualified: string;
  customFields?: Record<string, string>;
  isDuplicate?: boolean;
  duplicateOfId?: string;
  source?: string;
}

interface TimelineEvent {
  id: string;
  event_type: "note" | "status_change";
  content: string | null;
  status: string | null;
  created_at: string;
  actor?: string;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto p-1 rounded hover:bg-muted"
      title="Kopírovat"
    >
      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </button>
  );
}

const ICON_MAP: Record<string, LucideIcon> = {
  hash: Hash, tag: Tag, car: Car, "map-pin": MapPin, globe: Globe,
  briefcase: Briefcase, package: Package, star: Star, dollar: DollarSign,
  cart: ShoppingCart, file: FileText, clock: Clock, truck: Truck,
  home: Home, users: Users, layers: Layers,
};

interface LeadDetailDrawerProps {
  lead: LeadDetail | null;
  clientSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReview?: (submissionId: string, status: "relevant" | "irrelevant" | "duplicate" | "unreviewed") => void;
  reviewPending?: boolean;
  onNavigateToDuplicate?: (submissionId: string) => void;
  onNavigateBack?: () => void;
  showSource?: boolean;
  customFieldIcons?: Record<string, string>;
}

const formatDate = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return dateStr;
  }
};

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

const formatPhone = (phone: string) => {
  if (!phone) return "—";
  const cleaned = phone.replace(/\D/g, "");
  if (!cleaned) return phone;
  const groups: string[] = [];
  let i = cleaned.length;
  while (i > 0) {
    const start = Math.max(0, i - 3);
    groups.unshift(cleaned.slice(start, i));
    i = start;
  }
  const formatted = groups.join(" ");
  return phone.startsWith("+") || cleaned.length >= 11 ? `+${formatted}` : formatted;
};

export function LeadDetailDrawer({ lead, clientSlug, open, onOpenChange, onReview, reviewPending, onNavigateToDuplicate, onNavigateBack, showSource, customFieldIcons }: LeadDetailDrawerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [noteText, setNoteText] = useState("");

  const timelineQuery = useQuery({
    queryKey: ["lead-timeline", clientSlug, lead?.submissionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_timeline" as any)
        .select("*")
        .eq("client_slug", clientSlug)
        .eq("submission_id", lead!.submissionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as TimelineEvent[];
    },
    enabled: !!lead && open,
    staleTime: 1000 * 30,
  });

  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const actor = getSessionActor();
      const { error } = await supabase
        .from("lead_timeline" as any)
        .insert({
          client_slug: clientSlug,
          submission_id: lead!.submissionId,
          event_type: "note",
          content,
          actor,
        } as any);
      if (error) throw error;
    },
    onSuccess: (_, content) => {
      queryClient.invalidateQueries({ queryKey: ["lead-timeline", clientSlug, lead?.submissionId] });
      const actor = getSessionActor();
      const leadName = lead ? (lead.lastName ? `${lead.firstName} ${lead.lastName}` : lead.firstName) : "";
      logActivity(clientSlug, "note", `Poznámka u ${leadName}: ${content.substring(0, 50)}`, actor);
      toast({ description: "Poznámka přidána" });
    },
    onError: () => {
      toast({ variant: "destructive", description: "Chyba při ukládání" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("lead_timeline" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-timeline", clientSlug, lead?.submissionId] });
      toast({ description: "Poznámka smazána" });
    },
    onError: () => {
      toast({ variant: "destructive", description: "Chyba při mazání" });
    },
  });

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addNoteMutation.mutate(noteText.trim());
    setNoteText("");
  };

  const handleQuickNote = (text: string) => {
    addNoteMutation.mutate(text);
  };

  const getEventIcon = (event: TimelineEvent) => {
    if (event.event_type === "status_change") {
      return <RefreshCw className="h-4 w-4 text-orange-500" />;
    }
    return <StickyNote className="h-4 w-4 text-primary" />;
  };

  if (!lead) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-2">
            {onNavigateBack && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                onClick={onNavigateBack}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <SheetTitle className="font-[family-name:var(--font-heading)]">Detail poptávky</SheetTitle>
          </div>
        </SheetHeader>

        {/* Lead Info */}
        <div className="space-y-3 pb-4 border-b border-border">
          <div className="flex items-center gap-2 group">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {lead.lastName ? `${lead.firstName} ${lead.lastName}` : lead.firstName}
            </span>
            <CopyBtn text={lead.lastName ? `${lead.firstName} ${lead.lastName}` : lead.firstName} />
          </div>
          <div className="flex items-center gap-2 group">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{formatPhone(lead.phone)}</span>
            <CopyBtn text={formatPhone(lead.phone)} />
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{formatDate(lead.date)}</span>
            {showSource && lead.source && (
              <Badge variant="outline" className="text-muted-foreground border-border/60 text-[10px] font-normal ml-auto">
                {lead.source}
              </Badge>
            )}
          </div>

          {/* Custom fields */}
          {lead.customFields && Object.keys(lead.customFields).length > 0 && (
            <>
              {Object.entries(lead.customFields).map(([key, value]) => {
                // Priority: built-in icons > config icon > text label
                const builtinIcon = key.toLowerCase() === "email" ? Mail
                  : key.toLowerCase() === "firma" ? Building2
                  : null;
                const configIconName = customFieldIcons?.[key];
                const ConfigIcon = configIconName ? ICON_MAP[configIconName] : null;
                const IconComp = builtinIcon || ConfigIcon;
                return (
                  <div key={key} className="flex items-center gap-2 group">
                    {IconComp ? (
                      <IconComp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <span className="text-xs text-muted-foreground w-4 text-center">•</span>
                    )}
                    {!builtinIcon && <span className="text-xs text-muted-foreground">{key}</span>}
                    <span className="text-sm">{value}</span>
                  </div>
                );
              })}
            </>
          )}

          <div className="flex flex-wrap gap-1.5">
            {lead.qualified === "ano" ? (
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">Kvalifikovaná</Badge>
            ) : lead.qualified === "ne" ? (
              <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 text-xs">Nekvalifikovaná</Badge>
            ) : (lead.qualified === "duplicita" || lead.qualified === "duplicate") ? (
              <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50 text-xs">Duplicita</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-xs">Neposouzeno</Badge>
            )}
            {lead.isDuplicate && (
              <Badge
                variant="outline"
                className={`text-orange-600 border-orange-200 bg-orange-50 text-xs gap-1 ${
                  lead.duplicateOfId && onNavigateToDuplicate ? "cursor-pointer hover:bg-orange-100 transition-colors" : ""
                }`}
                onClick={() => {
                  if (lead.duplicateOfId && onNavigateToDuplicate) {
                    onNavigateToDuplicate(lead.duplicateOfId);
                  }
                }}
              >
                <AlertTriangle className="h-3 w-3" />
                Potenciální duplicita – zobrazit originál
              </Badge>
            )}
          </div>
        </div>

        {/* Review Actions */}
        {onReview && (
          <div className="py-4 border-b border-border space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Posouzení</p>
            <div className="flex flex-wrap gap-2">
              {lead.qualified === "ano" ? (
                <>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" onClick={() => onReview(lead.submissionId, "irrelevant")} disabled={reviewPending}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />Změnit na nekvalifikovanou
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onReview(lead.submissionId, "unreviewed" as any)} disabled={reviewPending}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />K posouzení
                  </Button>
                </>
              ) : lead.qualified === "ne" ? (
                <>
                  <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700" onClick={() => onReview(lead.submissionId, "relevant")} disabled={reviewPending}>
                     <RotateCcw className="h-3.5 w-3.5 mr-1" />Změnit na kvalifikovanou
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onReview(lead.submissionId, "unreviewed" as any)} disabled={reviewPending}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />K posouzení
                  </Button>
                </>
              ) : (lead.qualified === "duplicita" || lead.qualified === "duplicate") ? (
                <>
                  <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700" onClick={() => onReview(lead.submissionId, "relevant")} disabled={reviewPending}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />Změnit na kvalifikovanou
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onReview(lead.submissionId, "unreviewed" as any)} disabled={reviewPending}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />K posouzení
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700" onClick={() => onReview(lead.submissionId, "relevant")} disabled={reviewPending}>
                     <Check className="h-4 w-4 mr-1" />Kvalifikovaná
                   </Button>
                   <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" onClick={() => onReview(lead.submissionId, "irrelevant")} disabled={reviewPending}>
                     <X className="h-4 w-4 mr-1" />Nekvalifikovaná
                  </Button>
                  {lead.isDuplicate && (
                    <Button size="sm" variant="outline" className="text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700" onClick={() => onReview(lead.submissionId, "duplicate")} disabled={reviewPending}>
                      <Copy className="h-4 w-4 mr-1" />Duplicita
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Add Note */}
        <div className="py-4 border-b border-border space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Přidat poznámku</p>
          <Textarea
            placeholder="Napište poznámku..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="min-h-[80px] text-sm resize-none"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleAddNote}
              disabled={!noteText.trim() || addNoteMutation.isPending}
            >
              <Send className="h-3.5 w-3.5 mr-1" />
              Uložit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700"
              onClick={() => handleQuickNote("Nedovoláno")}
              disabled={addNoteMutation.isPending}
            >
              <PhoneOff className="h-3.5 w-3.5 mr-1" />
              Nedovoláno
            </Button>
          </div>
        </div>

        {/* Timeline */}
        <div className="py-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Časová osa</p>
          {timelineQuery.isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Spinner size="sm" />
            </div>
          ) : !timelineQuery.data?.length ? (
            <div className="flex flex-col items-center py-8 text-muted-foreground">
              <MessageSquarePlus className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Zatím žádné záznamy</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
              <div className="space-y-4">
                {timelineQuery.data.map((event) => (
                  <div key={event.id} className="flex gap-3 relative group">
                    <div className="shrink-0 mt-0.5 z-10 bg-card rounded-full p-0.5">
                      {getEventIcon(event)}
                    </div>
                    <div className="flex-1 min-w-0">
                      {event.event_type === "status_change" ? (
                        <p className="text-xs font-medium text-muted-foreground italic">{event.content}</p>
                      ) : (
                        <p className="text-sm">{event.content}</p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(event.created_at)}
                        </span>
                        {event.actor && (
                          <span className="text-xs text-muted-foreground/60">
                            • {getActorDisplayLabel(event.actor)}
                          </span>
                        )}
                      </div>
                    </div>
                    {event.event_type === "note" && (
                      <button
                        onClick={() => deleteNoteMutation.mutate(event.id)}
                        disabled={deleteNoteMutation.isPending}
                        className="shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                        title="Smazat"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
