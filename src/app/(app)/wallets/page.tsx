import Link from "next/link";
import {
  ArrowLeftRight,
  Banknote,
  Landmark,
  Smartphone,
  Wallet as WalletIcon,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getCapital, listWallets } from "@/lib/data/repository";
import { formatDateTimeId } from "@/lib/period";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money-text";
import { ActiveBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { WalletFormDialog } from "@/components/wallets/wallet-form-dialog";
import { WalletDeleteDialog } from "@/components/wallets/wallet-delete-dialog";
import { AdjustBalanceDialog } from "@/components/wallets/adjust-balance-dialog";
import { WalletsRealtime } from "@/components/wallets/wallets-realtime";
import type { Wallet } from "@/types/domain";

export const metadata = { title: "Wallet & Aset" };

function WalletTypeIcon({ tipe }: { tipe: Wallet["tipe"] }) {
  if (tipe === "bank") return <Landmark className="size-5" aria-hidden />;
  if (tipe === "digital") return <Smartphone className="size-5" aria-hidden />;
  return <Banknote className="size-5" aria-hidden />;
}

function typeLabel(tipe: Wallet["tipe"]) {
  return tipe === "bank" ? "Rekening bank" : tipe === "digital" ? "Saldo digital" : "Cash / tunai";
}

export default async function WalletsPage() {
  const user = await requireRole("admin", "investor");
  const isAdmin = user.role === "admin";
  const [{ wallets, totalAssets }, capital] = await Promise.all([
    listWallets(user),
    getCapital(user),
  ]);
  const runningProfit = totalAssets - capital;
  const activeWallets = wallets.filter((wallet) => wallet.isActive);
  const inactiveWallets = wallets.filter((wallet) => !wallet.isActive);

  return (
    <div>
      <WalletsRealtime enabled={isAdmin} />
      <PageHeader
        title="Wallet & Aset"
        description={
          isAdmin
            ? "Pantau total aset dan saldo per wallet. Semua perubahan saldo punya jejak audit."
            : "Pantau total aset dan saldo per wallet secara read-only."
        }
        actions={isAdmin ? <WalletFormDialog /> : null}
      />

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-8">
          <MetricCard
            hero
            label="Total aset"
            value={totalAssets}
            icon={<WalletIcon className="size-5" />}
            hint={
              <>
                {activeWallets.length} wallet aktif
                {inactiveWallets.length > 0 ? ` · ${inactiveWallets.length} nonaktif` : ""}
                <span className="mt-1 block">Saldo semua wallet — bukan laba bersih.</span>
              </>
            }
            action={
              isAdmin ? (
                wallets.length === 0 ? (
                  <WalletFormDialog />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link href="/wallets/transfer">
                        <ArrowLeftRight className="size-4" aria-hidden /> Mutasi Aset
                      </Link>
                    </Button>
                    <AdjustBalanceDialog wallets={wallets} variant="outline" />
                  </div>
                )
              ) : null
            }
          >
            {capital > 0 ? (
              <dl className="grid grid-cols-2 gap-3 border-t border-border/70 pt-3">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
                    Modal disetor
                  </dt>
                  <dd className="mt-0.5">
                    <MoneyText value={capital} size="sm" tone="muted" />
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
                    Laba berjalan
                  </dt>
                  <dd className="mt-0.5">
                    <MoneyText
                      value={runningProfit}
                      size="sm"
                      signed
                      tone={runningProfit < 0 ? "expense" : "income"}
                    />
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="border-t border-border/70 pt-3 text-xs text-foreground-muted">
                Modal belum diatur.{" "}
                {isAdmin ? (
                  <Link
                    href="/settings#usaha"
                    className="font-semibold text-primary hover:underline"
                  >
                    Atur modal usaha
                  </Link>
                ) : null}
              </p>
            )}
          </MetricCard>
        </div>
        <aside className="lg:col-span-4">
          <Alert tone="info" title="Aset ≠ laba">
            Total aset = modal + laba berjalan. Laba berjalan di halaman ini dihitung dari
            total aset − modal disetor. Dashboard menghitung laba dari margin penjualan −
            beban, jadi angkanya bisa beda kalau ada prive atau penyesuaian saldo. Catat uang
            keluar untuk biaya lewat menu Pengeluaran supaya keduanya akurat.
          </Alert>
        </aside>
      </div>

      {wallets.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={<WalletIcon className="size-7" />}
          title="Belum ada wallet"
          description={
            isAdmin
              ? "Buat wallet untuk memisahkan uang cash, rekening bank, dan saldo digital."
              : "Belum ada wallet yang terdaftar."
          }
          action={isAdmin ? <WalletFormDialog /> : null}
        />
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {wallets.map((wallet) => (
            <Card
              key={wallet.id}
              className={wallet.isActive ? "p-4" : "border-dashed p-4 opacity-70"}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={
                      wallet.isDefault
                        ? "flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
                        : "flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-foreground-muted"
                    }
                  >
                    <WalletTypeIcon tipe={wallet.tipe} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{wallet.nama}</p>
                    <p className="text-[11px] text-foreground-muted">
                      {typeLabel(wallet.tipe)}
                      {wallet.isDefault ? " · default" : ""}
                    </p>
                  </div>
                </div>
                <ActiveBadge active={wallet.isActive} />
              </div>

              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
                  Saldo
                </p>
                <MoneyText value={wallet.saldo} size="lg" tone={wallet.saldo > 0 ? "default" : "muted"} />
                <p className="mt-0.5 text-[10px] text-foreground-muted">
                  Dibuat {formatDateTimeId(wallet.createdAt)}
                </p>
              </div>

              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                <Link
                  href={`/wallets/${wallet.id}`}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-sm bg-surface-muted text-xs font-semibold text-foreground hover:bg-surface-muted/70"
                >
                  Detail
                </Link>
                {isAdmin ? (
                  <>
                    <WalletFormDialog wallet={wallet} mode="edit" />
                    <WalletDeleteDialog
                      wallet={wallet}
                      isLastActiveWallet={wallet.isActive && activeWallets.length === 1}
                    />
                  </>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
