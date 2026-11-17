"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Power, Wallet as WalletIcon } from "lucide-react";
import { toast } from "sonner";
import {
  createWalletAction,
  toggleWalletAction,
  updateWalletAction,
} from "@/actions/wallets";
import type { Wallet } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldError, FieldHint } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const walletTypes = [
  { value: "cash", label: "Cash / tunai" },
  { value: "bank", label: "Rekening bank" },
  { value: "digital", label: "Saldo digital" },
] as const;

export function WalletFormDialog({
  wallet,
  mode = "create",
  className,
}: {
  wallet?: Wallet;
  mode?: "create" | "edit";
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [nama, setNama] = useState(wallet?.nama ?? "");
  const [tipe, setTipe] = useState<Wallet["tipe"]>(wallet?.tipe ?? "cash");
  const [saldo, setSaldo] = useState(wallet?.saldo ?? 0);
  const [isDefault, setIsDefault] = useState(wallet?.isDefault ?? false);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function openDialog() {
    setNama(wallet?.nama ?? "");
    setTipe(wallet?.tipe ?? "cash");
    setSaldo(wallet?.saldo ?? 0);
    setIsDefault(wallet?.isDefault ?? false);
    setError(null);
    setFieldErrors({});
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setError(null);
    setFieldErrors({});
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!nama.trim()) {
      setError("Nama wallet wajib diisi.");
      return;
    }
    setLoading(true);
    const result =
      mode === "create"
        ? await createWalletAction({ nama, tipe, saldoAwal: saldo, isDefault })
        : await updateWalletAction({ id: wallet!.id, nama, tipe, saldo, isDefault });
    setLoading(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal menyimpan wallet.");
      setFieldErrors(result.error?.fieldErrors ?? {});
      return;
    }
    toast.success(mode === "create" ? "Wallet dibuat." : "Wallet diperbarui.");
    close();
    router.refresh();
  }

  async function onToggle() {
    if (!wallet) return;
    const next = !wallet.isActive;
    if (
      !window.confirm(
        next
          ? "Aktifkan kembali wallet ini?"
          : "Nonaktifkan wallet ini? Wallet bersaldo > 0 dan wallet default tidak bisa dinonaktifkan.",
      )
    ) {
      return;
    }
    setToggling(true);
    const result = await toggleWalletAction({ id: wallet.id, isActive: next });
    setToggling(false);
    if (!result.ok) {
      toast.error(result.error?.message ?? "Gagal mengubah status wallet.");
      return;
    }
    toast.success(next ? "Wallet diaktifkan." : "Wallet dinonaktifkan.");
    close();
    router.refresh();
  }

  return (
    <>
      {mode === "create" ? (
        <Button size="sm" className="h-11" onClick={openDialog}>
          <Plus className="size-4" aria-hidden /> Wallet Baru
        </Button>
      ) : (
        <button
          type="button"
          onClick={openDialog}
          className={cn(
            "inline-flex h-9 items-center gap-1 rounded-sm border border-border px-2.5 text-xs font-semibold hover:bg-surface-muted",
            className,
          )}
        >
          <Pencil className="size-3.5" aria-hidden /> Edit
        </button>
      )}

      <Modal
        open={open}
        onClose={close}
        title={mode === "create" ? "Buat wallet" : "Edit wallet"}
        description="Wallet memisahkan uang cash, rekening bank, dan saldo digital."
        size="sm"
        footer={
          <>
            {wallet && mode === "edit" ? (
              <Button
                type="button"
                variant={wallet.isActive ? "danger" : "success"}
                onClick={onToggle}
                loading={toggling}
                className="mr-auto"
              >
                <Power className="size-4" aria-hidden />
                {wallet.isActive ? "Nonaktifkan" : "Aktifkan"}
              </Button>
            ) : null}
            <Button variant="outline" type="button" onClick={close}>
              Batal
            </Button>
            <Button type="submit" form="wallet-form" loading={loading}>
              Simpan
            </Button>
          </>
        }
      >
        <form id="wallet-form" onSubmit={onSubmit} className="space-y-3">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div>
            <Label htmlFor="wallet-name" required>
              Nama wallet
            </Label>
            <Input
              id="wallet-name"
              value={nama}
              onChange={(event) => setNama(event.target.value)}
              maxLength={40}
              placeholder="Contoh: Rekening BCA"
              aria-invalid={Boolean(fieldErrors.nama)}
              required
            />
            {fieldErrors.nama ? <FieldError>{fieldErrors.nama[0]}</FieldError> : null}
          </div>
          <div>
            <Label htmlFor="wallet-type" required>
              Tipe
            </Label>
            <Select
              id="wallet-type"
              value={tipe}
              onChange={(event) => setTipe(event.target.value as Wallet["tipe"])}
            >
              {walletTypes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="wallet-balance">{mode === "create" ? "Saldo awal" : "Saldo"}</Label>
            <MoneyInput id="wallet-balance" value={saldo} onChange={setSaldo} />
            <FieldHint>
              {mode === "create"
                ? "Saldo awal dicatat sebagai penyesuaian audit. Setelah dibuat, nominal tetap bisa diubah dari form ini."
                : "Ubah nominal untuk koreksi saldo. Perubahan tercatat di audit sebagai penyesuaian."}
            </FieldHint>
            {fieldErrors.saldo ?? fieldErrors.saldoAwal ? (
              <FieldError>{(fieldErrors.saldo ?? fieldErrors.saldoAwal)![0]}</FieldError>
            ) : null}
          </div>
          <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-sm border border-border p-3">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
              disabled={wallet ? !wallet.isActive : false}
              className="mt-0.5 size-4 rounded border-input accent-primary"
            />
            <span>
              <span className="flex items-center gap-1 text-sm font-medium">
                <WalletIcon className="size-3.5 text-primary" aria-hidden /> Jadikan wallet default
              </span>
              <span className="mt-0.5 block text-[11px] leading-4 text-foreground-muted">
                Penjualan karyawan dan pengeluaran role Karyawan otomatis memakai wallet default.
              </span>
            </span>
          </label>
        </form>
      </Modal>
    </>
  );
}
