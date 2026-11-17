import Link from "next/link";
import { Wallet as WalletIcon } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import {
  getDefaultWalletLabel,
  hasActiveWallet,
  listProducts,
  listWallets,
} from "@/lib/data/repository";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SaleForm } from "@/components/transactions/sale-form";
import { ExpenseForm } from "@/components/transactions/expense-form";

export const metadata = { title: "Catat Transaksi" };

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await requireRole("admin", "karyawan");
  const { type } = await searchParams;
  const mode = type === "expense" ? "expense" : "sale";

  const allProducts = (await listProducts(user, { limit: 100 })).rows.filter(
    (product) => product.isActive,
  );
  const products = allProducts.map((product) => ({
    id: product.id,
    nama: product.nama,
    operator: product.operator,
    hargaJual: product.hargaJual,
    hargaBeli: product.hargaBeli,
  }));
  const wallets =
    user.role === "admin"
      ? (await listWallets(user)).wallets
          .filter((wallet) => wallet.isActive)
          .map((wallet) => ({
            id: wallet.id,
            nama: wallet.nama,
            saldo: wallet.saldo,
            isDefault: wallet.isDefault,
          }))
      : null;

  const walletLabel = await getDefaultWalletLabel();
  const operatorRole = user.role === "admin" ? "admin" : "karyawan";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={mode === "sale" ? "Catat Penjualan" : "Catat Pengeluaran"}
        backHref="/transactions"
        description={
          mode === "sale"
            ? "Pilih produk, atur jumlah, lalu simpan. Saldo Cash bertambah otomatis."
            : "Catat biaya operasional, gaji, atau pengeluaran lain ke wallet yang tepat."
        }
      >
        <div className="inline-flex w-full items-center gap-1 rounded-sm bg-surface-muted p-1 sm:w-auto">
          <Link
            href="/transactions/new?type=sale"
            aria-current={mode === "sale" ? "page" : undefined}
            className={
              mode === "sale"
                ? "inline-flex h-9 flex-1 items-center justify-center rounded-[6px] bg-surface px-4 text-xs font-semibold shadow-card sm:flex-none"
                : "inline-flex h-9 flex-1 items-center justify-center rounded-[6px] px-4 text-xs font-semibold text-foreground-muted sm:flex-none"
            }
          >
            Penjualan
          </Link>
          <Link
            href="/transactions/new?type=expense"
            aria-current={mode === "expense" ? "page" : undefined}
            className={
              mode === "expense"
                ? "inline-flex h-9 flex-1 items-center justify-center rounded-[6px] bg-surface px-4 text-xs font-semibold shadow-card sm:flex-none"
                : "inline-flex h-9 flex-1 items-center justify-center rounded-[6px] px-4 text-xs font-semibold text-foreground-muted sm:flex-none"
            }
          >
            Pengeluaran
          </Link>
        </div>
      </PageHeader>

      {!await hasActiveWallet() ? (
        <EmptyState
          icon={<WalletIcon className="size-7" />}
          title="Belum ada wallet aktif"
          description={
            user.role === "admin"
              ? "Transaksi butuh wallet untuk mencatat saldo masuk dan keluar. Buat wallet dulu, lalu kembali ke halaman ini."
              : "Transaksi butuh wallet. Hubungi Admin untuk membuat wallet terlebih dahulu."
          }
          action={
            user.role === "admin" ? (
              <Link
                href="/wallets"
                className="inline-flex h-10 items-center rounded-sm bg-primary px-4 text-xs font-semibold text-primary-foreground"
              >
                + Buat Wallet
              </Link>
            ) : undefined
          }
        />
      ) : mode === "sale" ? (
        products.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-surface p-8 text-center">
            <h2 className="text-sm font-semibold">Produk belum tersedia</h2>
            <p className="mt-1 text-xs text-foreground-muted">
              {user.role === "admin"
                ? "Tambahkan produk dulu sebelum mencatat penjualan."
                : "Hubungi Admin untuk menambahkan produk."}
            </p>
            {user.role === "admin" ? (
              <Link href="/products" className="mt-4 inline-flex h-10 items-center rounded-sm bg-primary px-4 text-xs font-semibold text-primary-foreground">
                + Tambah Produk
              </Link>
            ) : null}
          </div>
        ) : (
          <SaleForm products={products} walletLabel={walletLabel} wallets={wallets} role={operatorRole} />
        )
      ) : (
        <ExpenseForm
          role={operatorRole}
          wallets={wallets}
          defaultWalletLabel={walletLabel}
        />
      )}
    </div>
  );
}
