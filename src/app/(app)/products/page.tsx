import Link from "next/link";
import { Archive, Package, RotateCcw, Search } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { listProductPrices, listProducts } from "@/lib/data/repository";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { Pagination } from "@/components/ui/pagination";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { ProductExcelActions } from "@/components/products/product-excel-actions";
import { PricePosterButton } from "@/components/products/price-poster-button";
import { ProductTable } from "@/components/products/product-table";

export const metadata = { title: "Produk" };

const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireRole("admin", "karyawan");
  const params = await searchParams;
  const q = one(params.q);
  const operator = one(params.operator);
  const view = one(params.view);
  const archived = user.role === "admin" && view === "archive";
  const page = Number(one(params.page) ?? 1) || 1;
  const limitParam = Number(one(params.limit));
  const limit = (PAGE_SIZE_OPTIONS as readonly number[]).includes(limitParam)
    ? limitParam
    : DEFAULT_PAGE_SIZE;

  const all = (await listProducts(user, { limit: 100, archived })).rows;
  const operators = Array.from(new Set(all.map((product) => product.operator))).sort();
  const result = await listProducts(user, { q, operator, page, limit, archived });
  const priceHistory =
    user.role === "admin"
      ? await listProductPrices(result.rows.map((product) => product.id))
      : [];

  const exportParams = new URLSearchParams();
  if (q) exportParams.set("q", q);
  if (operator) exportParams.set("operator", operator);
  const exportQuery = exportParams.toString();

  return (
    <div>
      <PageHeader
        title={
          archived
            ? "Arsip Produk"
            : user.role === "admin"
              ? "Produk & Margin"
              : "Katalog Produk"
        }
        description={
          archived
            ? "Produk arsip tidak muncul di katalog dan input penjualan. Riwayat transaksi tetap tersimpan dan produk bisa dipulihkan."
            : user.role === "admin"
              ? "Kelola harga jual dan modal. Margin dihitung otomatis per produk."
              : "Katalog harga jual produk aktif. Harga beli dan margin tidak ditampilkan untuk Karyawan."
        }
        actions={
          archived ? null : (
            <>
              {result.rows.length > 0 ? (
                <PricePosterButton
                  productIds={[]}
                  scopeLabel="Poster berisi semua produk aktif, dikelompokkan per operator."
                />
              ) : null}
              {user.role === "admin" ? <ProductFormDialog /> : null}
            </>
          )
        }
      />

      {user.role === "admin" ? (
        <div className="mb-3 flex w-full items-center gap-1 overflow-x-auto rounded-sm bg-surface-muted p-1 sm:w-auto">
          {[
            { value: "active", label: "Produk", href: "/products" },
            { value: "archive", label: "Arsip", href: "/products?view=archive" },
          ].map((tab) => {
            const active = archived === (tab.value === "archive");
            return (
              <Link
                key={tab.value}
                href={tab.href}
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
      ) : null}

      <FilterBar className="mb-4 items-end">
        <form action="/products" method="get" className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
          {archived ? <input type="hidden" name="view" value="archive" /> : null}
          <input type="hidden" name="limit" value={limit} />
          <div className="min-w-[180px] flex-[2]">
            <label htmlFor="q" className="mb-1 block text-[11px] font-semibold text-foreground-muted">Cari produk</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" aria-hidden />
              <Input id="q" name="q" defaultValue={q} placeholder="Nama atau operator…" className="h-10 pl-9" />
            </div>
          </div>
          <div className="min-w-[140px] flex-1">
            <label htmlFor="operator" className="mb-1 block text-[11px] font-semibold text-foreground-muted">Operator</label>
            <Select id="operator" name="operator" defaultValue={operator ?? ""} className="h-10">
              <option value="">Semua operator</option>
              {operators.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </div>
          <Button type="submit" size="sm" className="h-10">Terapkan</Button>
          <Link href={archived ? "/products?view=archive" : "/products"} className="inline-flex h-10 items-center gap-1 rounded-sm px-2 text-xs font-semibold text-foreground-muted hover:text-foreground">
            <RotateCcw className="size-3.5" aria-hidden /> Reset
          </Link>
        </form>
        {user.role === "admin" && !archived ? (
          <div className="flex flex-wrap items-end gap-2">
            <ProductExcelActions exportQuery={exportQuery} />
          </div>
        ) : null}
      </FilterBar>

      {result.rows.length === 0 ? (
        <EmptyState
          icon={archived ? <Archive className="size-7" /> : <Package className="size-7" />}
          title={
            archived
              ? q || operator
                ? "Tidak ada produk arsip yang cocok"
                : "Belum ada produk diarsipkan"
              : q || operator
                ? "Tidak ada produk yang cocok"
                : "Belum ada produk"
          }
          description={
            archived
              ? q || operator
                ? "Coba kata kunci lain atau hapus filter operator."
                : "Produk yang diarsipkan akan muncul di sini. Riwayat transaksinya tetap tersimpan."
              : q || operator
                ? "Coba kata kunci lain atau hapus filter operator."
                : user.role === "admin"
                  ? "Tambahkan produk pulsa/kuota pertama untuk mulai mencatat penjualan."
                  : "Admin belum menambahkan produk aktif."
          }
          action={
            archived ? (
              q || operator ? <Button asChild variant="outline" size="sm"><Link href="/products?view=archive">Reset filter</Link></Button> : undefined
            ) : user.role === "admin" ? (
              q || operator ? <Button asChild variant="outline" size="sm"><Link href="/products">Reset filter</Link></Button> : <ProductFormDialog />
            ) : (
              <Button asChild variant="outline" size="sm"><Link href="/dashboard">Kembali</Link></Button>
            )
          }
        />
      ) : (
        <>
          <ProductTable
            key={`${archived ? "archive" : "active"}-${result.page}-${limit}-${q ?? ""}-${operator ?? ""}`}
            products={result.rows}
            priceHistory={priceHistory}
            isAdmin={user.role === "admin"}
            archived={archived}
          />

          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            total={result.total}
            limit={result.limit}
            basePath="/products"
            params={{ q, operator, view: archived ? "archive" : undefined, limit: String(limit) }}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        </>
      )}
    </div>
  );
}
