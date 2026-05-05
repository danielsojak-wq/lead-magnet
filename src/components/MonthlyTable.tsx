import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyData } from "@/hooks/useOrders";

interface Props {
  data: MonthlyData[];
}

const fmt = (v: number) =>
  new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(v);

export function MonthlyTable({ data }: Props) {
  const sorted = [...data].reverse();

  return (
    <Card className="border-none shadow-sm bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-[family-name:var(--font-heading)]">
          Přehled dle měsíců
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto max-h-[500px]">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-muted-foreground">Měsíc</TableHead>
                <TableHead className="text-right text-muted-foreground">Obj.</TableHead>
                <TableHead className="text-right text-muted-foreground">Tržby bez DPH</TableHead>
                <TableHead className="text-right text-muted-foreground">Marže</TableHead>
                <TableHead className="text-right text-muted-foreground">Reklama</TableHead>
                <TableHead className="text-right text-muted-foreground">Zisk po rekl.</TableHead>
                <TableHead className="text-right text-muted-foreground">PNO</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((m) => {
                const pno = m.revenueWithoutVat > 0 ? ((m.adCost / m.revenueWithoutVat) * 100) : null;
                return (
                  <TableRow key={m.month} className="hover:bg-accent/50">
                    <TableCell className="font-medium">{m.label}</TableCell>
                    <TableCell className="text-right">{m.orderCount}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(m.revenueWithoutVat)}</TableCell>
                    <TableCell className="text-right">{fmt(m.margin)}</TableCell>
                    <TableCell className="text-right">{m.adCost > 0 ? fmt(m.adCost) : "—"}</TableCell>
                    <TableCell className={`text-right font-medium ${m.profitAfterAds >= 0 ? "text-accent-foreground" : "text-destructive"}`}>
                      {m.adCost > 0 ? fmt(m.profitAfterAds) : fmt(m.margin)}
                    </TableCell>
                    <TableCell className="text-right">
                      {pno !== null ? `${pno.toFixed(1)} %` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
