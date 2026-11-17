"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatRupiah } from "@/lib/money";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

export interface ChartPoint {
  date: string;
  income: number;
  expense: number;
  profit: number;
}

function shortDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${date}T00:00:00+07:00`));
}

function fullDate(date: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${date}T00:00:00+07:00`));
}

export function DashboardChart({
  series7,
  series30,
  mode = "money",
  title = "Tren penjualan & laba",
}: {
  series7: ChartPoint[];
  series30: ChartPoint[];
  mode?: "money" | "count";
  title?: string;
}) {
  const [range, setRange] = useState<"7" | "30">("7");
  const [showTable, setShowTable] = useState(false);
  const data = range === "7" ? series7 : series30;
  const totalIncome = useMemo(() => data.reduce((s, d) => s + d.income, 0), [data]);
  const totalProfit = useMemo(() => data.reduce((s, d) => s + d.profit, 0), [data]);
  const isCount = mode === "count";

  const summary = isCount
    ? `Tren jumlah transaksi ${range} hari terakhir, total ${totalIncome} transaksi.`
    : `Tren laba ${range} hari terakhir. Total pemasukan ${formatRupiah(totalIncome)}, total laba ${formatRupiah(totalProfit)}.`;

  return (
    <section className="rounded-md border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-xs text-foreground-muted">
            {isCount ? `${totalIncome} transaksi · ${range} hari` : `${formatRupiah(totalProfit, { compact: true })} laba · ${range} hari`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            ariaLabel="Rentang grafik"
            value={range}
            onChange={setRange}
            options={[
              { value: "7", label: "7 hari" },
              { value: "30", label: "30 hari" },
            ]}
            className="w-auto"
          />
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
            className="hidden h-9 rounded-sm border border-border px-2.5 text-[11px] font-semibold text-foreground-muted hover:text-foreground sm:block"
          >
            {showTable ? "Grafik" : "Tabel"}
          </button>
        </div>
      </div>

      {showTable ? (
        <div className="scrollbar-thin max-h-[220px] overflow-auto rounded-sm border border-border">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Data {title}</caption>
            <thead className="sticky top-0 bg-surface-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Tanggal</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{isCount ? "Transaksi" : "Pemasukan"}</th>
                {!isCount ? <th scope="col" className="px-3 py-2 text-right font-semibold">Laba</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((point) => (
                <tr key={point.date}>
                  <td className="px-3 py-1.5">{fullDate(point.date)}</td>
                  <td className="money px-3 py-1.5 text-right">
                    {isCount ? point.income : formatRupiah(point.income)}
                  </td>
                  {!isCount ? (
                    <td className={cn("money px-3 py-1.5 text-right", point.profit < 0 && "text-error-text")}>
                      {formatRupiah(point.profit)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          role="img"
          aria-label={summary}
          className="h-[180px] w-full sm:h-[220px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="chartIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="chartProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                stroke="var(--chart-axis)"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={12}
              />
              <YAxis
                stroke="var(--chart-axis)"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(value: number) =>
                  isCount ? String(value) : formatRupiah(value, { compact: true }).replace("Rp ", "")
                }
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "var(--foreground)",
                }}
                labelFormatter={(label) => fullDate(String(label))}
                formatter={(value, name) => {
                  const amount = Number(value ?? 0);
                  return [
                    isCount ? `${amount} transaksi` : formatRupiah(amount),
                    name === "income" ? (isCount ? "Transaksi" : "Pemasukan") : "Laba",
                  ];
                }}
              />
              <Area
                type="monotone"
                dataKey="income"
                stroke="var(--chart-2)"
                strokeWidth={2}
                fill="url(#chartIncome)"
                name="income"
              />
              {!isCount ? (
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#chartProfit)"
                  name="profit"
                />
              ) : null}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-2 flex items-center gap-4 text-[10px] text-foreground-muted">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="size-2 rounded-full bg-chart-2" />
          {isCount ? "Transaksi" : "Pemasukan"}
        </span>
        {!isCount ? (
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="size-2 rounded-full bg-chart-1" />
            Laba
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="ml-auto font-semibold text-primary sm:hidden"
        >
          {showTable ? "Lihat grafik" : "Lihat tabel"}
        </button>
      </div>
    </section>
  );
}
