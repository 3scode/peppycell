import Link from "next/link";
import { ArrowLeftRight, Wallet as WalletIcon } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { listWallets } from "@/lib/data/repository";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { TransferForm } from "@/components/wallets/transfer-form";

export const metadata = { title: "Mutasi Aset" };

export default async function TransferPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await requireRole("admin");
  const { from } = await searchParams;
  const wallets = (await listWallets(user)).wallets.filter((wallet) => wallet.isActive);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Mutasi Aset"
        backHref="/wallets"
        eyebrow="Perpindahan saldo"
        description="Pindahkan saldo antar wallet. Sistem mencatat jurnal keluar dan masuk yang konsisten."
      />

      {wallets.length < 2 ? (
        <EmptyState
          icon={<WalletIcon className="size-7" />}
          title="Butuh minimal 2 wallet aktif"
          description="Mutasi memindahkan saldo dari satu wallet ke wallet lain. Tambahkan wallet baru terlebih dahulu."
          action={
            <Button asChild size="sm">
              <Link href="/wallets">+ Buat Wallet</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 text-[11px] text-foreground-muted">
            <ArrowLeftRight className="size-3.5" aria-hidden />
            Saldo asal dan tujuan diperbarui dalam satu transaksi.
          </div>
          <TransferForm wallets={wallets} initialFrom={from} />
        </>
      )}
    </div>
  );
}
