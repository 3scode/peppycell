"use client";

import { useMemo, useState } from "react";
import { todayWib } from "@/lib/period";
import { useRouter } from "next/navigation";
import { Pencil, Ticket } from "lucide-react";
import { toast } from "sonner";
import { sellVoucherAction, updateVoucherAction } from "@/actions/vouchers";
import type { VoucherStock } from "@/types/domain";
import { formatRupiah } from "@/lib/money";
import { formatDateTimeId } from "@/lib/period";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { DataTable, Td } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label, FieldHint } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";

function VoucherStatusBadge({ status }: { status: VoucherStock["status"] }) {
  if (status === "sold") return <Badge variant="success">Terjual</Badge>;
  if (status === "void") return <Badge variant="neutral">Void</Badge>;
  return <Badge variant="warning">Belum terjual</Badge>;
}

export function VoucherTable({
  vouchers,
  wallets,
  products,
  isAdmin,
}: {
  vouchers: VoucherStock[];
  wallets: { id: string; nama: string; isDefault: boolean }[];
  products: { id: string; nama: string }[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<VoucherStock | null>(null);
  const defaultWalletId = wallets.find((wallet) => wallet.isDefault)?.id ?? wallets[0]?.id ?? "";
  const [walletId, setWalletId] = useState(defaultWalletId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [edit, setEdit] = useState<VoucherStock | null>(null);
  const [editKode, setEditKode] = useState("");
  const [editProductId, setEditProductId] = useState("");
  const [editWalletId, setEditWalletId] = useState("");
  const [editHargaBeli, setEditHargaBeli] = useState(0);
  const [editHargaJual, setEditHargaJual] = useState(0);
  const [editTanggal, setEditTanggal] = useState(todayWib());
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function openSell(voucher: VoucherStock) {
    setTarget(voucher);
    setWalletId(defaultWalletId);
    setError(null);
  }

  function openEdit(voucher: VoucherStock) {
    setEdit(voucher);
    setEditKode(voucher.kode);
    setEditProductId(voucher.productId);
    setEditWalletId(voucher.walletId);
    setEditHargaBeli(voucher.hargaBeli);
    setEditHargaJual(voucher.hargaJual);
    setEditTanggal((voucher.convertedAt ?? todayWib()).slice(0, 10));
    setEditError(null);
  }

  const editProductOptions = useMemo(() => {
    if (!edit) return products;
    if (products.some((product) => product.id === edit.productId)) return products;
    return [
      { id: edit.productId, nama: edit.productName ?? "Produk saat ini" },
      ...products,
    ];
  }, [products, edit]);

  const editWalletOptions = useMemo(() => {
    if (!edit) return wallets;
    if (wallets.some((wallet) => wallet.id === edit.walletId)) return wallets;
    return [
      { id: edit.walletId, nama: edit.walletName ?? "Wallet saat ini", isDefault: false },
      ...wallets,
    ];
  }, [wallets, edit]);

  async function confirmSell() {
    if (!target) return;
    setSaving(true);
    setError(null);
    const result = await sellVoucherAction({
      id: target.id,
      walletId: isAdmin ? walletId || undefined : undefined,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal menandai voucher terjual.");
      return;
    }
    toast.success(
      `Voucher ${result.data?.kode ?? target.kode} terjual. Transaksi penjualan dibuat otomatis.`,
    );
    setTarget(null);
    router.refresh();
  }

  async function confirmEdit() {
    if (!edit) return;
    setEditSaving(true);
    setEditError(null);
    const result = await updateVoucherAction({
      id: edit.id,
      kode: editKode,
      productId: editProductId,
      walletId: editWalletId,
      hargaBeli: editHargaBeli,
      hargaJual: editHargaJual,
      tanggal: editTanggal,
    });
    setEditSaving(false);
    if (!result.ok) {
      setEditError(result.error?.message ?? "Gagal menyimpan perubahan voucher.");
      return;
    }
    toast.success(`Voucher ${result.data?.kode ?? editKode} diperbarui.`);
    setEdit(null);
    router.refresh();
  }

  return (
    <>
      <DataTable
        caption="Daftar stok voucher"
        head={["Kode voucher", "Produk", "Harga beli", "Harga jual", "Margin", "Wallet", "Status", "Masuk", "Aksi"]}
      >
        {vouchers.map((voucher) => (
          <tr key={voucher.id} className="hover:bg-surface-muted/40">
            <Td className="whitespace-nowrap">
              <span className="money text-sm font-semibold">{voucher.kode}</span>
            </Td>
            <Td className="max-w-[220px]">
              <span className="line-clamp-1">{voucher.productName ?? "—"}</span>
            </Td>
            <Td className="money whitespace-nowrap text-xs">{formatRupiah(voucher.hargaBeli)}</Td>
            <Td className="money whitespace-nowrap text-xs">{formatRupiah(voucher.hargaJual)}</Td>
            <Td className="money whitespace-nowrap text-xs text-success-text">
              {formatRupiah(voucher.margin)}
            </Td>
            <Td className="whitespace-nowrap text-xs">{voucher.walletName ?? "—"}</Td>
            <Td>
              <VoucherStatusBadge status={voucher.status} />
            </Td>
            <Td className="whitespace-nowrap text-xs text-foreground-muted">
              {formatDateTimeId(voucher.soldAt ?? voucher.convertedAt)}
            </Td>
            <Td className="whitespace-nowrap">
              {voucher.status === "available" ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openSell(voucher)}
                    className="inline-flex h-9 items-center gap-1 rounded-sm border border-primary/20 bg-primary-soft px-2.5 text-xs font-semibold text-primary hover:bg-primary-soft/70"
                  >
                    <Ticket className="size-3.5" aria-hidden /> Tandai terjual
                  </button>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => openEdit(voucher)}
                      aria-label={`Edit voucher ${voucher.kode}`}
                      className="inline-flex h-9 items-center gap-1 rounded-sm border border-border bg-surface px-2.5 text-xs font-semibold text-foreground hover:bg-surface-muted"
                    >
                      <Pencil className="size-3.5" aria-hidden /> Edit
                    </button>
                  ) : null}
                </div>
              ) : voucher.saleTransactionId ? (
                <span className="text-xs text-foreground-muted">Ada transaksi</span>
              ) : (
                <span className="text-xs text-foreground-muted">—</span>
              )}
            </Td>
          </tr>
        ))}
      </DataTable>

      <Modal
        open={target !== null}
        onClose={() => {
          if (!saving) setTarget(null);
        }}
        title="Tandai voucher terjual"
        description="Transaksi penjualan dibuat otomatis dan saldo wallet diperbarui."
        size="sm"
        footer={
          <>
            <Button variant="ghost" type="button" onClick={() => setTarget(null)} disabled={saving}>
              Batal
            </Button>
            <Button type="button" onClick={confirmSell} loading={saving}>
              <Ticket className="size-4" aria-hidden /> Ya, tandai terjual
            </Button>
          </>
        }
      >
        {target ? (
          <div className="space-y-3">
            <div className="rounded-sm bg-surface-muted/70 p-3 text-xs">
              <p className="flex justify-between gap-3">
                <span className="text-foreground-muted">Kode</span>
                <span className="money font-semibold text-foreground">{target.kode}</span>
              </p>
              <p className="mt-1 flex justify-between gap-3">
                <span className="text-foreground-muted">Produk</span>
                <span className="text-right font-medium text-foreground">{target.productName ?? "—"}</span>
              </p>
              <p className="mt-1 flex justify-between gap-3">
                <span className="text-foreground-muted">Harga jual</span>
                <span className="money font-semibold text-foreground">{formatRupiah(target.hargaJual)}</span>
              </p>
              <p className="mt-1 flex justify-between gap-3">
                <span className="text-foreground-muted">Harga beli</span>
                <span className="money font-medium text-foreground">{formatRupiah(target.hargaBeli)}</span>
              </p>
              <p className="mt-1 flex justify-between gap-3">
                <span className="text-foreground-muted">Margin</span>
                <span className="money font-semibold text-success-text">{formatRupiah(target.margin)}</span>
              </p>
            </div>

            {isAdmin ? (
              <div>
                <Label htmlFor="voucher-sell-wallet" required>Wallet tujuan (hasil jual)</Label>
                <Select
                  id="voucher-sell-wallet"
                  value={walletId}
                  onChange={(event) => setWalletId(event.target.value)}
                >
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.nama}
                    </option>
                  ))}
                </Select>
                <FieldHint>Hasil jual masuk ke wallet ini.</FieldHint>
              </div>
            ) : (
              <Alert tone="info">Hasil penjualan masuk ke wallet default.</Alert>
            )}

            <Alert tone="warning">
              Wallet voucher {target.walletName ?? ""} berkurang {formatRupiah(target.hargaBeli)} karena
              stok keluar.
            </Alert>
            {error ? <Alert tone="error">{error}</Alert> : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={edit !== null}
        onClose={() => {
          if (!editSaving) setEdit(null);
        }}
        title="Edit voucher"
        description="Perbarui detail voucher yang belum terjual. Perubahan harga beli menyesuaikan saldo wallet stok."
        size="md"
        footer={
          <div className="w-full space-y-2">
            {editError ? <Alert tone="error">{editError}</Alert> : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEdit(null)} disabled={editSaving}>
                Batal
              </Button>
              <Button type="button" onClick={confirmEdit} loading={editSaving}>
                <Pencil className="size-4" aria-hidden /> Simpan perubahan
              </Button>
            </div>
          </div>
        }
      >
        {edit ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="voucher-edit-kode" required>Kode voucher</Label>
              <Input
                id="voucher-edit-kode"
                value={editKode}
                onChange={(event) => setEditKode(event.target.value)}
                maxLength={80}
                className="mt-1"
              />
              <FieldHint>Kode unik, minimal 3 karakter.</FieldHint>
            </div>
            <div>
              <Label htmlFor="voucher-edit-product" required>Produk</Label>
              <Select
                id="voucher-edit-product"
                value={editProductId}
                onChange={(event) => setEditProductId(event.target.value)}
                className="mt-1"
              >
                {editProductOptions.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.nama}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="voucher-edit-wallet" required>Wallet stok</Label>
              <Select
                id="voucher-edit-wallet"
                value={editWalletId}
                onChange={(event) => setEditWalletId(event.target.value)}
                className="mt-1"
              >
                {editWalletOptions.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.nama}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="voucher-edit-tanggal" required>Tanggal masuk</Label>
              <Input
                id="voucher-edit-tanggal"
                type="date"
                value={editTanggal}
                max={todayWib()}
                onChange={(event) => setEditTanggal(event.target.value || todayWib())}
                className="mt-1 h-10"
              />
              <FieldHint>
                Tanggal kolom Masuk dan tanggal jurnal Pembelian stok voucher di /transactions ikut
                bergeser. Tidak boleh lebih dari hari ini.
              </FieldHint>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="voucher-edit-beli" required>Harga beli</Label>
                <MoneyInput
                  id="voucher-edit-beli"
                  value={editHargaBeli}
                  onChange={setEditHargaBeli}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="voucher-edit-jual" required>Harga jual</Label>
                <MoneyInput
                  id="voucher-edit-jual"
                  value={editHargaJual}
                  onChange={setEditHargaJual}
                  className="mt-1"
                />
              </div>
            </div>
            <Alert tone="info">
              Margin {formatRupiah(editHargaJual - editHargaBeli)}. Perubahan harga beli / wallet
              akan menyesuaikan saldo wallet stok.
            </Alert>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
