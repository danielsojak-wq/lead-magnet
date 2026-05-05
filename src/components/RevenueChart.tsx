import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyData } from "@/hooks/useOrders";

interface Props {
  data: MonthlyData[];
}

const formatCZK = (v: number) =>
  new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(v);

export function RevenueChart({ data }: Props) {
  const chartData = useMemo(() =>
    data.map((m) => ({
      ...m,
      pno: m.revenueWithoutVat > 0 ? (m.adCost / m.revenueWithoutVat) * 100 : 0,
    })),
    [data]
  );

  return (
    <Card className="border-none shadow-sm bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-[family-name:var(--font-heading)]">
          Přehled dle měsíců
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(30 10% 88%)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(30 8% 50%)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11, fill: "hsl(30 8% 50%)" }}
                tickLine={false}
                axisLine={false}
                width={45}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={(v) => `${v} %`}
                tick={{ fontSize: 11, fill: "hsl(0 60% 55%)" }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === "PNO") return [`${value.toFixed(1)} %`, name];
                  return [formatCZK(value), name];
                }}
                labelFormatter={(label) => `Měsíc: ${label}`}
                contentStyle={{
                  background: "hsl(30 20% 99%)",
                  border: "1px solid hsl(30 15% 90%)",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="revenueWithoutVat"
                name="Tržby bez DPH"
                fill="hsl(32 80% 50%)"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
              <Bar
                yAxisId="left"
                dataKey="profitAfterAds"
                name="Zisk po reklamě"
                fill="hsl(220 60% 55%)"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
              <Line
                yAxisId="right"
                dataKey="pno"
                name="PNO"
                stroke="hsl(0 60% 55%)"
                strokeWidth={2}
                dot={false}
                type="monotone"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
