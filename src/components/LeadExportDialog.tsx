import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { DateRange } from "react-day-picker";

interface LeadExportDialogProps {
  clientSlug: string;
  children: React.ReactNode;
}

type ExportFilter = "all" | "unreviewed" | "reviewed" | "qualified" | "not_qualified" | "duplicates";

interface LeadRow {
  submissionId: string;
  date: string;
  firstName: string;
  lastName?: string;
  phone: string;
  qualified: string;
  customFields?: Record<string, string>;
  isDuplicate?: boolean;
  source?: string;
}

function getStatusLabel(qualified: string): string {
  if (qualified === "ano") return "Kvalifikovaný";
  if (qualified === "ne") return "Nekvalifikovaný";
  if (qualified === "duplicita" || qualified === "duplicate") return "Duplicita";
  if (!qualified) return "Nezpracovaný";
  return qualified;
}

function formatPhone(phone: string): string {
  if (!phone) return "";
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
}

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

const REVIEWED_STATUSES = new Set(["ano", "ne", "duplicita", "duplicate", "relevant", "irrelevant"]);

export function LeadExportDialog({ clientSlug, children }: LeadExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<ExportFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [availableSources, setAvailableSources] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set()); // empty = all
  const [sourcesLoaded, setSourcesLoaded] = useState(false);

  // Load available sources when dialog opens
  useEffect(() => {
    if (!open || sourcesLoaded) return;
    supabase.functions.invoke("fetch-leads-detail", {
      body: { client_slug: clientSlug, filter: "all" },
    }).then(({ data }) => {
      const sources: string[] = data?.sources || [];
      setAvailableSources(sources);
      setSourcesLoaded(true);
    }).catch(() => {});
  }, [open, clientSlug, sourcesLoaded]);

  // Reset when slug changes
  useEffect(() => {
    setSourcesLoaded(false);
    setSelectedSources(new Set());
  }, [clientSlug]);

  const handleExport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-leads-detail", {
        body: { client_slug: clientSlug, filter: "all" },
      });
      if (error) throw error;

      let leads: LeadRow[] = Array.isArray(data) ? data : (data as { leads: LeadRow[] }).leads;

      // Status filter
      if (filter !== "all") {
        leads = leads.filter((l) => {
          const q = l.qualified?.toLowerCase() || "";
          switch (filter) {
            case "unreviewed":
              return !REVIEWED_STATUSES.has(q);
            case "reviewed":
              return REVIEWED_STATUSES.has(q);
            case "qualified":
              return q === "ano" || q === "relevant";
            case "not_qualified":
              return q === "ne" || q === "irrelevant";
            case "duplicates":
              return q === "duplicita" || q === "duplicate";
            default:
              return true;
          }
        });
      }

      // Source filter (empty set = all)
      if (selectedSources.size > 0) {
        leads = leads.filter((l) => l.source && selectedSources.has(l.source));
      }

      // Date filter
      if (dateRange?.from) {
        const from = new Date(dateRange.from);
        from.setHours(0, 0, 0, 0);
        const to = dateRange.to ? new Date(dateRange.to) : new Date(dateRange.from);
        to.setHours(23, 59, 59, 999);
        leads = leads.filter((l) => {
          try {
            const d = new Date(l.date);
            return d >= from && d <= to;
          } catch {
            return true;
          }
        });
      }

      // Collect all custom field keys
      const customKeys = new Set<string>();
      for (const l of leads) {
        if (l.customFields) {
          for (const k of Object.keys(l.customFields)) customKeys.add(k);
        }
      }
      const customKeyArr = [...customKeys];

      // Build CSV
      const headers = ["Datum", "Jméno", "Telefon", "Status", "Zdroj", "Duplicita", ...customKeyArr];
      const rows = leads.map((l) => {
        const name = l.lastName ? `${l.firstName} ${l.lastName}` : l.firstName;
        const row = [
          l.date,
          name,
          formatPhone(l.phone),
          getStatusLabel(l.qualified),
          l.source || "",
          l.isDuplicate ? "Ano" : "",
          ...customKeyArr.map((k) => l.customFields?.[k] || ""),
        ];
        return row.map(escapeCsv).join(",");
      });

      const csv = [headers.map(escapeCsv).join(","), ...rows].join("\n");
      const BOM = "\uFEFF";
      const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const filterLabels: Record<ExportFilter, string> = {
        all: "vse", unreviewed: "nezpracovane", reviewed: "posouzene",
        qualified: "kvalifikovane", not_qualified: "nekvalifikovane", duplicates: "duplicity",
      };
      a.download = `poptavky_${clientSlug}_${filterLabels[filter]}_${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      setOpen(false);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setLoading(false);
    }
  };

  const dateLabel = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, "d. M. yyyy", { locale: cs })} – ${format(dateRange.to, "d. M. yyyy", { locale: cs })}`
      : format(dateRange.from, "d. M. yyyy", { locale: cs })
    : "Všechna období";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Export poptávek</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Typ poptávek</Label>
            <Select value={filter} onValueChange={(v) => setFilter(v as ExportFilter)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny</SelectItem>
                <SelectItem value="unreviewed">Nezpracované</SelectItem>
                <SelectItem value="reviewed">Posouzené</SelectItem>
                <SelectItem value="qualified">Kvalifikované</SelectItem>
                <SelectItem value="not_qualified">Nekvalifikované</SelectItem>
                <SelectItem value="duplicates">Duplicity</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {availableSources.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-sm">Zdroj poptávek</Label>
              <div className="space-y-2 rounded-md border border-border p-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="source-mode"
                    checked={selectedSources.size === 0}
                    onChange={() => setSelectedSources(new Set())}
                    className="accent-primary"
                  />
                  <span className="font-medium">Vše</span>
                </label>
                <div className="border-t border-border pt-2 space-y-2">
                  {availableSources.map((source) => (
                    <label key={source} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={selectedSources.has(source)}
                        onCheckedChange={() => {
                          setSelectedSources((prev) => {
                            const next = new Set(prev);
                            if (next.has(source)) {
                              next.delete(source);
                            } else {
                              next.add(source);
                            }
                            return next;
                          });
                        }}
                      />
                      <span>{source}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm">Období</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-sm h-9 font-normal">
                  <CalendarIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                  {dateLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  locale={cs}
                  numberOfMonths={1}
                />
                <div className="px-3 pb-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    onClick={() => {
                      setDateRange(undefined);
                      setCalendarOpen(false);
                    }}
                  >
                    Vymazat
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs ml-auto"
                    onClick={() => setCalendarOpen(false)}
                  >
                    Potvrdit
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <Button onClick={handleExport} disabled={loading} className="w-full gap-2">
            {loading ? <Spinner size="sm" /> : <Download className="h-4 w-4" />}
            Exportovat CSV
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
