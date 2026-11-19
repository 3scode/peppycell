import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  HandCoins,
  ReceiptText,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import {
  getDashboardMetrics,
  getPayoutSettings,
  listPayouts,
} from "@/lib/data/repository";
import { allocateRupiah, formatRupiah } from "@/lib/money";
import { formatPeriod, lastClosedWeek, todayWib, weekBounds } from "@/lib/period";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { MoneyText } from "@/components/ui/money-text";
import { PayoutStatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PayoutSettingsDialog } from "@/components/payouts/payout-settings-dialog";
import type { PayoutSettings } from "@/types/domain";

export const metadata = { title: "Bagi Hasil" };

function periodDayProgress(start: string, end: string) {
  const today = todayWib();
  const total = 7;
  if (today < start) return { day: 0, pct: 0 };
  if (today > end) return { day: total, pct: 100 };
  const day = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
  return { day, pct: Math.round((day / total) * 100) };
}

const allocationRows = [
  { key: "retained" as const, label: "Kas Ditahan", color: "bg-chart-1", pct: (s: PayoutSettings) => s.retainedPct },
  { key: "admin" as const, label: "Deviden Admin", color: "bg-chart-2", pct: (s: PayoutSettings) => s.adminPct },
  { key: "investor" as const, label: "Deviden Investor", color: "bg-success-text", pct: (s: PayoutSettings) => s.investorPct },
  { key: "employee" as const, label: "Gaji Karyawan", color: "bg-warning-text", pct: (s: PayoutSettings) => s.employeePct },
];

