import Link from "next/link";
import { RotateCcw, Search, Ticket, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import {
  getVoucherSummary,
  listProducts,
  listVouchers,
  listWalletOptions,
} from "@/lib/data/repository";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { VoucherTable } from "@/components/vouchers/voucher-table";

export const metadata = { title: "Stok Voucher" };

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const statusOptions = [
  { value: "available", label: "Belum terjual" },
  { value: "sold", label: "Terjual" },
  { value: "all", label: "Semua status" },
];

export default async function VouchersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireRole("admin", "karyawan");
  const params = await searchParams;
  const status = one(params.status) ?? "available";
  const productId = one(params.productId);
  const q = one(params.q);
  const page = Number(one(params.page) ?? 1) || 1;
  const limitParam = Number(one(params.limit));
  const limit = (PAGE_SIZE_OPTIONS as readonly number[]).includes(limitParam)
    ? limitParam
    : DEFAULT_PAGE_SIZE;

  const [result, summary, productRows, wallets] = await Promise.all([
    listVouchers(user, { status, productId, q, page, limit }),
    getVoucherSummary(user),
    listProducts(user, { limit: 100 }),
    listWalletOptions(user),
  ]);

  const products = productRows.rows.map((product) => ({ id: product.id, nama: product.nama }));

  return (
    <div>
      <PageHeader
        title="Stok Voucher"
        description="Voucher yang belum terjual. Tandai terjual untuk otomatis membuat transaksi penjualan."
        actions={
          <Button asChild variant="outline" size="sm" className="h-11">
            <Link href="/transactions">
              <Ticket className="size-4" aria-hidden /> Catat dari transaksi
            </Link>
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <MetricCard
          label="Voucher belum terjual"
          value={`${summary.available} unit`}
          hint="Siap dijual"
          icon={<Ticket className="size-4" />}
        />
        <MetricCard
          label="Nilai stok"
          value={summary.totalCost}
          hint="Total harga beli voucher yang masih tersedia"
          icon={<Wallet className="size-4" />}
          tone="transfer"
        />
      </div>

      <FilterBar className="mb-4 items-end">
        <form action="/vouchers" method="get" className="flex w-full flex-wrap items-end gap-2">
          <input type="hidden" name="limit" value={limit} />
          <div className="min-w-[180px] flex-[2]">
            <label htmlFor="q" className="mb-1 block text-[11px] font-semibold text-foreground-muted">
              Cari kode / produk
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
                aria-hidden
              />
              <Input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Kode voucher atau nama produk…"
                className="h-10 pl-9"
              />
            </div>
          </div>
          <div className="min-w-[140px] flex-1">
            <label htmlFor="status" className="mb-1 block text-[11px] font-semibold text-foreground-muted">
              Status
            </label>
            <Select id="status" name="status" defaultValue={status} className="h-10">
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-[150px] flex-1">
            <label htmlFor="productId" className="mb-1 block text-[11px] font-semibold text-foreground-muted">
              Produk
            </label>
            <Select id="productId" name="productId" defaultValue={productId ?? ""} className="h-10">
              <option value="">Semua produk</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.nama}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" size="sm" className="h-10">
            Terapkan
          </Button>
          <Link
            href="/vouchers"
            className="inline-flex h-10 items-center gap-1 rounded-sm px-2 text-xs font-semibold text-foreground-muted hover:text-foreground"
          >
            <RotateCcw className="size-3.5" aria-hidden /> Reset
          </Link>
        </form>
      </FilterBar>

      {result.rows.length === 0 ? (
        <EmptyState
          icon={<Ticket className="size-7" />}
          title={q || productId ? "Tidak ada voucher yang cocok" : "Belum ada stok voucher"}
          description={
            q || productId
              ? "Coba kata kunci lain atau hapus filter."
              : "Buka Transaksi, centang penjualan, lalu klik “Voucher belum terjual” untuk mengubahnya jadi stok."
          }
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/transactions">Buka Transaksi</Link>
            </Button>
          }
        />
      ) : (
        <>
          <VoucherTable
            key={`${result.page}-${limit}-${status}-${productId ?? ""}-${q ?? ""}`}
            vouchers={result.rows}
            wallets={wallets}
            products={products}
            isAdmin={user.role === "admin"}
          />

          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            total={result.total}
            limit={result.limit}
            basePath="/vouchers"
            params={{ status, productId, q, limit: String(limit) }}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        </>
      )}
    </div>
  );
}
