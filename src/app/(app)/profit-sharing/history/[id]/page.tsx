import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Download,
  HandCoins,
  Lock,
  Wallet as WalletIcon,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getPayout, listUsers } from "@/lib/data/repository";
import { formatDateId, formatDateTimeId, formatPeriod } from "@/lib/period";
import { formatRupiah } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/ui/money-text";
import { PayoutStatusBadge, RoleBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { DataTable, Td } from "@/components/ui/data-table";
import { CopyButton } from "@/components/shared/copy-button";

export const metadata = { title: "Detail Payout" };

const categoryLabel = {
  admin_dividend: "Deviden Admin",
  investor_dividend: "Deviden Investor",
  employee_commission: "Gaji Karyawan",
} as const;

function categoryTotal(
  items: { category: keyof typeof categoryLabel; amount: number }[],
  category: keyof typeof categoryLabel,
) {
  return items.filter((item) => item.category === category).reduce((sum, item) => sum + item.amount, 0);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-xs text-foreground-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

export default async function PayoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("admin", "investor");
  const { id } = await params;
  const payout = await getPayout(user, id);
  if (!payout) notFound();

  const isAdmin = user.role === "admin";
  const ownItems = isAdmin ? payout.items : payout.items.filter((item) => item.userId === user.id);
  const ownAmount = ownItems.reduce((sum, item) => sum + item.amount, 0);
  const distributed = payout.totalDistributed;
  const adminPool = categoryTotal(payout.items, "admin_dividend");
  const investorPool = categoryTotal(payout.items, "investor_dividend");
  const employeePool = categoryTotal(payout.items, "employee_commission");
  const createdBy = isAdmin
    ? (await listUsers(user)).find((item) => item.id === payout.createdBy)?.fullName ?? payout.createdBy
    : null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={isAdmin ? "Detail Payout" : "Deviden Saya"}
        backHref="/profit-sharing/history"
        eyebrow={isAdmin ? "Bukti pembagian laba" : "Bukti penerimaan"}
        description={formatPeriod(payout.startDate, payout.endDate)}
        actions={<CopyButton value={payout.id} label="Salin ID" />}
      />

      {!isAdmin ? (
        <Alert tone="info" className="mb-4" title="Tampilan investor">
          Anda hanya melihat baris deviden milik Anda. Total payout dan penerima lain tidak
          ditampilkan.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <Card className="overflow-hidden">
            <div className="border-b border-border bg-gradient-to-br from-primary-soft/60 to-surface p-5 text-center sm:p-6">
              <div className="flex justify-center">
                <PayoutStatusBadge status={payout.status} />
              </div>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                {isAdmin ? "Laba bersih periode" : "Deviden Anda"}
              </p>
              <div className="mt-1">
                <MoneyText
                  value={isAdmin ? payout.netProfit : ownAmount}
                  tone={isAdmin ? "default" : "payout"}
                  size="display"
                />
              </div>
              <p className="mt-1 text-sm text-foreground-muted">
                {formatPeriod(payout.startDate, payout.endDate)}
              </p>
              <p className="mt-0.5 text-[11px] text-foreground-muted">
                {payout.id} · {formatDateTimeId(payout.createdAt)} WIB
              </p>
            </div>

            <CardContent className="pt-2">
              <dl className="divide-y divide-border">
                <Row label="Status">
                  <PayoutStatusBadge status={payout.status} />
                </Row>
                <Row label="Periode">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3.5 text-foreground-muted" aria-hidden />
                    {formatPeriod(payout.startDate, payout.endDate)}
                  </span>
                </Row>
                {isAdmin ? (
                  <>
                    <Row label="Margin penjualan">{formatRupiah(payout.grossMargin)}</Row>
                    <Row label="Beban operasional">
                      <span className="text-error-text">−{formatRupiah(payout.operatingExpense)}</span>
                    </Row>
                    <Row label="Kas ditahan">
                      <MoneyText value={payout.retainedEarnings} tone="muted" />
                    </Row>
                    <Row label="Total dibagikan">
                      <MoneyText value={distributed} tone="payout" />
                    </Row>
                  </>
                ) : (
                  <>
                    <Row label="Porsi Anda">{ownItems[0]?.weightPct ?? 0}% dari pool role</Row>
                    <Row label="Kategori">
                      {categoryLabel[ownItems[0]?.category ?? "investor_dividend"]}
                    </Row>
                  </>
                )}
                <Row label="Wallet sumber">
                  <span className="inline-flex items-center gap-1.5">
                    <WalletIcon className="size-3.5 text-foreground-muted" aria-hidden />
                    {payout.walletName ?? payout.walletId}
                  </span>
                </Row>
                {isAdmin ? (
                  <Row label="Dieksekusi oleh">{createdBy}</Row>
                ) : null}
                {payout.notes ? <Row label="Catatan">{payout.notes}</Row> : null}
              </dl>
            </CardContent>
          </Card>

          {isAdmin ? (
            <section className="mt-4 rounded-md border border-border bg-surface p-4 shadow-card sm:p-5">
              <h2 className="text-base font-semibold">Rincian alokasi</h2>
              <dl className="mt-2 divide-y divide-border">
                <Row label="Kas ditahan">
                  <MoneyText value={payout.retainedEarnings} tone="muted" />
                </Row>
                <Row label="Deviden Admin">
                  <MoneyText value={adminPool} tone="payout" />
                </Row>
                <Row label="Deviden Investor">
                  <MoneyText value={investorPool} tone="payout" />
                </Row>
                <Row label="Gaji Karyawan">
                  <MoneyText value={employeePool} tone="payout" />
                </Row>
                <Row label="Total dibagikan">
                  <MoneyText value={distributed} tone="payout" size="lg" />
                </Row>
              </dl>
            </section>
          ) : null}

          <section className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-base font-semibold">{isAdmin ? "Penerima" : "Penerimaan Anda"}</h2>
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-foreground-muted">
                {ownItems.length} baris
              </span>
            </div>
            <div className="space-y-2 md:hidden">
              {ownItems.map((item) => (
                <div key={item.id} className="rounded-md border border-border bg-surface p-3 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.userName}</p>
                      <p className="text-[11px] text-foreground-muted">
                        {categoryLabel[item.category]} · porsi {item.weightPct}%
                      </p>
                    </div>
                    <RoleBadge role={item.role} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between border-t border-border pt-1.5">
                    <span className="text-[11px] text-foreground-muted">Nominal</span>
                    <MoneyText value={item.amount} tone="payout" />
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <DataTable
                caption="Penerima payout"
                head={["Nama", "Role", "Kategori", "Porsi", "Nominal"]}
              >
                {ownItems.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-muted/40">
                    <Td className="font-medium">{item.userName}</Td>
                    <Td><RoleBadge role={item.role} /></Td>
                    <Td className="text-xs">{categoryLabel[item.category]}</Td>
                    <Td className="money text-xs">{item.weightPct}%</Td>
                    <Td><MoneyText value={item.amount} tone="payout" /></Td>
                  </tr>
                ))}
              </DataTable>
            </div>
          </section>
        </div>

        <aside className="space-y-3 lg:col-span-4">
          <div className="rounded-md border border-border bg-surface p-4 shadow-card">
            <h2 className="text-sm font-semibold">Unduh bukti</h2>
            <p className="text-[11px] leading-5 text-foreground-muted">
              PDF berisi ringkasan payout {isAdmin ? "dan seluruh penerima" : "deviden milik Anda"}.
            </p>
            <a
              href={`/api/payouts/${payout.id}/pdf`}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <Download className="size-4" aria-hidden /> Unduh PDF
            </a>
          </div>

          <div className="rounded-md border border-border bg-surface p-4 shadow-card">
            <h2 className="text-sm font-semibold">Jejak eksekusi</h2>
            <ol className="mt-3 space-y-3 border-l border-border pl-4">
              <li className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-success-text"
                />
                <p className="text-xs font-semibold">Payout selesai</p>
                <p className="text-[11px] text-foreground-muted">
                  {formatDateTimeId(payout.completedAt ?? payout.createdAt)} WIB
                </p>
              </li>
              <li className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary"
                />
                <p className="text-xs font-semibold">Dibuat</p>
                <p className="text-[11px] text-foreground-muted">
                  {formatDateTimeId(payout.createdAt)} WIB
                </p>
              </li>
              <li className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-border"
                />
                <p className="text-xs font-semibold">Periode</p>
                <p className="text-[11px] text-foreground-muted">
                  {formatDateId(payout.startDate)} – {formatDateId(payout.endDate)}
                </p>
              </li>
            </ol>
          </div>

          <div className="rounded-md border border-border bg-surface p-4 text-[11px] leading-5 text-foreground-muted shadow-card">
            <Lock className="mr-1 inline size-3.5" aria-hidden />
            Payout tidak dapat dibatalkan. Untuk koreksi, Admin perlu mencatat penyesuaian saldo
            dengan alasan audit.
          </div>

          <Button asChild variant="outline" className="w-full">
            <Link href="/profit-sharing/history">
              <ArrowLeft className="size-4" aria-hidden /> Kembali ke Riwayat
            </Link>
          </Button>
        </aside>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border p-3 text-[11px] text-foreground-muted">
        <span className="inline-flex items-center gap-1.5">
          <HandCoins className="size-3.5" aria-hidden />
          {isAdmin
            ? "Pembagian mengikuti porsi default pengguna di menu Pengguna."
            : "Deviden dihitung dari porsi default yang ditetapkan Admin."}
        </span>
        <span className="money">{payout.id}</span>
      </div>
    </div>
  );
}