export default async function ProfitSharingPage() {
  const user = await requireRole("admin", "investor");
  const current = weekBounds(todayWib());
  const closed = lastClosedWeek();
  const isAdmin = user.role === "admin";
  const settingsPromise: Promise<PayoutSettings | null> = isAdmin
    ? getPayoutSettings()
    : Promise.resolve(null);
  const [metrics, settings, history] = await Promise.all([
    getDashboardMetrics(user),
    settingsPromise,
    listPayouts(user, { limit: 5 }),
  ]);
  const preview =
    isAdmin && settings ? getDashboardPreview(metrics.netProfit, settings) : null;
  const progress = periodDayProgress(current.start, current.end);

  return (
    <div>
      <PageHeader
        title="Bagi Hasil"
        description={
          isAdmin
            ? "Laba mingguan dihitung otomatis dari margin penjualan dan beban operasional."
            : "Laba bersih dan deviden Anda. Data penerima lain tidak ditampilkan."
        }
        actions={
          isAdmin ? (
            <>
              <Button asChild variant="outline" size="sm" className="h-11">
                <Link href="/profit-sharing/history">Riwayat</Link>
              </Button>
              <Button asChild size="sm" className="h-11">
                <Link href="/profit-sharing/new">
                  Hitung & Proses <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild size="sm" className="h-11">
              <Link href="/profit-sharing/history">Riwayat Deviden</Link>
            </Button>
          )
        }
      />

      {isAdmin && metrics.payoutReady ? (
        <Alert tone="info" className="mb-4">
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-foreground">Periode lalu siap diproses</p>
              <p className="text-foreground-muted">
                {formatPeriod(closed.start, closed.end)} · laba{" "}
                {formatRupiah(metrics.payoutReadyNetProfit ?? 0)}
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

      <div className="mb-4 rounded-md border border-border bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" aria-hidden />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                Periode berjalan
              </p>
              <p className="text-sm font-semibold">{formatPeriod(current.start, current.end)}</p>
            </div>
          </div>
          <p className="text-xs text-foreground-muted">
            hari {progress.day}/7 · {progress.pct}%
          </p>
        </div>
        <Progress
          value={progress.pct}
          label={`Progress periode ${progress.day} dari 7 hari`}
          className="mt-2 h-1.5"
        />
        <p className="mt-1.5 text-[11px] text-foreground-muted">
          Payout dapat diproses setelah periode ditutup (Senin 00:00 WIB berikutnya).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-8">
          <MetricCard
            hero
            label="Laba bersih periode berjalan"
            value={metrics.netProfit}
            tone={metrics.netProfit < 0 ? "expense" : "default"}
            icon={<TrendingUp className="size-5" />}
            hint={
              <>
                Margin {formatRupiah(metrics.grossMargin, { compact: true })} − beban{" "}
                {formatRupiah(metrics.operatingExpense, { compact: true })}
                {isAdmin ? ` · ${metrics.transactionCount} transaksi` : ""}
              </>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              label="Margin penjualan"
              value={metrics.grossMargin}
              icon={<CircleDollarSign className="size-5" />}
              hint="Harga jual − harga beli"
            />
            <MetricCard
              label="Beban operasional"
              value={-metrics.operatingExpense}
              tone="expense"
              icon={<TrendingDown className="size-5" />}
              hint="Hanya kategori operasional"
            />
          </div>

          {isAdmin && preview ? (
            <section className="rounded-md border border-border bg-surface p-4 shadow-card sm:p-5">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">Alokasi default</h2>
                  <p className="text-xs text-foreground-muted">
                    Dasar pembagian laba sebelum wizard dijalankan.
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-[11px] text-foreground-muted">
                    Estimasi dibagikan {formatRupiah(preview.totalOut)}
                  </span>
                  <PayoutSettingsDialog settings={settings!} />
                </div>
              </div>
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div
                  role="img"
                  aria-label={`Alokasi laba: kas ditahan ${settings!.retainedPct} persen, deviden admin ${settings!.adminPct} persen, deviden investor ${settings!.investorPct} persen, gaji karyawan ${settings!.employeePct} persen.`}
                  className="relative flex size-36 shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: `conic-gradient(var(--chart-1) 0 ${settings!.retainedPct}%, var(--chart-2) ${settings!.retainedPct}% ${settings!.retainedPct + settings!.adminPct}%, var(--chart-positive) ${settings!.retainedPct + settings!.adminPct}% ${settings!.retainedPct + settings!.adminPct + settings!.investorPct}%, var(--warning) ${settings!.retainedPct + settings!.adminPct + settings!.investorPct}% 100%)`,
                  }}
                >
                  <div className="flex size-24 flex-col items-center justify-center rounded-full bg-surface">
                    <span className="text-[10px] uppercase tracking-wide text-foreground-muted">Laba</span>
                    <span className="money text-sm font-bold">
                      {formatRupiah(metrics.netProfit, { compact: true })}
                    </span>
                  </div>
                </div>
                <div className="w-full space-y-2">
                  {allocationRows.map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-foreground-muted">
                        <span aria-hidden className={`size-2 rounded-full ${row.color}`} />
                        {row.label}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="money font-semibold">{row.pct(settings!)}%</span>
                        <span className="money w-24 text-right text-foreground-muted">
                          {formatRupiah(preview.pools[row.key])}
                        </span>
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
                    <span className="font-semibold">Total dibagikan</span>
                    <MoneyText value={preview.totalOut} tone="payout" />
                  </div>
                </div>
              </div>
              <Button asChild className="mt-4 w-full">
                <Link href="/profit-sharing/new">
                  <HandCoins className="size-4" aria-hidden /> Hitung & Proses Bagi Hasil
                </Link>
              </Button>
            </section>
          ) : null}
        </div>

        <aside className="space-y-3 lg:col-span-4">
          {isAdmin && preview ? (
            <div className="rounded-md border border-border bg-surface p-4 shadow-card">
              <h2 className="text-sm font-semibold">Pool deviden</h2>
              <p className="text-[11px] text-foreground-muted">Estimasi berdasarkan laba periode berjalan.</p>
              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-foreground-muted">Admin</dt>
                  <dd className="money font-semibold">{formatRupiah(preview.pools.admin)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-foreground-muted">Investor</dt>
                  <dd className="money font-semibold">{formatRupiah(preview.pools.investor)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-foreground-muted">Karyawan</dt>
                  <dd className="money font-semibold">{formatRupiah(preview.pools.employee)}</dd>
                </div>
                <div className="flex justify-between gap-2 border-t border-border pt-2">
                  <dt className="text-foreground-muted">Retained</dt>
                  <dd className="money font-semibold">{formatRupiah(preview.pools.retained)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="rounded-md border border-border bg-surface p-4 shadow-card">
              <h2 className="text-sm font-semibold">Deviden terakhir</h2>
              <p className="text-[11px] text-foreground-muted">Penerimaan Anda yang sudah selesai dibayarkan.</p>
              <div className="mt-3">
                <MoneyText value={metrics.lastDividend ?? 0} tone="payout" size="display" />
              </div>
              <Button asChild variant="outline" className="mt-3 w-full">
                <Link href="/profit-sharing/history">Lihat semua deviden</Link>
              </Button>
            </div>
          )}

          <section className="rounded-md border border-border bg-surface p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{isAdmin ? "Payout terakhir" : "Deviden terakhir"}</h2>
              <Link href="/profit-sharing/history" className="text-[11px] font-semibold text-primary">
                Semua
              </Link>
            </div>
            {history.rows.length === 0 ? (
              <EmptyState
                className="border-none bg-transparent px-2 py-6"
                title={isAdmin ? "Belum ada payout" : "Belum ada deviden"}
                description={
                  isAdmin
                    ? "Payout pertama muncul setelah bagi hasil diproses."
                    : "Deviden muncul setelah Admin memproses payout."
                }
              />
            ) : (
              <div className="space-y-1.5">
                {history.rows.map((payout) => {
                  const amount = payout.items.reduce((sum, item) => sum + item.amount, 0);
                  return (
                    <Link
                      key={payout.id}
                      href={`/profit-sharing/history/${payout.id}`}
                      className="block rounded-sm border border-border p-2.5 hover:bg-surface-muted/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-foreground-muted">
                          {formatPeriod(payout.startDate, payout.endDate)}
                        </span>
                        <PayoutStatusBadge status={payout.status} />
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-xs text-foreground-muted">
                          {isAdmin ? "Dibagikan" : "Deviden Anda"}
                        </span>
                        <MoneyText value={amount} tone="payout" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {!isAdmin ? (
            <Alert tone="info" title="Akses read-only">
              Anda melihat agregat laba dan deviden milik Anda. Rincian wallet dan penerima lain
              tidak ditampilkan.
            </Alert>
          ) : (
            <div className="rounded-md border border-border bg-surface p-4 shadow-card">
              <p className="text-[11px] text-foreground-muted">
                Butuh menyesuaikan saldo? Buka{" "}
                <Link href="/wallets" className="font-semibold text-primary hover:underline">
                  Wallet & Aset
                </Link>
                . Payout tidak mengubah laba — hanya memindahkan kas ke penerima.
              </p>
            </div>
          )}
        </aside>
      </div>

      {isAdmin ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border p-3 text-[11px] text-foreground-muted">
          <span className="inline-flex items-center gap-1.5">
            <ReceiptText className="size-3.5" aria-hidden />
            Payout membuat jurnal keluar per penerima. Transaksi payout tidak bisa dibatalkan.
          </span>
          <Link href="/profit-sharing/history" className="inline-flex items-center gap-1 font-semibold text-primary">
            Riwayat payout <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function getDashboardPreview(
  netProfit: number,
  settings: Awaited<ReturnType<typeof getPayoutSettings>>,
) {
  const positive = Math.max(0, netProfit);
  const pools = allocateRupiah(positive, [
    { key: "retained", pct: settings.retainedPct },
    { key: "admin", pct: settings.adminPct },
    { key: "investor", pct: settings.investorPct },
    { key: "employee", pct: settings.employeePct },
  ]) as { retained: number; admin: number; investor: number; employee: number };
  const totalOut = pools.admin + pools.investor + pools.employee;
  return { pools, totalOut };
}
