import { useState } from "react";
import { format, startOfMonth, endOfMonth, subDays, subMonths, startOfYear } from "date-fns";
import { cs } from "date-fns/locale";
import { CalendarIcon, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DateRange } from "react-day-picker";

interface Props {
  dateRange: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
}

interface Preset {
  label: string;
  getRange: () => DateRange;
  sub?: Preset[];
}

function makePresets(): Preset[] {
  const today = new Date();
  const yesterday = subDays(today, 1);

  return [
    {
      label: "Dnes",
      getRange: () => ({ from: today, to: today }),
    },
    {
      label: "Včera",
      getRange: () => ({ from: yesterday, to: yesterday }),
    },
    {
      label: "Posledních 7 dní",
      getRange: () => ({ from: subDays(today, 6), to: today }),
    },
    {
      label: "Posledních 30 dní",
      getRange: () => ({ from: subDays(today, 29), to: today }),
    },
    {
      label: "Tento měsíc",
      getRange: () => ({ from: startOfMonth(today), to: today }),
    },
    {
      label: "Minulý měsíc",
      getRange: () => {
        const prev = subMonths(today, 1);
        return { from: startOfMonth(prev), to: endOfMonth(prev) };
      },
    },
    {
      label: "Posledních 3 měs.",
      getRange: () => {
        const end = endOfMonth(subMonths(today, 1));
        return { from: startOfMonth(subMonths(today, 3)), to: end };
      },
    },
    {
      label: "Posledních 6 měs.",
      getRange: () => {
        const end = endOfMonth(subMonths(today, 1));
        return { from: startOfMonth(subMonths(today, 6)), to: end };
      },
    },
    {
      label: "Posledních 12 měs.",
      getRange: () => {
        const end = endOfMonth(subMonths(today, 1));
        return { from: startOfMonth(subMonths(today, 12)), to: end };
      },
    },
    {
      label: "Letos (YTD)",
      getRange: () => ({ from: startOfYear(today), to: today }),
    },
    {
      label: "Vše",
      getRange: () => ({ from: new Date(2018, 0, 1), to: today }),
    },
  ];
}

export function PeriodSwitcher({ dateRange, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [tempRange, setTempRange] = useState<DateRange | undefined>(dateRange);
  const presets = makePresets();

  const handlePreset = (preset: Preset) => {
    onChange(preset.getRange());
    setOpen(false);
    setShowCustom(false);
  };

  const formatRange = () => {
    if (!dateRange?.from) return "Vyberte období";
    const from = format(dateRange.from, "d. M. yyyy", { locale: cs });
    const to = dateRange.to ? format(dateRange.to, "d. M. yyyy", { locale: cs }) : "…";
    return `${from} – ${to}`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full sm:w-auto sm:min-w-[240px] justify-between text-left font-normal",
            !dateRange && "text-muted-foreground"
          )}
        >
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{formatRange()}</span>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-auto p-0" align="end" side="bottom" sideOffset={8}>
        <div className="flex flex-col sm:flex-row max-h-[70vh] overflow-auto">
          {/* Presets */}
          <div className="border-b sm:border-b-0 sm:border-r border-border p-2 sm:min-w-[200px]">
            <div className="space-y-0.5">
              <button
                onClick={() => { setShowCustom(!showCustom); setTempRange(dateRange); }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-accent text-left font-medium"
              >
                Konkrétní data
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <div className="h-px bg-border my-1" />
              <div className="grid grid-cols-2 sm:grid-cols-1 gap-0.5">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handlePreset(preset)}
                    className="w-full px-3 py-1.5 text-sm rounded-md hover:bg-accent text-left transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Calendar for custom range */}
          {showCustom && (
            <div className="p-3 overflow-auto">
              <Calendar
                mode="range"
                selected={tempRange}
                onSelect={setTempRange}
                numberOfMonths={typeof window !== "undefined" && window.innerWidth < 640 ? 1 : 2}
                defaultMonth={tempRange?.from ? subMonths(tempRange.from, 1) : undefined}
                locale={cs}
                className={cn("pointer-events-auto")}
                disabled={(date) => date > new Date()}
              />
              <div className="flex justify-end gap-2 pt-2 border-t border-border mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    setShowCustom(false);
                  }}
                >
                  Zavřít
                </Button>
                <Button
                  size="sm"
                  disabled={!tempRange?.from || !tempRange?.to}
                  onClick={() => {
                    onChange(tempRange);
                    setOpen(false);
                    setShowCustom(false);
                  }}
                >
                  Vybrat
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
