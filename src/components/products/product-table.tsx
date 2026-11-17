"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { archiveProductsAction, restoreProductsAction } from "@/actions/products";
import type { Product, ProductPrice } from "@/types/domain";
import { formatRupiah } from "@/lib/money";
import { formatDateTimeId } from "@/lib/period";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable, Td } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { SelectAllCheckbox } from "@/components/ui/select-all-checkbox";
import { ProductStatusBadge } from "@/components/ui/status-badge";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { ProductPriceDialog } from "@/components/products/product-price-dialog";
import { PricePosterButton } from "@/components/products/price-poster-button";
import { cn } from "@/lib/utils";

function marginOf(product: { hargaJual: number; hargaBeli?: number }) {
  const cost = product.hargaBeli ?? 0;
  return {
    amount: product.hargaJual - cost,
    pct: product.hargaJual > 0 ? ((product.hargaJual - cost) / product.hargaJual) * 100 : 0,
  };
}

function ArchiveButton({ product, onArchive }: { product: Product; onArchive: () => void }) {
  return (
    <button
      type="button"
      onClick={onArchive}
      aria-label={`Arsipkan ${product.nama}`}
      className="inline-flex h-9 items-center gap-1 rounded-sm border border-warning/30 px-2.5 text-xs font-semibold text-warning-text hover:bg-warning-soft"
    >
      <Archive className="size-3.5" aria-hidden /> Arsipkan
    </button>
  );
}

function RestoreButton({ product, onRestore }: { product: Product; onRestore: () => void }) {
  return (
    <button
      type="button"
      onClick={onRestore}
      aria-label={`Pulihkan ${product.nama}`}
      className="inline-flex h-9 items-center gap-1 rounded-sm border border-success/25 px-2.5 text-xs font-semibold text-success-text hover:bg-success-soft"
    >
      <ArchiveRestore className="size-3.5" aria-hidden /> Pulihkan
    </button>
  );
}

function RaisePriceButton({
  product,
  onRaise,
}: {
  product: Product;
  onRaise: (product: Product) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onRaise(product)}
      aria-label={`Naikkan harga ${product.nama}`}
      className="inline-flex h-9 items-center gap-1 rounded-sm border border-border px-2.5 text-xs font-semibold hover:bg-surface-muted"
    >
      <TrendingUp className="size-3.5" aria-hidden /> Harga
    </button>
  );
}

