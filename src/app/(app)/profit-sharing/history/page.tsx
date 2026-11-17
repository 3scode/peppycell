import Link from "next/link";
import { CalendarDays, Download, HandCoins, RotateCcw } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { listPayouts } from "@/lib/data/repository";
import { formatDateId, formatPeriod } from "@/lib/period";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DataTable, Td } from "@/components/ui/data-table";
import { MoneyText } from "@/components/ui/money-text";
import { PayoutStatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

export const metadata = { title: "Riwayat Payout" };

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function historyHref(
  current: { status?: string; year?: string; month?: string },
  patch: Partial<{ status?: string; year?: string; month?: string }>,
) {
  const search = new URLSearchParams();
  const merged = { ...current, ...patch };
  for (const [key, value] of Object.entries(merged)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `/profit-sharing/history?${qs}` : "/profit-sharing/history";
}

const monthNames = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export default async function PayoutHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireRole("admin", "investor");
  const params = await searchParams;
  const status = one(params.status);
  const year = one(params.year);
  const month = one(params.month);
  const page = Number(one(params.page) ?? 1) || 1;
  const isAdmin = user.role === "admin";

  const result = await listPayouts(user, {
    status: status && status !== "all" ? status : undefined,
    year,
    month,
    page,
    limit: 20,
  });
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, index) => String(currentYear - index));
  const activeFilters = {
    status: status && status !== "all" ? status : undefined,
    year,
    month,
  };

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Riwayat Payout" : "Deviden Saya"}
        backHref={isAdmin ? "/profit-sharing" : "/dashboard"}
        description={
          isAdmin
            ? "Semua payout mingguan yang sudah diproses beserta kas ditahan dan sumber dana."
            : "Hanya penerimaan deviden milik Anda. Data penerima lain tidak ditampilkan."
        }
        actions={
          isAdmin ? (
            <Button asChild size="sm" className="h-11">
              <Link href="/profit-sharing/new">
                <HandCoins className="size-4" aria-hidden /> Proses Bagi Hasil
              </Link>
            </Button>
          ) : null
        }
      />

      {isAdmin ? (
        <div className="mb-3 flex w-full items-center gap-1 overflow-x-auto rounded-sm bg-surface-muted p-1 sm:w-auto">
          {[
            { value: "all", label: "Semua" },
            { value: "completed", label: "Selesai" },
            { value: "processing", label: "Diproses" },
            { value: "failed", label: "Gagal" },
          ].map((tab) => {
            const active = (status ?? "all") === tab.value || (tab.value === "all" && !status);
            return (
              <Link
                key={tab.value}
                href={historyHref(activeFilters, { status: tab.value === "all" ? undefined : tab.value })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-[6px] px-3 text-xs font-semibold sm:flex-none",
                  active
                    ? "bg-surface text-foreground shadow-card"
                    : "text-foreground-muted hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      ) : null}

      <form
        action="/profit-sharing/history"
        method="get"
        className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface p-2.5 shadow-card"
      >
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <div className="min-w-[140px] flex-1">
          <label htmlFor="year" className="mb-1 block text-[11px] font-semibold text-foreground-muted">
            Tahun
          </label>
          <Select id="year" name="year" defaultValue={year ?? ""} className="h-10">
            <option value="">Semua tahun</option>
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-[150px] flex-1">
          <label htmlFor="month" className="mb-1 block text-[11px] font-semibold text-foreground-muted">
            Bulan
          </label>
          <Select id="month" name="month" defaultValue={month ?? ""} className="h-10">
            <option value="">Semua bulan</option>
            {monthNames.map((name, index) => (
              <option key={name} value={String(index + 1).padStart(2, "0")}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" size="sm" className="h-10">
          Terapkan
        </Button>
        <Link
          href="/profit-sharing/history"
          className="inline-flex h-10 items-center gap-1 rounded-sm px-2 text-xs font-semibold text-foreground-muted hover:text-foreground"
        >
          <RotateCcw className="size-3.5" aria-hidden /> Reset
        </Link>
      </form>

      {result.rows.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-7" />}
          title={
            status || year || month
              ? "Tidak ada payout pada filter ini"
              : isAdmin
                ? "Belum ada payout"
                : "Belum ada deviden diterima"
          }
          description={
            status || year || month
              ? "Coba ubah bulan/tahun atau reset filter."
              : isAdmin
                ? "Payout pertama akan muncul setelah Anda memproses bagi hasil mingguan."
                : "Deviden akan muncul setelah Admin memproses payout."
          }
          action={
            isAdmin ? (
              <Button asChild size="sm">
                <Link href="/profit-sharing/new">Proses Bagi Hasil</Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard">Kembali ke Dashboard</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {result.rows.map((payout) => {
              const ownAmount = payout.items.reduce((sum, item) => sum + item.amount, 0);
              return (
                <Link
                  key={payout.id}
                  href={`/profit-sharing/history/${payout.id}`}
                  className="block rounded-md border border-border bg-surface p-3.5 shadow-card hover:bg-surface-muted/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {formatPeriod(payout.startDate, payout.endDate)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-foreground-muted">
                        {payout.walletName ?? "Wallet"} · {formatDateId(payout.createdAt.slice(0, 10))}
                      </p>
                    </div>
                    <PayoutStatusBadge status={payout.status} />
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-foreground-muted">Laba bersih</dt>
                    <dd className="text-right"><MoneyText value={payout.netProfit} /></dd>
                    {isAdmin ? (
                      <>
                        <dt className="text-foreground-muted">Kas ditahan</dt>
                        <dd className="text-right"><MoneyText value={payout.retainedEarnings} tone="muted" /></dd>
                        <dt className="text-foreground-muted">Dibagikan</dt>
                        <dd className="text-right"><MoneyText value={payout.totalDistributed} tone="payout" /></dd>
                      </>
                    ) : (
                      <>
                        <dt className="text-foreground-muted">Deviden Anda</dt>
                        <dd className="text-right"><MoneyText value={ownAmount} tone="payout" /></dd>
                      </>
                    )}
                  </dl>
                  {!isAdmin ? (
                    <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                      <Download className="size-3.5" aria-hidden /> Unduh bukti deviden
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>

          <div className="hidden md:block">
            <DataTable
              caption="Riwayat payout"
              head={
                isAdmin
                  ? ["Periode", "Laba Bersih", "Kas Ditahan", "Total Dibagikan", "Wallet", "Status", "Dieksekusi", "Aksi"]
                  : ["Periode", "Laba Bersih", "Deviden Anda", "Wallet", "Status", "Dieksekusi", "Aksi"]
              }
            >
              {result.rows.map((payout) => {
                const ownAmount = payout.items.reduce((sum, item) => sum + item.amount, 0);
                return (
                  <tr key={payout.id} className="hover:bg-surface-muted/40">
                    <Td>
                      <Link href={`/profit-sharing/history/${payout.id}`} className="font-medium hover:text-primary">
                        {formatPeriod(payout.startDate, payout.endDate)}
                      </Link>
                    </Td>
                    <Td><MoneyText value={payout.netProfit} /></Td>
                    {isAdmin ? (
                      <>
                        <Td><MoneyText value={payout.retainedEarnings} tone="muted" /></Td>
                        <Td><MoneyText value={payout.totalDistributed} tone="payout" /></Td>
                      </>
                    ) : (
                      <Td><MoneyText value={ownAmount} tone="payout" /></Td>
                    )}
                    <Td className="text-xs">{payout.walletName ?? "—"}</Td>
                    <Td><PayoutStatusBadge status={payout.status} /></Td>
                    <Td className="whitespace-nowrap text-xs text-foreground-muted">
                      {formatDateId(payout.createdAt.slice(0, 10))}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/profit-sharing/history/${payout.id}`}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Detail
                        </Link>
                        <a
                          href={`/api/payouts/${payout.id}/pdf`}
                          aria-label={`Unduh PDF payout ${formatPeriod(payout.startDate, payout.endDate)}`}
                          className="inline-flex size-8 items-center justify-center rounded-sm border border-border text-foreground-muted hover:text-foreground"
                        >
                          <Download className="size-3.5" aria-hidden />
                        </a>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </DataTable>
          </div>

          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            total={result.total}
            limit={result.limit}
            basePath="/profit-sharing/history"
            params={activeFilters}
          />
        </>
      )}
    </div>
  );
}
