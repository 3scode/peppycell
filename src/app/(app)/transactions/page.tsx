import Link from "next/link";
import { ArrowLeftRight, Download, Plus, ReceiptText } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import {
  listActiveWalletsForTransactions,
  listProducts,
  listTransactions,
  listUsers,
  listWalletOptions,
} from "@/lib/data/repository";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TransactionList } from "@/components/transactions/transaction-list";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { Pagination } from "@/components/ui/pagination";

export const metadata = { title: "Transaksi" };

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function hrefWith(base: string, params: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...patch })) {
    if (value && value !== "all") search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

const typeTabs = [
  { value: "all", label: "Semua" },
  { value: "income", label: "Masuk" },
  { value: "expense", label: "Keluar" },
  { value: "transfer", label: "Transfer" },
  { value: "payout", label: "Payout" },
];

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requireRole("admin", "investor");
  const params = await searchParams;
  const type = one(params.type);
  const from = one(params.from);
  const to = one(params.to);
  const walletId = one(params.walletId);
  const userId = one(params.userId);
  const q = one(params.q);
  const page = Number(one(params.page) ?? 1) || 1;

  const result = await listTransactions(user, {
    type: type && type !== "all" ? type : undefined,
    from,
    to,
    walletId,
    userId,
    q,
    page,
    limit: 25,
  });

  const wallets = await listActiveWalletsForTransactions(user);
  const voucherWallets = user.role === "admin" ? await listWalletOptions(user) : [];
  const users =
    user.role === "admin" ? (await listUsers(user)).filter((u) => u.isActive && !u.deletedAt) : [];
  const allProducts =
    user.role === "admin" ? (await listProducts(user, { limit: 100 })).rows : [];
  const productOptions = allProducts.map((product) => ({
    id: product.id,
    nama: product.nama,
    hargaJual: product.hargaJual,
  }));

  const activeFilters = {
    type: type && type !== "all" ? type : undefined,
    from,
    to,
    walletId,
    userId,
    q,
  };

  return (
    <div>
      <PageHeader
        title="Transaksi"
        description={
          user.role === "investor"
            ? "Anda melihat seluruh jurnal secara read-only. Data modal dan margin tidak ditampilkan."
            : "Semua pemasukan, pengeluaran, mutasi, dan payout dalam satu jurnal."
        }
        actions={
          <>
            {user.role === "admin" ? (
              <>
                <Link
                  href={`/wallets/transfer${walletId ? `?from=${encodeURIComponent(walletId)}` : ""}`}
                  className="inline-flex h-11 items-center gap-1.5 rounded-sm border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-muted"
                >
                  <ArrowLeftRight className="size-4" aria-hidden /> Transfer
                </Link>
                <a
                  href={`/api/export/transactions?${new URLSearchParams(
                    Object.entries(activeFilters).filter(([, v]) => Boolean(v)) as [string, string][],
                  ).toString()}`}
                  className="inline-flex h-11 items-center gap-1.5 rounded-sm border border-border bg-surface px-3 text-sm font-semibold hover:bg-surface-muted"
                >
                  <Download className="size-4" aria-hidden /> Export CSV
                </a>
              </>
            ) : null}
            {user.role === "admin" ? (
              <Button asChild size="sm" className="h-11">
                <Link href="/transactions/new?type=sale">
                  <Plus className="size-4" aria-hidden /> Catat
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex w-full items-center gap-1 overflow-x-auto rounded-sm bg-surface-muted p-1 sm:w-auto">
          {typeTabs.map((tab) => {
            const active = (type ?? "all") === tab.value || (tab.value === "all" && !type);
            return (
              <Link
                key={tab.value}
                href={hrefWith("/transactions", activeFilters, { type: tab.value, page: undefined })}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "inline-flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-[6px] bg-surface px-3 text-xs font-semibold text-foreground shadow-card sm:flex-none"
                    : "inline-flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-[6px] px-3 text-xs font-semibold text-foreground-muted hover:text-foreground sm:flex-none"
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      <TransactionFilters
        type={type}
        from={from}
        to={to}
        walletId={walletId}
        userId={userId}
        q={q}
        wallets={wallets}
        users={users}
        showWallet={user.role === "admin" || user.role === "investor"}
        showUser={user.role === "admin"}
      />

      {user.role === "investor" ? (
        <div className="mb-3 rounded-sm border border-border bg-surface-muted/60 px-3 py-2 text-[11px] text-foreground-muted">
          Mode read-only: Anda dapat melihat seluruh jurnal, tetapi tidak dapat mencatat,
          mengubah, atau menghapus transaksi. Data modal dan margin tidak ditampilkan.
        </div>
      ) : null}

      {result.rows.length === 0 ? (
        <EmptyState
          title={q || from || to || type ? "Tidak ada transaksi yang cocok" : "Belum ada transaksi"}
          description={
            q || from || to || type
              ? "Coba ubah rentang tanggal atau hapus filter."
              : user.role === "investor"
                ? "Belum ada transaksi pada filter ini."
                : "Mulai catat penjualan atau pengeluaran pertama."
          }
          icon={<ReceiptText className="size-7" />}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {q || from || to || type ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/transactions">Reset filter</Link>
                </Button>
              ) : null}
              {user.role === "admin" ? (
                <Button asChild size="sm">
                  <Link href="/transactions/new?type=sale">+ Catat Transaksi</Link>
                </Button>
              ) : null}
            </div>
          }
        />
      ) : (
        <>
          <TransactionList
            rows={result.rows}
            canManage={user.role === "admin"}
            canConvert={user.role === "admin"}
            products={productOptions}
            wallets={wallets}
            voucherWallets={voucherWallets}
          />

          <div className="md:hidden">
            <Pagination
              page={result.page}
              totalPages={result.totalPages}
              total={result.total}
              limit={result.limit}
              basePath="/transactions"
              params={activeFilters}
            />
          </div>
        </>
      )}
    </div>
  );
}
