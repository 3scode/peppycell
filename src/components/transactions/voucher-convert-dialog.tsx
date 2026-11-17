"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ticket } from "lucide-react";
import { toast } from "sonner";
import { convertSalesToVouchersAction, previewVoucherConversionAction } from "@/actions/vouchers";
import type { VoucherPreviewRow } from "@/types/domain";
import { formatRupiah } from "@/lib/money";
import { formatDateId, todayWib } from "@/lib/period";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldHint } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { MoneyText } from "@/components/ui/money-text";
import { Select } from "@/components/ui/select";

function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function VoucherConvertDialog({
  transactionIds,
  wallets,
  onClose,
  onConverted,
}: {
  transactionIds: string[];
  wallets: { id: string; nama: string; isDefault?: boolean }[];
  onClose: () => void;
  onConverted: () => void;
}) {
  const router = useRouter();
  const tanggalTouchedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<VoucherPreviewRow[]>([]);
  const [walletId, setWalletId] = useState(
    wallets.find((wallet) => wallet.isDefault)?.id ?? wallets[0]?.id ?? "",
  );
  const [tanggal, setTanggal] = useState(todayWib());
  const [codes, setCodes] = useState<Record<string, string[]>>({});
  const [requestId] = useState(newRequestId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void previewVoucherConversionAction({ ids: transactionIds }).then((result) => {
      if (!active) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error?.message ?? "Gagal memuat penjualan.");
        setRows([]);
        return;
      }
      const data = result.data ?? [];
      setRows(data);
      setTanggal((previous) => {
        if (tanggalTouchedRef.current) return previous;
        const eligibleRows = data.filter((row) => row.eligible);
        const dates = eligibleRows
          .map((row) => row.tanggal.slice(0, 10))
          .filter(Boolean)
          .sort();
        return dates[0] ?? previous;
      });
      setCodes(
        Object.fromEntries(
          data.map((row) => [row.transactionId, Array.from({ length: Math.max(1, row.qty) }, () => "")]),
        ),
      );
    });
    return () => {
      active = false;
    };
  }, [transactionIds]);

  const eligible = useMemo(() => rows.filter((row) => row.eligible), [rows]);
  const ineligible = useMemo(() => rows.filter((row) => !row.eligible), [rows]);
  const eligibleCodes = useMemo(
    () =>
      eligible.flatMap((row) =>
        Array.from(
          { length: Math.max(1, row.qty) },
          (_, index) => codes[row.transactionId]?.[index] ?? "",
        ),
      ),
    [eligible, codes],
  );
  const eligibleCount = eligibleCodes.length;
  const filledCount = eligibleCodes.filter((code) => code.trim().length >= 3).length;
  const totalCost = eligible.reduce((sum, row) => sum + row.unitCost * row.qty, 0);
  const totalSales = eligible.reduce((sum, row) => sum + row.nominal, 0);
  const codesFilled = eligible.length > 0 && filledCount === eligibleCount;
  const duplicateCodes = useMemo(() => {
    const normalized = eligibleCodes
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean);
    return new Set(normalized).size !== normalized.length;
  }, [eligibleCodes]);

  async function submit() {
    if (eligible.length === 0) {
      setError("Tidak ada penjualan yang bisa dikonversi.");
      return;
    }
    if (!walletId) {
      setError("Pilih wallet voucher dulu.");
      return;
    }
    if (!codesFilled) {
      setError(`Isi kode voucher minimal 3 karakter untuk semua ${eligibleCount} unit.`);
      return;
    }
    if (duplicateCodes) {
      setError("Kode voucher tidak boleh sama.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await convertSalesToVouchersAction({
        items: eligible.map((row) => ({
          transactionId: row.transactionId,
          kodes: Array.from(
            { length: Math.max(1, row.qty) },
            (_, index) => codes[row.transactionId]?.[index]?.trim() ?? "",
          ),
        })),
        walletId,
        clientRequestId: requestId,
        tanggal,
      });
      if (!result.ok) {
        setError(result.error?.message ?? "Gagal mengonversi voucher.");
        return;
      }
      const count = result.data?.vouchers.length ?? eligibleCount;
      toast.success(`${count} voucher belum terjual tersimpan.`);
      onConverted();
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Gagal mengonversi voucher.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Voucher belum terjual"
      description="Penjualan terpilih diubah menjadi stok voucher. Penjualan dihapus dari jurnal."
      size="lg"
      footer={
        <div className="w-full space-y-2">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {eligibleCount > 0 && !codesFilled ? (
              <p className="mr-auto text-[11px] text-foreground-muted">
                {filledCount}/{eligibleCount} kode terisi
              </p>
            ) : null}
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button
              type="button"
              onClick={submit}
              loading={submitting}
              disabled={loading || eligible.length === 0 || !walletId}
            >
              <Ticket className="size-4" aria-hidden />{" "}
              {loading
                ? "Memuat penjualan…"
                : eligible.length === 0
                  ? "Tidak ada penjualan layak"
                  : !codesFilled
                    ? `Lengkapi ${eligibleCount - filledCount} kode`
                    : `Konversi ${eligibleCount} voucher`}
            </Button>
          </div>
        </div>
      }
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-foreground-muted">Memuat penjualan…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-foreground-muted">
          Tidak ada penjualan yang bisa dikonversi.
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <Label htmlFor="voucher-wallet" required>Wallet voucher</Label>
            <Select
              id="voucher-wallet"
              value={walletId}
              onChange={(event) => setWalletId(event.target.value)}
            >
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.nama}
                </option>
              ))}
            </Select>
            <FieldHint>
              Nilai modal tiap voucher masuk ke wallet ini dan berkurang lagi saat voucher terjual.
            </FieldHint>
          </div>

          <div>
            <Label htmlFor="voucher-tanggal" required>Tanggal masuk</Label>
            <Input
              id="voucher-tanggal"
              type="date"
              value={tanggal}
              max={todayWib()}
              onChange={(event) => {
                tanggalTouchedRef.current = true;
                setTanggal(event.target.value || todayWib());
              }}
              className="mt-1 h-10"
            />
            <FieldHint>
              Tanggal ini jadi kolom Masuk di /vouchers dan ikut muncul di /transactions (jurnal
              pembelian stok). Tidak boleh lebih dari hari ini.
            </FieldHint>
          </div>

          {eligible.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                {eligibleCount} voucher dari {eligible.length} penjualan — isi kode per unit
              </p>
              {eligible.map((row) => {
                const rowCodes = Array.from(
                  { length: Math.max(1, row.qty) },
                  (_, index) => codes[row.transactionId]?.[index] ?? "",
                );
                return (
                  <div key={row.transactionId} className="rounded-md border border-border bg-surface p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{row.productName ?? "Tanpa produk"}</p>
                        <p className="mt-0.5 text-[11px] text-foreground-muted">
                          {formatDateId(row.tanggal.slice(0, 10))} · {row.qty} unit × jual{" "}
                          <MoneyText value={row.hargaJual} size="sm" className="inline-flex" />
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wide text-foreground-muted">Harga beli / unit</p>
                        <p className="money text-sm font-semibold">{formatRupiah(row.unitCost)}</p>
                      </div>
                    </div>
                    <div className="mt-2 space-y-2">
                      {rowCodes.map((code, index) => (
                        <div key={index}>
                          <Label htmlFor={`kode-${row.transactionId}-${index}`} required>
                            Kode voucher {row.qty > 1 ? `#${index + 1}` : ""}
                          </Label>
                          <Input
                            id={`kode-${row.transactionId}-${index}`}
                            value={code}
                            onChange={(event) =>
                              setCodes((previous) => {
                                const next = Array.from(
                                  { length: Math.max(1, row.qty) },
                                  (_, unit) => previous[row.transactionId]?.[unit] ?? "",
                                );
                                next[index] = event.target.value;
                                return { ...previous, [row.transactionId]: next };
                              })
                            }
                            placeholder="Contoh: AXIS-10K-001"
                            autoComplete="off"
                            maxLength={80}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-foreground-muted">
                      {row.walletName ?? "Wallet penjualan"} −{formatRupiah(row.nominal)}
                      {row.sourceWalletName ? ` · ${row.sourceWalletName} net 0` : ""}
                      {" · "}
                      wallet voucher +{formatRupiah(row.unitCost * row.qty)}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : null}

          {ineligible.length > 0 ? (
            <div className="space-y-1.5 rounded-md border border-warning/30 bg-warning-soft/40 p-3">
              <p className="text-xs font-semibold text-foreground">
                {ineligible.length} transaksi dilewati
              </p>
              {ineligible.map((row) => (
                <p key={row.transactionId} className="text-[11px] text-foreground-muted">
                  {row.productName ?? "Tanpa produk"} — {row.reason}
                </p>
              ))}
            </div>
          ) : null}

          {eligible.length === 0 && !loading && rows.length > 0 ? (
            <Alert tone="warning">
              Belum ada baris yang bisa dikonversi. Form kode voucher hanya muncul untuk penjualan yang
              aktif, berisi produk dengan harga beli, tanpa payout/import/reversal, dan belum
              pernah dikonversi. Lihat alasan per transaksi di bawah.
            </Alert>
          ) : null}

          <div className="rounded-md bg-surface-muted/70 p-3 text-xs text-foreground-muted">
            <p className="flex justify-between gap-3">
              <span>Total hasil jual dibatalkan</span>
              <span className="money font-semibold text-foreground">{formatRupiah(totalSales)}</span>
            </p>
            <p className="mt-1 flex justify-between gap-3">
              <span>Total modal jadi stok voucher</span>
              <span className="money font-semibold text-foreground">{formatRupiah(totalCost)}</span>
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
