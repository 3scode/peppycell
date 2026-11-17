import { requireRole } from "@/lib/auth/session";
import Link from "next/link";
import { Wallet as WalletIcon } from "lucide-react";
import {
  getPayoutSettings,
  listPayouts,
  listWallets,
} from "@/lib/data/repository";
import { addDays, formatPeriod, lastClosedWeek } from "@/lib/period";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { PayoutWizard } from "@/components/payouts/payout-wizard";

export const metadata = { title: "Wizard Bagi Hasil" };

export default async function NewPayoutPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireRole("admin");
  const { period } = await searchParams;
  const closed = lastClosedWeek();
  const periods = Array.from({ length: 8 }, (_, index) => {
    const start = addDays(closed.start, -7 * index);
    return { start, end: addDays(start, 6) };
  });
  const wallets = (await listWallets(user)).wallets.filter((wallet) => wallet.isActive);
  const settings = await getPayoutSettings();
  const paidStarts = (await listPayouts(user, { limit: 100 })).rows.map((payout) => payout.startDate);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Wizard Bagi Hasil"
        backHref="/profit-sharing"
        eyebrow="Tiga langkah"
        description={`Periode terakhir yang dapat diproses: ${formatPeriod(closed.start, closed.end)}.`}
      />
      {wallets.length === 0 ? (
        <EmptyState
          icon={<WalletIcon className="size-7" />}
          title="Belum ada wallet aktif"
          description="Bagi hasil memotong saldo wallet sumber. Buat wallet dulu sebelum memproses payout."
          action={
            <Link
              href="/wallets"
              className="inline-flex h-10 items-center rounded-sm bg-primary px-4 text-xs font-semibold text-primary-foreground"
            >
              + Buat Wallet
            </Link>
          }
        />
      ) : (
        <PayoutWizard
          periods={periods}
          wallets={wallets}
          settings={settings}
          paidStarts={paidStarts}
          initialStart={period}
        />
      )}
    </div>
  );
}
