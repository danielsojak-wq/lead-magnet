import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyData, Granularity } from "@/hooks/useLeadGen";

interface Props {
  data: MonthlyData[];
  granularity?: Granularity;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(v);

export function LeadGenTable({ data, granularity = "month" }: Props) {
  const sorted = [...data].reverse();
  const periodLabel = granularity === "day" ? "Den" : granularity === "year" ? "Rok" : "Měsíc";
  const title = granularity === "day" ? "Přehled dle dnů" : granularity === "year" ? "Přehled dle roků" : "Přehled dle měsíců";

  return (
    <Card className="border border-border/50 shadow-sm bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-[family-name:var(--font-heading)]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto max-h-[500px] -mx-4 sm:mx-0">
          <div className="min-w-[600px] px-4 sm:px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-muted-foreground">{periodLabel}</TableHead>
                <TableHead className="text-right text-muted-foreground">Poptávky</TableHead>
                <TableHead className="text-right text-muted-foreground">Kval. poptávky</TableHead>
                <TableHead className="text-right text-muted-foreground">Investice</TableHead>
                <TableHead className="text-right text-muted-foreground">CPL</TableHead>
                <TableHead className="text-right text-muted-foreground">CPL kval.</TableHead>
                <TableHead className="text-right text-muted-foreground">% kval.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((m) => {
                const cpl = m.totalLeads > 0 ? m.adCost / m.totalLeads : null;
                const cplQ = m.qualifiedLeads > 0 ? m.adCost / m.qualifiedLeads : null;
                return (
                  <TableRow key={m.month} className="hover:bg-accent/50">
                    <TableCell className="font-medium">{m.label}</TableCell>
                    <TableCell className="text-right">{m.totalLeads}</TableCell>
                    <TableCell className="text-right font-medium">{m.qualifiedLeads}</TableCell>
                    <TableCell className="text-right">{m.adCost > 0 ? fmt(m.adCost) : "—"}</TableCell>
                    <TableCell className="text-right">{cpl !== null ? fmt(cpl) : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{cplQ !== null ? fmt(cplQ) : "—"}</TableCell>
                    <TableCell className="text-right">
                      {m.totalLeads > 0 ? `${m.qualifiedPct.toFixed(1)} %` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
