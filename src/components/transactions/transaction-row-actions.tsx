"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateTransactionAction } from "@/actions/transactions";
import type { TransactionSafe } from "@/types/domain";
import { formatRupiah } from "@/lib/money";
import { isoAtWib, todayWib, WIB_OFFSET_MS } from "@/lib/period";
import { walletFlow } from "@/lib/wallet-flow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldHint } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/money-input";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";

export interface ProductOption {
  id: string;
  nama: string;
  hargaJual: number;
}

const expenseCategories = [
  { value: "operasional", label: "Operasional" },
  { value: "gaji", label: "Gaji" },
  { value: "deviden", label: "Deviden" },
  { value: "lainnya", label: "Lainnya" },
] as const;

function wibDate(iso: string): string {
  return new Date(new Date(iso).getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

export function TransactionRowActions({
  tx,
  products,
  wallets,
  canEdit = true,
  onRequestDelete,
}: {
  tx: TransactionSafe;
  products: ProductOption[];
  wallets: { id: string; nama: string; saldo: number }[];
  canEdit?: boolean;
  onRequestDelete: (ids: string[]) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tanggal, setTanggal] = useState(wibDate(tx.tanggal));
  const [productId, setProductId] = useState(tx.productId ?? "");
  const [fromWalletId, setFromWalletId] = useState(tx.walletId);
  const [toWalletId, setToWalletId] = useState(tx.destinationWalletId ?? "");
  const [sourceWalletId, setSourceWalletId] = useState(tx.sourceWalletId ?? "");
  const [sourceCost, setSourceCost] = useState(0);
  const [qty, setQty] = useState(tx.qty ?? 1);
  const [nominal, setNominal] = useState(tx.nominal);
  const [kategori, setKategori] = useState(tx.kategori);
  const [description, setDescription] = useState(tx.description);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productOptions = products.some((item) => item.id === tx.productId)
    ? products
    : tx.productId && tx.productName
      ? [
          { id: tx.productId, nama: tx.productName, hargaJual: tx.unitPrice ?? 0 },
          ...products,
        ]
      : products;

  const selectedProduct = productOptions.find((item) => item.id === productId);
  // Produk yang sama mempertahankan harga tersimpan; ganti produk pakai harga terkini.
  const selectedPrice = selectedProduct
    ? selectedProduct.id === tx.productId && tx.unitPrice != null
      ? tx.unitPrice
      : selectedProduct.hargaJual
    : 0;
  const computedNominal = tx.tipe === "income" ? selectedPrice * qty : nominal;

  function openDialog() {
    setTanggal(wibDate(tx.tanggal));
    setProductId(tx.productId ?? "");
    setFromWalletId(tx.walletId);
    setToWalletId(tx.destinationWalletId ?? "");
    setSourceWalletId(tx.sourceWalletId ?? "");
    setSourceCost(0);
    setQty(tx.qty ?? 1);
    setNominal(tx.nominal);
    setKategori(tx.kategori);
    setDescription(tx.description);
    setError(null);
    setOpen(true);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (tx.tipe === "income") {
      if (!selectedProduct) {
        setError("Pilih produk terlebih dahulu.");
        return;
      }
      if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
        setError("Jumlah harus 1–99.");
        return;
      }
    } else if (tx.tipe === "expense" || tx.tipe === "transfer") {
      if (tx.tipe === "transfer" && (!fromWalletId || !toWalletId || fromWalletId === toWalletId)) {
        setError("Pilih wallet asal dan tujuan yang berbeda.");
        return;
      }
      if (!nominal || nominal <= 0) {
        setError("Nominal harus lebih dari 0.");
        return;
      }
      if (description.trim().length < 5) {
        setError("Keterangan minimal 5 karakter.");
        return;
      }
    }

    const iso = tanggal === todayWib() ? new Date().toISOString() : isoAtWib(tanggal);
    setLoading(true);
    const result = await updateTransactionAction({
      id: tx.id,
      tanggal: iso,
      description: description.trim(),
      ...(tx.tipe === "income" ? {
          productId,
          qty,
          fromWalletId,
          sourceWalletId: sourceWalletId || null,
          sourceWalletChanged: sourceWalletId !== (tx.sourceWalletId ?? ""),
          sourceCost: sourceCost > 0 ? sourceCost : undefined,
        } : {}),
      ...(tx.tipe === "expense" ? { nominal, kategori: kategori as (typeof expenseCategories)[number]["value"], fromWalletId } : {}),
      ...(tx.tipe === "transfer" ? { nominal, fromWalletId, toWalletId } : {}),
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal mengubah transaksi.");
      return;
    }
    toast.success("Transaksi diperbarui. Saldo wallet sudah dikoreksi.");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {canEdit ? (
        <button
          type="button"
          onClick={openDialog}
          aria-label={`Edit transaksi ${tx.id}`}
          className="inline-flex h-9 items-center gap-1 rounded-sm border border-border px-2.5 text-xs font-semibold hover:bg-surface-muted"
        >
          <Pencil className="size-3.5" aria-hidden /> Edit
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onRequestDelete([tx.id])}
        aria-label={`Hapus transaksi ${tx.id}`}
        title={
          tx.status === "void" || tx.reversalOf
            ? "Transaksi void dihapus bersama jurnal baliknya."
            : undefined
        }
        className="inline-flex h-9 items-center gap-1 rounded-sm border border-error/20 px-2.5 text-xs font-semibold text-error-text hover:bg-error-soft"
      >
        <Trash2 className="size-3.5" aria-hidden /> Hapus
      </button>

      {canEdit ? (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Edit transaksi"
          description={`${tx.tipe === "income" ? "Penjualan" : tx.tipe === "expense" ? "Pengeluaran" : "Mutasi"} ${tx.id} · saldo wallet otomatis dikoreksi.`}
          size="sm"
          footer={
            <>
              <Button variant="outline" type="button" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="submit" form="edit-tx-form" loading={loading}>
                Simpan Perubahan
              </Button>
            </>
          }
        >
        <form id="edit-tx-form" onSubmit={onSubmit} className="space-y-3">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <div>
            <Label htmlFor={`edit-tx-date-${tx.id}`} required>Tanggal</Label>
            <Input
              id={`edit-tx-date-${tx.id}`}
              type="date"
              value={tanggal}
              max={todayWib()}
              onChange={(event) => setTanggal(event.target.value)}
              required
            />
            <FieldHint>Tidak boleh melewati hari ini (WIB).</FieldHint>
          </div>

          {tx.tipe === "income" ? (
            <>
              <div>
                <Label htmlFor={`edit-tx-wallet-${tx.id}`} required>Wallet penerima</Label>
                <Select
                  id={`edit-tx-wallet-${tx.id}`}
                  value={fromWalletId}
                  onChange={(event) => setFromWalletId(event.target.value)}
                >
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.nama} — {formatRupiah(wallet.saldo)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor={`edit-tx-product-${tx.id}`} required>Produk</Label>
                <Select
                  id={`edit-tx-product-${tx.id}`}
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                >
                  <option value="">Pilih produk…</option>
                  {productOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nama} — {formatRupiah(item.hargaJual)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor={`edit-tx-qty-${tx.id}`} required>Jumlah</Label>
                <Input
                  id={`edit-tx-qty-${tx.id}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  value={qty}
                  onChange={(event) => setQty(Math.max(1, Math.min(99, Number(event.target.value) || 1)))}
                  className="money"
                />
              </div>
              <div className="flex items-center justify-between rounded-sm border border-border px-3 py-2 text-sm">
                <span className="text-foreground-muted">Nominal baru</span>
                <span className="money font-semibold">{formatRupiah(computedNominal)}</span>
              </div>
              <div>
                <Label htmlFor={`edit-tx-source-wallet-${tx.id}`}>Wallet sumber (modal)</Label>
                <Select
                  id={`edit-tx-source-wallet-${tx.id}`}
                  value={sourceWalletId}
                  onChange={(event) => setSourceWalletId(event.target.value)}
                >
                  <option value="">Tanpa wallet sumber</option>
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.nama} — {formatRupiah(wallet.saldo)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor={`edit-tx-source-cost-${tx.id}`}>Biaya modal</Label>
                <MoneyInput
                  id={`edit-tx-source-cost-${tx.id}`}
                  value={sourceCost}
                  onChange={setSourceCost}
                />
                <FieldHint>
                  Kosongkan = default (harga beli × jumlah). Hanya dipotong jika ada wallet sumber.
                </FieldHint>
              </div>
            </>
          ) : tx.tipe === "expense" ? (
            <>
              <div>
                <Label htmlFor={`edit-tx-wallet-${tx.id}`} required>Wallet pengeluaran</Label>
                <Select
                  id={`edit-tx-wallet-${tx.id}`}
                  value={fromWalletId}
                  onChange={(event) => setFromWalletId(event.target.value)}
                >
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.nama} — {formatRupiah(wallet.saldo)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor={`edit-tx-amount-${tx.id}`} required>Nominal</Label>
                <MoneyInput id={`edit-tx-amount-${tx.id}`} value={nominal} onChange={setNominal} />
              </div>
              <div>
                <Label htmlFor={`edit-tx-category-${tx.id}`} required>Kategori</Label>
                <Select
                  id={`edit-tx-category-${tx.id}`}
                  value={kategori}
                  onChange={(event) => setKategori(event.target.value)}
                >
                  {expenseCategories.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </Select>
              </div>
            </>
          ) : (
            <>
              {tx.tipe === "transfer" ? (
                <>
                  <div>
                    <Label htmlFor={`edit-tx-from-wallet-${tx.id}`} required>Wallet asal</Label>
                    <Select
                      id={`edit-tx-from-wallet-${tx.id}`}
                      value={fromWalletId}
                      onChange={(event) => {
                        const nextId = event.target.value;
                        setFromWalletId(nextId);
                        if (toWalletId === nextId) {
                          setToWalletId(wallets.find((wallet) => wallet.id !== nextId)?.id ?? "");
                        }
                      }}
                    >
                      {wallets.map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>
                          {wallet.nama} — {formatRupiah(wallet.saldo)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor={`edit-tx-to-wallet-${tx.id}`} required>Wallet tujuan</Label>
                    <Select
                      id={`edit-tx-to-wallet-${tx.id}`}
                      value={toWalletId}
                      onChange={(event) => setToWalletId(event.target.value)}
                    >
                      {wallets.filter((wallet) => wallet.id !== fromWalletId).map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>
                          {wallet.nama} — {formatRupiah(wallet.saldo)}
                        </option>
                      ))}
                    </Select>
                  </div>
                </>
              ) : null}
              <div>
                <Label htmlFor={`edit-tx-amount-${tx.id}`} required>Nominal</Label>
                <MoneyInput id={`edit-tx-amount-${tx.id}`} value={nominal} onChange={setNominal} />
              </div>
              <p className="rounded-sm bg-surface-muted/70 p-3 text-xs text-foreground-muted">
                {walletFlow(tx)}
              </p>
            </>
          )}

          <div>
            <Label htmlFor={`edit-tx-desc-${tx.id}`}>
              Keterangan{tx.tipe === "income" ? " (opsional)" : ""}
            </Label>
            <Textarea
              id={`edit-tx-desc-${tx.id}`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={200}
            />
            <p className="mt-1 text-right text-[11px] text-foreground-muted">{description.length}/200</p>
          </div>

          <p className="text-[11px] text-foreground-muted">
            Wallet: <span className="font-semibold text-foreground">{walletFlow(tx)}</span> · Pencatat: {tx.userName ?? "—"}
          </p>
        </form>
      </Modal>
      ) : null}
    </>
  );
}