export function ProductTable({
  products,
  priceHistory,
  isAdmin,
  archived = false,
}: {
  products: Product[];
  priceHistory: ProductPrice[];
  isAdmin: boolean;
  archived?: boolean;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [raiseTargets, setRaiseTargets] = useState<Product[] | null>(null);
  const [archiveTargets, setArchiveTargets] = useState<string[] | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [restoreTargets, setRestoreTargets] = useState<string[] | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const selectedOnPage = useMemo(
    () => products.filter((product) => selectedIds.has(product.id)),
    [products, selectedIds],
  );
  const allSelected = products.length > 0 && selectedOnPage.length === products.length;
  const someSelected = selectedOnPage.length > 0 && !allSelected;
  const selectedCount = selectedOnPage.length;

  const archiveTargetProducts = useMemo(
    () =>
      archiveTargets
        ? products.filter((product) => archiveTargets.includes(product.id))
        : [],
    [archiveTargets, products],
  );

  const restoreTargetProducts = useMemo(
    () =>
      restoreTargets
        ? products.filter((product) => restoreTargets.includes(product.id))
        : [],
    [restoreTargets, products],
  );

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(products.map((product) => product.id)) : new Set());
  }

  function requestArchive(ids: string[]) {
    setArchiveError(null);
    setArchiveTargets(ids);
  }

  function closeArchiveDialog() {
    if (archiving) return;
    setArchiveTargets(null);
    setArchiveError(null);
  }

  async function confirmArchive() {
    if (!archiveTargets || archiveTargets.length === 0) return;
    setArchiving(true);
    setArchiveError(null);
    const result = await archiveProductsAction({ ids: archiveTargets });
    setArchiving(false);
    if (!result.ok) {
      setArchiveError(result.error?.message ?? "Gagal mengarsipkan produk.");
      return;
    }
    const count = result.data?.archived ?? 0;
    toast.success(count === 1 ? "Produk diarsipkan." : `${count} produk diarsipkan.`);
    setSelectedIds(new Set());
    setArchiveTargets(null);
    router.refresh();
  }

  function requestRestore(ids: string[]) {
    setRestoreError(null);
    setRestoreTargets(ids);
  }

  function closeRestoreDialog() {
    if (restoring) return;
    setRestoreTargets(null);
    setRestoreError(null);
  }

  async function confirmRestore() {
    if (!restoreTargets || restoreTargets.length === 0) return;
    setRestoring(true);
    setRestoreError(null);
    const result = await restoreProductsAction({ ids: restoreTargets });
    setRestoring(false);
    if (!result.ok) {
      setRestoreError(result.error?.message ?? "Gagal memulihkan produk.");
      return;
    }
    const count = result.data?.restored ?? 0;
    toast.success(
      count === 1 ? "Produk dipulihkan sebagai nonaktif." : `${count} produk dipulihkan sebagai nonaktif.`,
    );
    setSelectedIds(new Set());
    setRestoreTargets(null);
    router.refresh();
  }

  const selectAllProps = {
    checked: allSelected,
    indeterminate: someSelected,
    onChange: toggleAll,
  };

  return (
    <>
      {isAdmin && selectedCount > 0 ? (
        <div
          role="status"
          aria-live="polite"
          className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary-soft px-3 py-2"
        >
          <p className="text-xs font-semibold text-foreground">
            {selectedCount} produk dipilih
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Batal pilih
            </Button>
            {archived ? (
              <Button
                variant="success"
                size="sm"
                onClick={() => requestRestore(selectedOnPage.map((product) => product.id))}
              >
                <ArchiveRestore className="size-4" aria-hidden /> Pulihkan terpilih
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRaiseTargets(selectedOnPage)}
                >
                  <TrendingUp className="size-4" aria-hidden /> Naikkan Harga
                </Button>
                <PricePosterButton
                  productIds={selectedOnPage.map((product) => product.id)}
                  scopeLabel={`Poster berisi ${selectedCount} produk yang dipilih.`}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="border-warning/30 text-warning-text hover:bg-warning-soft"
                  onClick={() => requestArchive(selectedOnPage.map((product) => product.id))}
                >
                  <Archive className="size-4" aria-hidden /> Arsipkan terpilih
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div className="space-y-2 md:hidden">
        {isAdmin ? (
          <label className="flex items-center gap-2 px-1 pb-0.5 text-xs font-medium text-foreground-muted">
            <SelectAllCheckbox
              {...selectAllProps}
              label="Pilih semua produk di halaman ini"
            />
            Pilih semua
          </label>
        ) : null}
        {products.map((product) => {
          const margin = marginOf(product);
          const selected = selectedIds.has(product.id);
          return (
            <div
              key={product.id}
              className={cn(
                "rounded-md border border-border bg-surface p-3.5 shadow-card",
                selected && "border-primary/40 bg-primary-soft/30",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                  {isAdmin ? (
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => toggleOne(product.id, event.target.checked)}
                      aria-label={`Pilih ${product.nama}`}
                      className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{product.nama}</p>
                    <p className="mt-0.5 text-[11px] text-foreground-muted">{product.operator}</p>
                    {archived && product.archivedAt ? (
                      <p className="mt-0.5 text-[11px] text-foreground-muted">
                        Diarsipkan {formatDateTimeId(product.archivedAt)}
                      </p>
                    ) : null}
                  </div>
                </div>
                <ProductStatusBadge active={product.isActive} archived={archived} />
              </div>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-foreground-muted">Harga jual</p>
                  <p className="money text-sm font-semibold text-foreground">{formatRupiah(product.hargaJual)}</p>
                  {isAdmin ? (
                    <p className="mt-0.5 text-[11px] text-foreground-muted">
                      Beli {formatRupiah(product.hargaBeli ?? 0)} ·{" "}
                      <span className={margin.amount >= 0 ? "font-semibold text-success-text" : "font-semibold text-error-text"}>
                        margin {formatRupiah(margin.amount)} ({margin.pct.toFixed(1).replace(".", ",")}%)
                      </span>
                    </p>
                  ) : null}
                </div>
                {isAdmin ? (
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {archived ? (
                      <RestoreButton product={product} onRestore={() => requestRestore([product.id])} />
                    ) : (
                      <>
                        <RaisePriceButton product={product} onRaise={(item) => setRaiseTargets([item])} />
                        <ProductFormDialog product={product} mode="edit" />
                        <ArchiveButton product={product} onArchive={() => requestArchive([product.id])} />
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden md:block">
        <DataTable
          caption={archived ? "Daftar produk diarsipkan" : "Daftar produk"}
          head={
            isAdmin
              ? [
                  <SelectAllCheckbox
                    key="select-all"
                    {...selectAllProps}
                    label="Pilih semua produk di halaman ini"
                  />,
                  "Nama Produk",
                  "Operator",
                  "Harga Beli",
                  "Harga Jual",
                  "Margin",
                  "Status",
                  "Aksi",
                ]
              : ["Nama Produk", "Operator", "Harga Jual", "Status"]
          }
        >
          {products.map((product) => {
            const margin = marginOf(product);
            const selected = selectedIds.has(product.id);
            return (
              <tr
                key={product.id}
                className={cn("hover:bg-surface-muted/40", selected && "bg-primary-soft/30")}
              >
                {isAdmin ? (
                  <Td className="w-10 pr-0">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => toggleOne(product.id, event.target.checked)}
                      aria-label={`Pilih ${product.nama}`}
                      className="size-4 rounded border-input accent-primary"
                    />
                  </Td>
                ) : null}
                <Td className="font-medium">{product.nama}</Td>
                <Td className="text-xs text-foreground-muted">{product.operator}</Td>
                {isAdmin ? (
                  <>
                    <Td className="money">{formatRupiah(product.hargaBeli ?? 0)}</Td>
                    <Td className="money">{formatRupiah(product.hargaJual)}</Td>
                    <Td>
                      <span className={margin.amount >= 0 ? "money font-semibold text-success-text" : "money font-semibold text-error-text"}>
                        {formatRupiah(margin.amount)}
                      </span>
                      <span className="ml-1 text-[11px] text-foreground-muted">
                        ({margin.pct.toFixed(1).replace(".", ",")}%)
                      </span>
                    </Td>
                  </>
                ) : (
                  <Td className="money">{formatRupiah(product.hargaJual)}</Td>
                )}
                <Td>
                  <ProductStatusBadge active={product.isActive} archived={archived} />
                  {archived && product.archivedAt ? (
                    <span className="mt-0.5 block text-[11px] text-foreground-muted">
                      {formatDateTimeId(product.archivedAt)}
                    </span>
                  ) : null}
                </Td>
                {isAdmin ? (
                  <Td>
                    {archived ? (
                      <RestoreButton product={product} onRestore={() => requestRestore([product.id])} />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <RaisePriceButton product={product} onRaise={(item) => setRaiseTargets([item])} />
                        <ProductFormDialog product={product} mode="edit" />
                        <ArchiveButton product={product} onArchive={() => requestArchive([product.id])} />
                      </div>
                    )}
                  </Td>
                ) : null}
              </tr>
            );
          })}
        </DataTable>
      </div>

      {raiseTargets ? (
        <ProductPriceDialog
          onClose={() => setRaiseTargets(null)}
          products={raiseTargets}
          priceHistory={priceHistory}
          onSaved={() => setSelectedIds(new Set())}
        />
      ) : null}

      <Modal
        open={archiveTargets !== null}
        onClose={closeArchiveDialog}
        title={
          archiveTargetProducts.length > 1
            ? `Arsipkan ${archiveTargetProducts.length} produk?`
            : "Arsipkan produk?"
        }
        description="Produk disembunyikan dari katalog dan input penjualan, tanpa menghapus data."
        size="sm"
        footer={
          <>
            <Button variant="outline" type="button" onClick={closeArchiveDialog} disabled={archiving}>
              Batal
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={confirmArchive}
              loading={archiving}
              className="border-warning/30 text-warning-text hover:bg-warning-soft"
            >
              <Archive className="size-4" aria-hidden />
              {archiving ? "Mengarsipkan…" : "Arsipkan Produk"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {archiveError ? <Alert tone="error">{archiveError}</Alert> : null}
          <Alert tone="info" title="Riwayat transaksi tetap tersimpan">
            Transaksi lama tetap terhubung ke produk ini. Produk bisa dipulihkan kapan saja dari tab Arsip.
          </Alert>
          <div>
            <p className="text-xs font-semibold text-foreground-muted">
              Produk yang akan diarsipkan:
            </p>
            <ul className="mt-1.5 space-y-1">
              {archiveTargetProducts.slice(0, 6).map((product) => (
                <li
                  key={product.id}
                  className="truncate rounded-sm bg-surface-muted px-2.5 py-1.5 text-sm font-medium"
                >
                  {product.nama}
                </li>
              ))}
            </ul>
            {archiveTargetProducts.length > 6 ? (
              <p className="mt-1 text-[11px] text-foreground-muted">
                +{archiveTargetProducts.length - 6} produk lainnya
              </p>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={restoreTargets !== null}
        onClose={closeRestoreDialog}
        title={
          restoreTargetProducts.length > 1
            ? `Pulihkan ${restoreTargetProducts.length} produk?`
            : "Pulihkan produk?"
        }
        description="Produk kembali ke daftar produk dengan status nonaktif."
        size="sm"
        footer={
          <>
            <Button variant="outline" type="button" onClick={closeRestoreDialog} disabled={restoring}>
              Batal
            </Button>
            <Button variant="success" type="button" onClick={confirmRestore} loading={restoring}>
              <ArchiveRestore className="size-4" aria-hidden />
              {restoring ? "Memulihkan…" : "Pulihkan Produk"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {restoreError ? <Alert tone="error">{restoreError}</Alert> : null}
          <Alert tone="info" title="Aktifkan kembali jika siap dijual">
            Setelah dipulihkan, produk tidak langsung muncul di input penjualan. Aktifkan produk terlebih dahulu.
          </Alert>
          <div>
            <p className="text-xs font-semibold text-foreground-muted">
              Produk yang akan dipulihkan:
            </p>
            <ul className="mt-1.5 space-y-1">
              {restoreTargetProducts.slice(0, 6).map((product) => (
                <li
                  key={product.id}
                  className="truncate rounded-sm bg-surface-muted px-2.5 py-1.5 text-sm font-medium"
                >
                  {product.nama}
                </li>
              ))}
            </ul>
            {restoreTargetProducts.length > 6 ? (
              <p className="mt-1 text-[11px] text-foreground-muted">
                +{restoreTargetProducts.length - 6} produk lainnya
              </p>
            ) : null}
          </div>
        </div>
      </Modal>
    </>
  );
}
