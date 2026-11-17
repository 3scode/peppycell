"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { raiseProductPricesAction } from "@/actions/products";
import type { Product, ProductPrice } from "@/types/domain";
import { formatRupiah } from "@/lib/money";
import {
  applyPriceChange,
  priceAtDate,
  type PriceChangeMode,
  type PriceRounding,
} from "@/lib/pricing";
import { todayWib } from "@/lib/period";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldHint } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";

const roundingOptions: { value: PriceRounding; label: string }[] = [
  { value: "none", label: "Tanpa pembulatan" },
  { value: "100", label: "Ke atas Rp100" },
  { value: "500", label: "Ke atas Rp500" },
  { value: "1000", label: "Ke atas Rp1.000" },
];

export function ProductPriceDialog({
  onClose,
  products,
  priceHistory,
  onSaved,
}: {
  onClose: () => void;
  products: Product[];
  priceHistory: ProductPrice[];
  onSaved: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<PriceChangeMode>("percent");
  const [jual, setJual] = useState(5);
  const [beli, setBeli] = useState(0);
  const [effectiveFrom, setEffectiveFrom] = useState(todayWib());
  const [rounding, setRounding] = useState<PriceRounding>("100");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(
    () =>
      products.map((product) => {
        const points = priceHistory.filter((entry) => entry.productId === product.id);
        const base = priceAtDate(points, product, effectiveFrom);
        return {
          product,
          base,
          nextJual: applyPriceChange(base.hargaJual, jual, mode, rounding),
          nextBeli: applyPriceChange(base.hargaBeli, beli, mode, rounding),
        };
      }),
    [products, priceHistory, effectiveFrom, jual, beli, mode, rounding],
  );

  const invalidMargin = preview.find((item) => item.nextJual < item.nextBeli);
  const noChange = jual <= 0 && beli <= 0;
  const futureDate = effectiveFrom > todayWib();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (futureDate) {
      setError("Tanggal berlaku tidak boleh melewati hari ini.");
      return;
    }
    if (noChange) {
      setError("Isi kenaikan harga jual atau harga beli.");
      return;
    }
    if (mode === "percent" && (jual > 100 || beli > 100)) {
      setError("Kenaikan persen maksimal 100%.");
      return;
    }
    if (invalidMargin) {
      setError(
        `Harga jual ${invalidMargin.product.nama} akan lebih rendah dari harga beli.`,
      );
      return;
    }

    setLoading(true);
    const result = await raiseProductPricesAction({
      ids: products.map((product) => product.id),
      mode,
      jual,
      beli,
      effectiveFrom,
      rounding,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal mengubah harga produk.");
      return;
    }
    const updated = result.data?.updated ?? 0;
    toast.success(
      updated === 1
        ? "Harga produk diperbarui."
        : `Harga ${updated} produk diperbarui.`,
    );
    onSaved();
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Naikkan harga produk"
      description="Harga baru langsung dipakai untuk penjualan berikutnya. Transaksi yang sudah tercatat tidak berubah."
      size="lg"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button
            type="submit"
            form="raise-price-form"
            loading={loading}
            disabled={noChange || futureDate || Boolean(invalidMargin)}
          >
            <TrendingUp className="size-4" aria-hidden /> Simpan Harga Baru
          </Button>
        </>
      }
    >
      <form id="raise-price-form" onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}

        <div>
          <Label required>Metode kenaikan</Label>
          <div className="mt-1 grid grid-cols-2 gap-1 rounded-sm bg-surface-muted p-1">
            {(
              [
                { value: "percent", label: "Persen (%)" },
                { value: "nominal", label: "Nominal (Rp)" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={mode === option.value}
                onClick={() => setMode(option.value)}
                className={
                  mode === option.value
                    ? "h-9 rounded-[6px] bg-surface text-xs font-semibold text-foreground shadow-card"
                    : "h-9 rounded-[6px] text-xs font-semibold text-foreground-muted hover:text-foreground"
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="raise-jual" required>
              Kenaikan harga jual
            </Label>
            <Input
              id="raise-jual"
              type="number"
              inputMode="decimal"
              min={0}
              max={mode === "percent" ? 100 : undefined}
              step={mode === "percent" ? "0.1" : "100"}
              value={jual}
              onChange={(event) => setJual(Math.max(0, Number(event.target.value) || 0))}
              className="money"
            />
            <FieldHint>{mode === "percent" ? "Contoh: 5 = naik 5%." : "Contoh: 1000 = naik Rp1.000."}</FieldHint>
          </div>
          <div>
            <Label htmlFor="raise-beli" required>
              Kenaikan harga beli
            </Label>
            <Input
              id="raise-beli"
              type="number"
              inputMode="decimal"
              min={0}
              max={mode === "percent" ? 100 : undefined}
              step={mode === "percent" ? "0.1" : "100"}
              value={beli}
              onChange={(event) => setBeli(Math.max(0, Number(event.target.value) || 0))}
              className="money"
            />
            <FieldHint>Isi 0 kalau modal tidak ikut naik.</FieldHint>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="raise-effective" required>
              Berlaku mulai
            </Label>
            <Input
              id="raise-effective"
              type="date"
              value={effectiveFrom}
              max={todayWib()}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              required
            />
            <FieldHint>
              Titik riwayat harga dan dasar perhitungan kenaikan. Penjualan baru selalu
              memakai harga terkini.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="raise-rounding" required>
              Pembulatan
            </Label>
            <Select
              id="raise-rounding"
              value={rounding}
              onChange={(event) => setRounding(event.target.value as PriceRounding)}
            >
              {roundingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <Alert tone="info" title="Riwayat transaksi aman">
          Penjualan yang sudah tercatat menyimpan harga dan modalnya, jadi nominalnya tidak
          berubah. Penjualan berikutnya otomatis memakai harga baru.
        </Alert>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-foreground-muted">
            Pratinjau {products.length} produk
          </p>
          <div className="scrollbar-thin max-h-64 overflow-y-auto rounded-sm border border-border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface-muted/90 backdrop-blur">
                <tr className="text-[11px] uppercase tracking-wide text-foreground-muted">
                  <th className="px-3 py-2 font-semibold">Produk</th>
                  <th className="px-3 py-2 font-semibold">Harga jual</th>
                  <th className="px-3 py-2 font-semibold">Harga beli</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.map((item) => (
                  <tr key={item.product.id}>
                    <td className="max-w-[180px] truncate px-3 py-2 font-medium">{item.product.nama}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="text-foreground-muted">{formatRupiah(item.base.hargaJual)}</span>
                      <span className="mx-1 text-foreground-muted">→</span>
                      <span className="money font-semibold">{formatRupiah(item.nextJual)}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="text-foreground-muted">{formatRupiah(item.base.hargaBeli)}</span>
                      <span className="mx-1 text-foreground-muted">→</span>
                      <span className="money font-semibold">{formatRupiah(item.nextBeli)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </form>
    </Modal>
  );
}
