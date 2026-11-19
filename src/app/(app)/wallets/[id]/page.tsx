import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  CircleDollarSign,
  History,
  Landmark,
  Scale,
  Smartphone,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getWalletDetail, listWallets } from "@/lib/data/repository";
import { formatDateId, formatDateTimeId } from "@/lib/period";
import { formatRupiah } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money-text";
import { ActiveBadge, TransactionBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { WalletFormDialog } from "@/components/wallets/wallet-form-dialog";
import { WalletDeleteDialog } from "@/components/wallets/wallet-delete-dialog";
import { AdjustBalanceDialog } from "@/components/wallets/adjust-balance-dialog";
import type { TransactionDetail, Wallet } from "@/types/domain";
import { cn } from "@/lib/utils";

export const metadata = { title: "Detail Wallet" };

function WalletIcon({ tipe }: { tipe: Wallet["tipe"] }) {
  if (tipe === "bank") return <Landmark className="size-5" aria-hidden />;
  if (tipe === "digital") return <Smartphone className="size-5" aria-hidden />;
  return <Banknote className="size-5" aria-hidden />;
}

function signedEffect(tx: TransactionDetail, walletId: string): number {
  let effect = 0;
  if (tx.tipe === "income") {
    if (tx.walletId === walletId) effect += tx.nominal;
    if (tx.sourceWalletId === walletId && tx.sourceCost != null) effect -= tx.sourceCost;
  } else if (tx.tipe === "expense" || tx.tipe === "payout") {
    effect = tx.walletId === walletId ? -tx.nominal : 0;
  } else if (tx.tipe === "transfer") {
    if (tx.walletId === walletId) effect = -tx.nominal;
    else if (tx.destinationWalletId === walletId) effect = tx.nominal;
  }
  if (tx.reversalOf && tx.tipe !== "transfer") effect = -effect;
  return effect;
}

export default async function WalletDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireRole("admin", "investor");
  const isAdmin = user.role === "admin";
  const { id } = await params;
  const { tab } = await searchParams;
  const [data, walletList] = await Promise.all([getWalletDetail(user, id), listWallets(user)]);
  if (!data) notFound();
  const { wallet, transactions, adjustments, monthlyIn, monthlyOut } = data;
  const activeWalletCount = walletList.wallets.filter((item) => item.isActive).length;
  const activeTab = isAdmin && tab === "audit" ? "audit" : "riwayat";

  return (
    <div>
      <PageHeader
        title={wallet.nama}
        backHref="/wallets"
        description={`${wallet.tipe === "cash" ? "Cash / tunai" : wallet.tipe === "bank" ? "Rekening bank" : "Saldo digital"}${wallet.isDefault ? " · wallet default" : ""}`}
        actions={
          isAdmin ? (
            <>
              <WalletFormDialog wallet={wallet} mode="edit" />
              <WalletDeleteDialog
                wallet={wallet}
                isLastActiveWallet={wallet.isActive && activeWalletCount === 1}
              />
            </>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <MetricCard
            hero
            label="Saldo saat ini"
            value={wallet.saldo}
            icon={<WalletIcon tipe={wallet.tipe} />}
            hint={
              <span className="inline-flex flex-wrap items-center gap-2">
                <ActiveBadge active={wallet.isActive} />
                <span>Dibuat {formatDateId(wallet.createdAt.slice(0, 10))}</span>
              </span>
            }
            action={
              isAdmin ? (
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link href={`/wallets/transfer?from=${wallet.id}`}>
                      <ArrowLeftRight className="size-4" aria-hidden /> Mutasi
                    </Link>
                  </Button>
                  <AdjustBalanceDialog wallets={[wallet]} wallet={wallet} />
                </div>
              ) : null
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:col-span-5">
          <MetricCard
            label="Masuk bulan ini"
            value={monthlyIn}
            tone="income"
            icon={<CircleDollarSign className="size-5" />}
            hint="Penjualan & transfer masuk"
          />
          <MetricCard
            label="Keluar bulan ini"
            value={-monthlyOut}
            tone="expense"
            icon={<ArrowRight className="size-5" />}
            hint="Beban, transfer keluar, payout"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1 rounded-sm bg-surface-muted p-1 sm:w-auto">
        {[
          { value: "riwayat", label: "Riwayat", icon: History },
          ...(isAdmin ? [{ value: "audit", label: "Audit Penyesuaian", icon: Scale }] : []),
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.value;
          return (
            <Link
              key={item.value}
              href={`/wallets/${wallet.id}?tab=${item.value}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[6px] px-3 text-xs font-semibold sm:flex-none",
                active
                  ? "bg-surface text-foreground shadow-card"
                  : "text-foreground-muted hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden /> {item.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-3">
        {activeTab === "riwayat" ? (
          transactions.length === 0 ? (
            <EmptyState
              icon={<History className="size-7" />}
              title="Belum ada transaksi di wallet ini"
              description="Transaksi yang memakai wallet ini akan muncul di sini."
              action={
                isAdmin ? (
                  <Button asChild size="sm">
                    <Link href="/transactions/new?type=sale">+ Catat Transaksi</Link>
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => {
                const effect = signedEffect(tx, wallet.id);
                return (
                  <Link
                    key={tx.id}
                    href={`/transactions/${tx.id}`}
                    className="flex min-h-16 items-center gap-3 rounded-md border border-border bg-surface p-3 shadow-card hover:bg-surface-muted/50"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-full",
                        effect >= 0
                          ? "bg-success-soft text-success-text"
                          : "bg-error-soft text-error-text",
                      )}
                    >
                      <ArrowLeftRight className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold">
                          {tx.productName ?? tx.description}
                        </p>
                        <TransactionBadge type={tx.tipe} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-foreground-muted">
                        {formatDateTimeId(tx.tanggal)} WIB
                        {tx.destinationWalletId === wallet.id && tx.walletName
                          ? ` · dari ${tx.walletName}`
                          : tx.destinationWalletName
                            ? ` · ke ${tx.destinationWalletName}`
                            : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <MoneyText
                        value={effect}
                        signed
                        tone={effect >= 0 ? "income" : "expense"}
                      />
                      {tx.destinationWalletId === wallet.id ? (
                        <p className="text-[10px] text-foreground-muted">transfer masuk</p>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        ) : adjustments.length === 0 ? (
          <EmptyState
            icon={<Scale className="size-7" />}
            title="Belum ada penyesuaian"
            description="Perubahan saldo manual akan tercatat di sini beserta alasannya."
          />
        ) : (
          <Card className="p-4 sm:p-5">
            <ol className="relative space-y-4 border-l border-border pl-5">
              {adjustments.map((adjustment) => (
                <li key={adjustment.id} className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[26px] top-1.5 size-2.5 rounded-full border-2 border-surface bg-primary"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{formatRupiah(adjustment.newBalance)}</p>
                      <p className="text-[11px] text-foreground-muted">
                        {adjustment.oldBalance !== adjustment.newBalance
                          ? `Dari ${formatRupiah(adjustment.oldBalance)} · `
                          : ""}
                        {formatDateTimeId(adjustment.createdAt)} WIB
                      </p>
                    </div>
                    <MoneyText
                      value={adjustment.delta}
                      signed
                      tone={adjustment.delta >= 0 ? "income" : "expense"}
                    />
                  </div>
                  <p className="mt-1 rounded-sm bg-surface-muted px-2.5 py-1.5 text-xs leading-5 text-foreground-muted">
                    {adjustment.reason}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>
    </div>
  );
}
