"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, Minus, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { createSaleAction } from "@/actions/transactions";
import { formatRupiah } from "@/lib/money";
import { formatDateId, formatDateTimeId, isoAtWib, todayWib } from "@/lib/period";
import { useProductCatalogRealtime } from "@/lib/hooks/use-product-catalog-realtime";
import type { TransactionDetail } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldHint } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { MoneyText } from "@/components/ui/money-text";
import { MoneyInput } from "@/components/ui/money-input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

interface PickerProduct {
  id: string;
  nama: string;
  operator: string;
  hargaJual: number;
  hargaBeli?: number;
}

interface WalletOption {
  id: string;
  nama: string;
  saldo: number;
  isDefault?: boolean;
}

interface CartItem {
  productId: string;
  qty: number;
}

const MAX_ITEMS = 20;

export function SaleForm({
  products,
  walletLabel,
  wallets,
  role,
}: {
  products: PickerProduct[];
  walletLabel: string;
  wallets?: WalletOption[] | null;
  role: "admin" | "karyawan";
}) {
  const router = useRouter();
  useProductCatalogRealtime();
  const [tanggal, setTanggal] = useState(todayWib());
  const [cart, setCart] = useState<CartItem[]>([]);
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [destinationWalletId, setDestinationWalletId] = useState(
    () => wallets?.find((wallet) => wallet.isDefault)?.id ?? wallets?.[0]?.id ?? "",
  );
  const [sourceWalletId, setSourceWalletId] = useState("");
  const [sourceCost, setSourceCost] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<TransactionDetail[] | null>(null);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());

  const priceOf = (product: PickerProduct) => product.hargaJual;

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const cartLines = useMemo(
    () =>
      cart.flatMap((item) => {
        const product = productById.get(item.productId);
        if (!product) return [];
        return [{
          ...item,
          product,
          price: product.hargaJual,
          cost: product.hargaBeli,
          subtotal: product.hargaJual * item.qty,
        }];
      }),
    [cart, productById],
  );

  const totalQty = cartLines.reduce((sum, line) => sum + line.qty, 0);
  const total = cartLines.reduce((sum, line) => sum + line.subtotal, 0);
  const totalSourceCost = cartLines.reduce((sum, line) => sum + (line.cost ?? 0) * line.qty, 0);
  const destinationWallet = wallets?.find((wallet) => wallet.id === destinationWalletId);
  const destinationLabel = destinationWallet?.nama ?? walletLabel;
  const defaultDestinationId = wallets?.find((wallet) => wallet.isDefault)?.id ?? wallets?.[0]?.id ?? "";

  const grouped = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = products.filter(
      (p) =>
        !term ||
        p.nama.toLowerCase().includes(term) ||
        p.operator.toLowerCase().includes(term),
    );
    return filtered.reduce<Record<string, PickerProduct[]>>((acc, product) => {
      acc[product.operator] = [...(acc[product.operator] ?? []), product];
      return acc;
    }, {});
  }, [products, search]);

  const selectedIds = useMemo(() => new Set(cart.map((item) => item.productId)), [cart]);

  function toggleProduct(id: string) {
    setError(null);
    setCart((previous) => {
      if (previous.some((item) => item.productId === id)) {
        return previous.filter((item) => item.productId !== id);
      }
      if (previous.length >= MAX_ITEMS) {
        toast.error(`Maksimal ${MAX_ITEMS} produk sekali catat.`);
        return previous;
      }
      return [...previous, { productId: id, qty: 1 }];
    });
  }

  function setItemQty(id: string, value: number) {
    const qty = Math.max(1, Math.min(99, Math.trunc(value) || 1));
    setCart((previous) =>
      previous.map((item) => (item.productId === id ? { ...item, qty } : item)),
    );
  }

  function removeItem(id: string) {
    setCart((previous) => previous.filter((item) => item.productId !== id));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (cart.length === 0) {
      setError("Pilih minimal satu produk.");
      return;
    }
    setLoading(true);
    const iso = tanggal === todayWib() ? new Date().toISOString() : isoAtWib(tanggal);
    const result = await createSaleAction({
      tanggal: iso,
      items: cart.map((item) => ({ productId: item.productId, qty: item.qty })),
      description: description.trim() || undefined,
      clientRequestId,
      walletId: destinationWalletId || undefined,
      sourceWalletId: sourceWalletId || undefined,
      sourceCost: sourceCost > 0 ? sourceCost : undefined,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal menyimpan penjualan.");
      return;
    }
    const created = result.data ?? [];
    setSuccess(created);
    toast.success(
      created.length === 1
        ? "Penjualan berhasil dicatat."
        : `${created.length} transaksi penjualan berhasil dicatat.`,
    );
    router.refresh();
  }

  function resetForm() {
    setSuccess(null);
    setCart([]);
    setDescription("");
    setSearch("");
    setDestinationWalletId(defaultDestinationId);
    setSourceWalletId("");
    setSourceCost(0);
    setClientRequestId(crypto.randomUUID());
  }

  return (
    <>
      <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-md border border-border bg-surface p-4 shadow-card sm:p-5">
            <Label htmlFor="sale-date" required>Tanggal</Label>
            <Input
              id="sale-date"
              type="date"
              value={tanggal}
              max={todayWib()}
              onChange={(event) => setTanggal(event.target.value)}
              required
            />
            <FieldHint>
              Tidak boleh melebihi hari ini (WIB). Mundurkan tanggal untuk mencatat penjualan
              yang baru diinput belakangan.
            </FieldHint>
          </div>

          <div className="rounded-md border border-border bg-surface p-4 shadow-card sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <Label required>Produk</Label>
              <span className="text-[11px] font-medium text-foreground-muted">
                {cart.length}/{MAX_ITEMS} dipilih
              </span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" aria-hidden />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari produk atau operator…"
                className="pl-9"
                aria-label="Cari produk"
              />
            </div>

            <div
              className="mt-2 max-h-[280px] space-y-2 overflow-y-auto rounded-sm border border-border p-2 sm:max-h-[340px]"
            >
              {Object.keys(grouped).length === 0 ? (
                <p className="p-4 text-center text-xs text-foreground-muted">
                  Produk tidak ditemukan.{" "}
                  {role === "admin" ? (
                    <a href="/products" className="font-semibold text-primary">Tambah produk</a>
                  ) : (
                    "Hubungi Admin."
                  )}
                </p>
              ) : (
                Object.entries(grouped).map(([operator, items]) => (
                  <div key={operator} role="group" aria-label={`Produk ${operator}`}>
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
                      {operator}
                    </p>
                    <div className="space-y-1">
                      {items.map((product) => {
                        const active = selectedIds.has(product.id);
                        const price = priceOf(product);
                        return (
                          <button
                            key={product.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleProduct(product.id)}
                            className={cn(
                              "flex min-h-11 w-full items-center justify-between gap-2 rounded-sm border px-3 py-2 text-left transition-colors",
                              active
                                ? "border-primary/40 bg-primary-soft"
                                : "border-transparent hover:bg-surface-muted",
                            )}
                          >
                            <span className="flex items-center gap-2 text-sm font-medium">
                              <span
                                aria-hidden
                                className={cn(
                                  "flex size-4 items-center justify-center rounded-[4px] border",
                                  active ? "border-primary bg-primary text-primary-foreground" : "border-input",
                                )}
                              >
                                {active ? <Check className="size-3" /> : null}
                              </span>
                              {product.nama}
                            </span>
                            <span className="money text-sm font-semibold text-foreground">
                              {formatRupiah(price)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-md border border-border bg-surface p-4 shadow-card sm:p-5">
            <div className="space-y-4">
              <div>
                <Label htmlFor="sale-destination-wallet">Wallet tujuan (hasil jual)</Label>
                {wallets && wallets.length > 0 ? (
                  <Select
                    id="sale-destination-wallet"
                    value={destinationWalletId}
                    onChange={(event) => setDestinationWalletId(event.target.value)}
                  >
                    {wallets.map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>
                        {wallet.nama}
                        {wallet.isDefault ? " (default)" : ""} — {formatRupiah(wallet.saldo)}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <div className="flex h-12 items-center gap-2 rounded-sm border border-input bg-surface-muted px-3 text-sm font-medium">
                    <Lock className="size-4 text-foreground-muted" aria-hidden /> {walletLabel}
                  </div>
                )}
                <FieldHint>
                  {wallets && wallets.length > 0
                    ? `Hasil penjualan masuk ke wallet ini. Default: ${walletLabel}.`
                    : "Hasil penjualan selalu masuk ke wallet default."}
                </FieldHint>
              </div>
              <div>
                <Label htmlFor="sale-source-wallet">Wallet sumber (modal)</Label>
                {wallets && wallets.length > 0 ? (
                  <Select
                    id="sale-source-wallet"
                    value={sourceWalletId}
                    onChange={(event) => setSourceWalletId(event.target.value)}
                  >
                    <option value="">Otomatis (sama dengan wallet tujuan)</option>
                    {wallets.map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>
                        {wallet.nama} — {formatRupiah(wallet.saldo)}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <div className="flex h-12 items-center gap-2 rounded-sm border border-input bg-surface-muted px-3 text-sm font-medium">
                    <Lock className="size-4 text-foreground-muted" aria-hidden /> {walletLabel}
                  </div>
                )}
                <FieldHint>
                  Wallet yang saldo-nya dipotong biaya modal. Kosongkan jika modal tidak dipotong.
                </FieldHint>
              </div>
              <div>
                <Label htmlFor="sale-source-cost">Biaya modal</Label>
                <MoneyInput
                  id="sale-source-cost"
                  value={sourceCost}
                  onChange={(value) => setSourceCost(value)}
                  placeholder={totalSourceCost > 0 ? new Intl.NumberFormat("id-ID").format(totalSourceCost) : "0"}
                />
                <FieldHint>
                  {sourceCost > 0 ? (
                    `Manual: ${formatRupiah(sourceCost)} dipotong dari wallet sumber.`
                  ) : (
                    `Kosongkan = default ${formatRupiah(totalSourceCost)} (Σ harga beli × jumlah).`
                  )}
                </FieldHint>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-surface p-4 shadow-card sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Daftar penjualan</h2>
              {cart.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-[11px] font-semibold text-foreground-muted hover:text-error-text"
                >
                  Kosongkan
                </button>
              ) : null}
            </div>

            {cartLines.length === 0 ? (
              <EmptyState
                icon={<Plus className="size-6" />}
                title="Belum ada produk dipilih"
                description="Pilih satu atau beberapa produk di atas. Jumlah tiap produk bisa diatur sendiri."
                className="mt-3 border-0 bg-transparent py-6 shadow-none"
              />
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-sm border border-border">
                {cartLines.map((line) => (
                  <li key={line.productId} className="flex flex-wrap items-center gap-3 px-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{line.product.nama}</p>
                      <p className="mt-0.5 text-[11px] text-foreground-muted">
                        {formatRupiah(line.price)} / unit
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setItemQty(line.productId, line.qty - 1)}
                        disabled={line.qty <= 1}
                        aria-label={`Kurangi jumlah ${line.product.nama}`}
                        className="flex size-9 items-center justify-center rounded-sm border border-border text-foreground disabled:opacity-40"
                      >
                        <Minus className="size-4" aria-hidden />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={99}
                        value={line.qty}
                        onChange={(event) =>
                          setItemQty(line.productId, Number(event.target.value))
                        }
                        aria-label={`Jumlah ${line.product.nama}`}
                        className="money h-9 w-14 rounded-sm border border-input bg-surface text-center text-sm font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => setItemQty(line.productId, line.qty + 1)}
                        disabled={line.qty >= 99}
                        aria-label={`Tambah jumlah ${line.product.nama}`}
                        className="flex size-9 items-center justify-center rounded-sm border border-border text-foreground disabled:opacity-40"
                      >
                        <Plus className="size-4" aria-hidden />
                      </button>
                    </div>
                    <div className="flex min-w-[104px] items-center justify-end gap-2">
                      <MoneyText value={line.subtotal} tone="default" size="sm" />
                      <button
                        type="button"
                        onClick={() => removeItem(line.productId)}
                        aria-label={`Hapus ${line.product.nama} dari daftar`}
                        className="flex size-9 items-center justify-center rounded-sm border border-error/20 text-error-text hover:bg-error-soft"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {cartLines.length > 0 ? (
              <p className="mt-2 text-[11px] text-foreground-muted">
                Setiap unit disimpan sebagai transaksi terpisah, jadi tiap unit punya jurnal
                dan biaya modalnya sendiri.
              </p>
            ) : null}

            <div className="mt-4">
              <Label htmlFor="sale-description">Keterangan (opsional)</Label>
              <Textarea
                id="sale-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Contoh: Pelanggan Andi, bayar tunai."
                maxLength={200}
              />
              <p className="mt-1 text-right text-[11px] text-foreground-muted">{description.length}/200</p>
            </div>
          </div>
        </div>

        <aside className="lg:col-span-5">
          <div className="rounded-md border border-border bg-surface p-4 shadow-card sm:p-5 lg:sticky lg:top-24">
            <h2 className="text-base font-semibold">Ringkasan</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-muted">Tanggal</dt>
                <dd className="text-right font-medium">{formatDateId(tanggal)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-muted">Produk</dt>
                <dd className="text-right font-medium">
                  {cart.length === 0 ? "Belum dipilih" : `${cart.length} produk`}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-muted">Total transaksi</dt>
                <dd className="money font-medium">{totalQty}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-muted">Wallet tujuan</dt>
                <dd className="inline-flex items-center gap-1 font-medium">
                  {wallets && wallets.length > 0 ? destinationLabel : `🔒 ${walletLabel}`}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-muted">Wallet sumber</dt>
                <dd className="font-medium">
                  {wallets?.find((wallet) => wallet.id === sourceWalletId)?.nama ??
                    (wallets && wallets.length > 0 ? `${destinationLabel} (otomatis)` : "—")}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-muted">Biaya modal</dt>
                <dd className="money font-medium">
                  {sourceCost > 0
                    ? formatRupiah(sourceCost)
                    : `${formatRupiah(totalSourceCost)} (auto)`}
                </dd>
              </div>
              <div className="flex items-end justify-between gap-3 border-t border-border pt-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Total</dt>
                <dd><MoneyText value={total} tone="income" size="display" /></dd>
              </div>
            </dl>

            {error ? <Alert tone="error" className="mt-3">{error}</Alert> : null}
            <Button
              type="submit"
              size="lg"
              className="mt-4 w-full"
              loading={loading}
              disabled={cart.length === 0}
            >
              {loading
                ? "Menyimpan…"
                : totalQty > 1
                  ? `Simpan ${totalQty} Transaksi`
                  : "Simpan Penjualan"}
            </Button>
            <p className="mt-2 text-center text-[11px] text-foreground-muted">
              Saldo {destinationLabel} bertambah {formatRupiah(total)}
              {sourceWalletId
                ? `; saldo ${wallets?.find((wallet) => wallet.id === sourceWalletId)?.nama ?? "wallet sumber"} berkurang ${sourceCost > 0 ? formatRupiah(sourceCost) : formatRupiah(totalSourceCost)}.`
                : totalSourceCost > 0
                  ? ` lalu berkurang ${formatRupiah(totalSourceCost)} untuk biaya modal.`
                  : "."}
            </p>
          </div>
        </aside>
      </form>

      <Modal
        open={Boolean(success)}
        onClose={() => setSuccess(null)}
        title="Penjualan tersimpan"
        description="Transaksi masuk ke jurnal dan saldo wallet."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setSuccess(null)} type="button">
              Selesai
            </Button>
            <Button onClick={resetForm} type="button">
              <Plus className="size-4" aria-hidden /> Catat Lagi
            </Button>
          </>
        }
      >
        {success ? (
          <div className="space-y-3">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success-text">
              <Check className="size-6" aria-hidden />
            </div>
            <ul className="divide-y divide-border rounded-sm border border-border text-sm">
              {success.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{tx.productName}</p>
                    <p className="text-[11px] text-foreground-muted">
                      {tx.qty} unit × {formatRupiah(tx.unitPrice ?? 0)}
                    </p>
                  </div>
                  <MoneyText value={tx.nominal} tone="income" size="sm" />
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                Total
              </span>
              <MoneyText
                value={success.reduce((sum, tx) => sum + tx.nominal, 0)}
                tone="income"
                size="display"
              />
            </div>
            <p className="text-center text-xs text-foreground-muted">
              {formatDateTimeId(success[0]?.tanggal ?? new Date().toISOString())} · Masuk ke{" "}
              {success[0]?.walletName ?? walletLabel}
            </p>
            <p className="text-center text-[11px] text-foreground-muted">
              Setiap unit tercatat sebagai transaksi terpisah.
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
