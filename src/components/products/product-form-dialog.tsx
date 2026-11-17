"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Power } from "lucide-react";
import { toast } from "sonner";
import { toggleProductAction, upsertProductAction } from "@/actions/products";
import type { Product } from "@/types/domain";
import { formatRupiah } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldError, FieldHint } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function ProductFormDialog({
  product,
  mode = "create",
  className,
}: {
  product?: Product;
  mode?: "create" | "edit";
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nama, setNama] = useState(product?.nama ?? "");
  const [operator, setOperator] = useState(product?.operator ?? "");
  const [hargaBeli, setHargaBeli] = useState(product?.hargaBeli ?? 0);
  const [hargaJual, setHargaJual] = useState(product?.hargaJual ?? 0);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const margin = hargaJual - hargaBeli;
  const marginPct = hargaJual > 0 ? (margin / hargaJual) * 100 : 0;
  const invalidMargin = hargaJual > 0 && margin < 0;

  const operatorOptions = useMemo(
    () => ["Telkomsel", "Indosat", "XL", "Tri", "Smartfren", "PLN", "Game"],
    [],
  );

  function reset() {
    if (!product) {
      setNama("");
      setOperator("");
      setHargaBeli(0);
      setHargaJual(0);
    }
    setError(null);
    setFieldErrors({});
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!nama.trim() || !operator.trim()) {
      setError("Nama dan operator wajib diisi.");
      return;
    }
    setLoading(true);
    const result = await upsertProductAction({
      id: product?.id,
      nama,
      operator,
      hargaBeli,
      hargaJual,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal menyimpan produk.");
      setFieldErrors(result.error?.fieldErrors ?? {});
      return;
    }
    toast.success(mode === "create" ? "Produk ditambahkan." : "Produk diperbarui.");
    setOpen(false);
    router.refresh();
  }

  async function onToggle() {
    if (!product) return;
    const next = !product.isActive;
    if (
      !window.confirm(
        next
          ? "Aktifkan kembali produk ini?"
          : "Nonaktifkan produk ini? Produk tidak akan muncul di input penjualan, tetapi riwayat tetap tersimpan.",
      )
    ) {
      return;
    }
    setToggling(true);
    const result = await toggleProductAction({ id: product.id, isActive: next });
    setToggling(false);
    if (!result.ok) {
      toast.error(result.error?.message ?? "Gagal mengubah status.");
      return;
    }
    toast.success(next ? "Produk diaktifkan." : "Produk dinonaktifkan.");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {mode === "create" ? (
        <Button size="sm" className="h-11" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden /> Tambah Produk
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${product?.nama ?? "produk"}`}
          className={cn("inline-flex h-9 items-center gap-1 rounded-sm border border-border px-2.5 text-xs font-semibold hover:bg-surface-muted", className)}
        >
          <Pencil className="size-3.5" aria-hidden /> Edit
        </button>
      )}

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title={mode === "create" ? "Tambah produk" : "Edit produk"}
        description="Harga beli hanya terlihat oleh Admin. Perubahan tidak mengubah snapshot transaksi lama."
        size="md"
        footer={
          <>
            {product ? (
              <Button
                type="button"
                variant={product.isActive ? "danger" : "success"}
                onClick={onToggle}
                loading={toggling}
                className="mr-auto"
              >
                <Power className="size-4" aria-hidden />
                {product.isActive ? "Nonaktifkan" : "Aktifkan"}
              </Button>
            ) : null}
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" form="product-form" loading={loading}>
              {loading ? "Menyimpan…" : "Simpan Produk"}
            </Button>
          </>
        }
      >
        <form id="product-form" onSubmit={onSubmit} className="space-y-3">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div>
            <Label htmlFor="product-name" required>Nama produk</Label>
            <Input
              id="product-name"
              value={nama}
              onChange={(event) => setNama(event.target.value)}
              maxLength={60}
              placeholder="Contoh: Telkomsel 10 GB"
              aria-invalid={Boolean(fieldErrors.nama)}
              required
            />
            {fieldErrors.nama ? <FieldError>{fieldErrors.nama[0]}</FieldError> : null}
          </div>
          <div>
            <Label htmlFor="product-operator" required>Operator</Label>
            <Input
              id="product-operator"
              list="operator-options"
              value={operator}
              onChange={(event) => setOperator(event.target.value)}
              placeholder="Telkomsel / Indosat / XL…"
              aria-invalid={Boolean(fieldErrors.operator)}
              required
            />
            <datalist id="operator-options">
              {operatorOptions.map((option) => <option key={option} value={option} />)}
            </datalist>
            {fieldErrors.operator ? <FieldError>{fieldErrors.operator[0]}</FieldError> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="product-cost" required>Harga beli (modal)</Label>
              <MoneyInput id="product-cost" value={hargaBeli} onChange={setHargaBeli} invalid={invalidMargin} />
              {fieldErrors.hargaBeli ? <FieldError>{fieldErrors.hargaBeli[0]}</FieldError> : null}
            </div>
            <div>
              <Label htmlFor="product-price" required>Harga jual</Label>
              <MoneyInput id="product-price" value={hargaJual} onChange={setHargaJual} invalid={invalidMargin} />
              {fieldErrors.hargaJual ? <FieldError>{fieldErrors.hargaJual[0]}</FieldError> : null}
            </div>
          </div>

          <div className={cn("rounded-sm border p-3", invalidMargin ? "border-error/30 bg-error-soft" : "border-border bg-surface-muted/60")}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground-muted">Margin per unit</span>
              <span className={cn("money font-semibold", invalidMargin ? "text-error-text" : margin >= 0 ? "text-success-text" : "text-foreground-muted")}>
                {formatRupiah(margin)} · {marginPct.toFixed(1).replace(".", ",")}%
              </span>
            </div>
            {invalidMargin ? (
              <p className="mt-1 text-[11px] font-medium text-error-text">
                Harga jual tidak boleh lebih rendah dari harga beli.
              </p>
            ) : (
              <FieldHint className="mt-1">Margin dihitung otomatis dari harga jual − harga beli.</FieldHint>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
