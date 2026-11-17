import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  HandCoins,
  Package,
  Plus,
  ReceiptText,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import {
  getDashboardMetrics,
  getPayoutSettings,
  listPayouts,
} from "@/lib/data/repository";
import { addDays, formatDateTimeId, formatPeriod, todayWib, weekBounds } from "@/lib/period";
import { formatRupiah } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { MoneyText } from "@/components/ui/money-text";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/data-table";
import { TransactionBadge, PayoutStatusBadge } from "@/components/ui/status-badge";
import { Progress } from "@/components/ui/progress";
import { DashboardChartLazy } from "@/components/dashboard/dashboard-chart-lazy";
import type { PayoutSettings } from "@/types/domain";

export const metadata = { title: "Dashboard" };

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("id-ID", { hour: "numeric", hour12: false, timeZone: "Asia/Jakarta" }).format(new Date()),
  );
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}

function longDate() {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

function deltaLabel(current: number, previous: number) {
  if (previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(pct)) return null;
  return { pct, up: pct >= 0 };
}

function txIcon(type: "income" | "expense" | "transfer" | "payout") {
  if (type === "income") return <ShoppingCart className="size-5" />;
  if (type === "expense") return <ReceiptText className="size-5" />;
  if (type === "transfer") return <ArrowLeftRight className="size-5" />;
  return <HandCoins className="size-5" />;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const metrics = await getDashboardMetrics(user);
  const prevPeriod = weekBounds(addDays(weekBounds(todayWib()).start, -7));
  const previous = await getDashboardMetrics(user, prevPeriod.start, prevPeriod.end);
  const delta = deltaLabel(metrics.netProfit, previous.netProfit);
  const firstName = user.fullName.split(" ")[0] ?? user.fullName;
  const settings: PayoutSettings | null =
    user.role === "admin" ? await getPayoutSettings() : null;
  const payoutHistory =
    user.role === "investor"
      ? (await listPayouts(user, { limit: 3 })).rows
      : [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${greeting()}, ${firstName}`}
        title={
          user.role === "admin"
            ? "Ringkasan konter minggu ini"
            : user.role === "karyawan"
              ? "Aktivitas Anda hari ini"
              : "Performa bisnis & deviden"
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <CalendarDays className="size-3.5" aria-hidden />
            {longDate()} · WIB
            <span className="hidden text-foreground-muted sm:inline">·</span>
            <span className="hidden sm:inline">
              Periode {formatPeriod(metrics.period.start, metrics.period.end)}
            </span>
          </span>
        }
        actions={
          user.role === "investor" ? (
            <Button asChild className="h-11" variant="link">
              <Link href="/profit-sharing/history">Lihat riwayat deviden →</Link>
            </Button>
          ) : (
            <>
              {(user.role === "admin" || user.role === "karyawan") && (
                <Button asChild size="sm" className="h-11">
                  <Link href="/transactions/new?type=sale">
                    <Plus className="size-4" aria-hidden /> Catat Penjualan
                  </Link>
                </Button>
              )}
              {user.role === "admin" && (
                <Link
                  href="/transactions/new?type=expense"
                  className="inline-flex h-11 items-center gap-2 rounded-sm border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-muted"
                >
                  <ReceiptText className="size-4" aria-hidden /> Pengeluaran
                </Link>
              )}
            </>
          )
        }
      />

      {user.role === "admin" && metrics.payoutReady ? (
        <Alert tone="info" className="items-center">
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-foreground">Periode siap diproses</p>
              <p className="text-foreground-muted">
                {formatPeriod(metrics.payoutPeriod.start, metrics.payoutPeriod.end)} · laba bersih{" "}
                {formatRupiah(metrics.payoutReadyNetProfit ?? metrics.netProfit)}
              </p>
            </div>
            <Link
              href="/profit-sharing/new"
              className="inline-flex h-9 items-center gap-1 rounded-sm bg-primary px-3 text-xs font-semibold text-primary-foreground"
            >
              Proses <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </Alert>
      ) : null}

      {user.role === "admin" ? (
        <>
          <div className="grid gap-3 lg:grid-cols-12">
            <MetricCard
              hero
              className="lg:col-span-7"
              label="Laba bersih · minggu ini"
              value={metrics.netProfit}
              tone={metrics.netProfit < 0 ? "expense" : "default"}
              icon={<TrendingUp className="size-5" />}
              hint={
                <div className="flex flex-wrap items-center gap-2">
                  {delta ? (
                    <span
                      className={
                        delta.up
                          ? "inline-flex items-center gap-0.5 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success-text"
                          : "inline-flex items-center gap-0.5 rounded-full bg-error-soft px-2 py-0.5 text-[11px] font-semibold text-error-text"
                      }
                    >
                      {delta.up ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}
                      {Math.abs(delta.pct).toFixed(1).replace(".", ",")}%
                    </span>
                  ) : null}
                  <span>vs minggu lalu · margin {formatRupiah(metrics.grossMargin, { compact: true })} − beban {formatRupiah(metrics.operatingExpense, { compact: true })}</span>
                </div>
              }
              action={
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/profit-sharing"
                    className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-primary px-3 text-xs font-semibold text-primary-foreground"
                  >
                    <HandCoins className="size-3.5" aria-hidden /> Bagi Hasil
                  </Link>
                  <Link
                    href="/transactions"
                    className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border bg-surface px-3 text-xs font-semibold"
                  >
                    Lihat transaksi
                  </Link>
                </div>
              }
            />
            <div className="grid gap-3 sm:grid-cols-1 lg:col-span-5">
              <MetricCard
                label="Laba kotor"
                value={metrics.grossMargin}
                tone="default"
                icon={<CircleDollarSign className="size-5" />}
                hint="Total margin penjualan periode ini"
              />
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  label="Total aset"
                  value={metrics.totalAssets}
                  icon={<Wallet className="size-5" />}
                  hint="Semua wallet aktif"
                />
                <MetricCard
                  label="Beban operasional"
                  value={-metrics.operatingExpense}
                  tone="expense"
                  icon={<TrendingDown className="size-5" />}
                  hint="Hanya kategori operasional"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <DashboardChartLazy
                series7={metrics.series}
                series30={metrics.series30 ?? metrics.series}
              />
            </div>
            <aside className="rounded-md border border-border bg-surface p-4 shadow-card sm:p-5 lg:col-span-4">
              <h2 className="text-base font-semibold">Alokasi default</h2>
              <p className="text-xs text-foreground-muted">Dasar pembagian laba bersih.</p>
              {settings ? (
                <div className="mt-4 space-y-3">
                  {[
                    { label: "Kas ditahan", value: settings.retainedPct, tone: "bg-chart-1" },
                    { label: "Deviden admin", value: settings.adminPct, tone: "bg-chart-2" },
                    { label: "Deviden investor", value: settings.investorPct, tone: "bg-success-text" },
                    { label: "Gaji karyawan", value: settings.employeePct, tone: "bg-warning-text" },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-foreground-muted">{item.label}</span>
                        <span className="money font-semibold">{item.value}%</span>
                      </div>
                      <Progress value={item.value} label={`${item.label} ${item.value}%`} className="h-1.5" />
                    </div>
                  ))}
                  <div className="border-t border-border pt-3">
                    <p className="text-[11px] text-foreground-muted">Estimasi dibagikan</p>
                    <MoneyText
                      value={Math.max(
                        0,
                        metrics.netProfit -
                          Math.floor(
                            (metrics.netProfit * settings.retainedPct) / 100,
                          ),
                      )}
                      size="lg"
                      tone="payout"
                    />
                  </div>
                  <Link href="/profit-sharing/new" className="block text-xs font-semibold text-primary hover:underline">
                    Hitung & proses bagi hasil →
                  </Link>
                </div>
              ) : null}
            </aside>
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold">Transaksi terbaru</h2>
              <Link href="/transactions" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                Lihat semua <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
            {metrics.recentTransactions.length === 0 ? (
              <EmptyState
                title="Belum ada transaksi minggu ini"
                description="Mulai catat penjualan atau pengeluaran pertama untuk melihat laba."
                action={
                  <Button asChild size="sm">
                    <Link href="/transactions/new?type=sale">+ Catat Penjualan</Link>
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2">
                {metrics.recentTransactions.map((tx) => (
                  <ListRow
                    key={tx.id}
                    href={`/transactions/${tx.id}`}
                    icon={txIcon(tx.tipe)}
                    title={tx.description}
                    status={<TransactionBadge type={tx.tipe} />}
                    subtitle={`${formatDateTimeId(tx.tanggal)} WIB${tx.userName ? ` · oleh ${tx.userName}` : ""}`}
                    trailing={
                      <MoneyText
                        value={tx.tipe === "expense" ? -tx.nominal : tx.nominal}
                        signed={tx.tipe === "income" || tx.tipe === "expense"}
                        tone={tx.tipe === "income" ? "income" : tx.tipe === "expense" ? "expense" : "payout"}
                      />
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {user.role === "karyawan" ? (
        <>
          <MetricCard
            hero
            label="Transaksi saya hari ini"
            value={`${metrics.myTransactionCountToday ?? 0} transaksi`}
            icon={<ReceiptText className="size-5" />}
            hint={
              <>Nilai penjualan <MoneyText value={metrics.mySalesToday ?? 0} tone="income" size="sm" /> · {metrics.myProductsSoldToday ?? 0} produk terjual</>
            }
            action={
              <Button asChild size="sm">
                <Link href="/transactions/new?type=sale">
                  <Plus className="size-4" aria-hidden /> Catat Penjualan
                </Link>
              </Button>
            }
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Nilai penjualan" value={metrics.mySalesToday ?? 0} tone="income" icon={<ShoppingCart className="size-5" />} hint="Hari ini (WIB)" />
            <MetricCard label="Produk terjual" value={`${metrics.myProductsSoldToday ?? 0} unit`} icon={<Package className="size-5" />} hint="Total qty hari ini" />
            <MetricCard label="Transaksi" value={`${metrics.myTransactionCountToday ?? 0}`} icon={<ReceiptText className="size-5" />} hint="Termasuk pengeluaran" />
          </div>
          <DashboardChartLazy
            series7={metrics.series}
            series30={metrics.series30 ?? metrics.series}
            mode="count"
            title="Aktivitas transaksi saya"
          />
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold">Transaksi saya hari ini</h2>
              <Link href="/transactions" className="text-xs font-semibold text-primary">Lihat semua</Link>
            </div>
            {metrics.recentTransactions.length === 0 ? (
              <EmptyState
                title="Belum ada transaksi hari ini"
                description="Transaksi yang Anda catat akan muncul di sini."
                action={<Button asChild size="sm"><Link href="/transactions/new?type=sale">+ Catat Penjualan</Link></Button>}
              />
            ) : (
              <div className="space-y-2">
                {metrics.recentTransactions.map((tx) => (
                  <ListRow
                    key={tx.id}
                    href={`/transactions/${tx.id}`}
                    icon={txIcon(tx.tipe)}
                    title={tx.description}
                    status={<TransactionBadge type={tx.tipe} />}
                    subtitle={`${formatDateTimeId(tx.tanggal)} WIB`}
                    trailing={<MoneyText value={tx.nominal} tone={tx.tipe === "income" ? "income" : "expense"} />}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {user.role === "investor" ? (
        <>
          <div className="grid gap-3 lg:grid-cols-12">
            <MetricCard
              hero
              className="lg:col-span-7"
              label="Laba bersih · minggu ini"
              value={metrics.netProfit}
              tone={metrics.netProfit < 0 ? "expense" : "default"}
              icon={<TrendingUp className="size-5" />}
              hint={
                <div className="flex flex-wrap items-center gap-2">
                  {delta ? (
                    <span className={delta.up ? "rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success-text" : "rounded-full bg-error-soft px-2 py-0.5 text-[11px] font-semibold text-error-text"}>
                      {delta.up ? "↑" : "↓"} {Math.abs(delta.pct).toFixed(1).replace(".", ",")}%
                    </span>
                  ) : null}
                  <span>vs minggu lalu · margin {formatRupiah(metrics.grossMargin, { compact: true })}</span>
                </div>
              }
              action={
                <Link
                  href="/profit-sharing/history"
                  className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-primary px-3 text-xs font-semibold text-primary-foreground"
                >
                  <HandCoins className="size-3.5" aria-hidden /> Riwayat Deviden
                </Link>
              }
            />
            <div className="grid gap-3 sm:grid-cols-1 lg:col-span-5">
              <MetricCard label="Laba kotor" value={metrics.grossMargin} icon={<CircleDollarSign className="size-5" />} hint="Margin penjualan periode ini" />
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Total aset" value={metrics.totalAssets} icon={<Wallet className="size-5" />} hint="Agregat semua wallet" />
                <MetricCard label="Deviden terakhir" value={metrics.lastDividend ?? 0} tone="payout" icon={<HandCoins className="size-5" />} hint="Penerimaan terakhir Anda" />
              </div>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <DashboardChartLazy series7={metrics.series} series30={metrics.series30 ?? metrics.series} />
            </div>
            <aside className="rounded-md border border-border bg-surface p-4 shadow-card lg:col-span-4">
              <h2 className="text-base font-semibold">Deviden saya</h2>
              <p className="text-xs text-foreground-muted">Hanya penerimaan milik Anda yang ditampilkan.</p>
              <div className="mt-3 space-y-2">
                {payoutHistory.length === 0 ? (
                  <p className="rounded-sm bg-surface-muted p-3 text-xs text-foreground-muted">
                    Belum ada deviden diterima.
                  </p>
                ) : (
                  payoutHistory.map((payout) => {
                    const amount = payout.items.reduce((s, i) => s + i.amount, 0);
                    return (
                      <Link
                        key={payout.id}
                        href={`/profit-sharing/history/${payout.id}`}
                        className="block rounded-sm border border-border p-3 hover:bg-surface-muted/60"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-foreground-muted">{formatPeriod(payout.startDate, payout.endDate)}</span>
                          <PayoutStatusBadge status={payout.status} />
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <MoneyText value={amount} tone="payout" />
                          <ArrowRight className="size-3.5 text-foreground-muted" aria-hidden />
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </aside>
          </div>
          <Alert tone="info" title="Akses read-only">
            Anda dapat melihat laba dan deviden, tetapi tidak bisa melihat rincian wallet,
            transaksi per karyawan, atau memproses payout.
          </Alert>
        </>
      ) : null}
    </div>
  );
}
