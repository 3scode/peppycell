"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scale } from "lucide-react";
import { toast } from "sonner";
import { adjustWalletAction } from "@/actions/wallets";
import type { Wallet } from "@/types/domain";
import { formatRupiah } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Label, FieldError, FieldHint } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { Alert } from "@/components/ui/alert";
import { MoneyText } from "@/components/ui/money-text";

export function AdjustBalanceDialog({
  wallets,
  wallet,
  label = "Sesuaikan Saldo",
  variant = "outline",
}: {
  wallets: Wallet[];
  wallet?: Wallet;
  label?: string;
  variant?: "outline" | "primary" | "secondary";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [walletId, setWalletId] = useState(wallet?.id ?? wallets[0]?.id ?? "");
  const [newBalance, setNewBalance] = useState(() => wallet?.saldo ?? wallets[0]?.saldo ?? 0);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const selected = wallets.find((item) => item.id === walletId);
  const delta = (selected?.saldo ?? 0) - newBalance;

  function openDialog() {
    setNewBalance(wallet?.saldo ?? wallets[0]?.saldo ?? 0);
    setReason("");
    setError(null);
    setFieldError(null);
    setOpen(true);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    if (!walletId) {
      setError("Pilih wallet terlebih dahulu.");
      return;
    }
    if (reason.trim().length < 10) {
      setFieldError("Alasan minimal 10 karakter.");
      return;
    }
    if (selected && newBalance === selected.saldo) {
      setError("Saldo baru sama dengan saldo lama.");
      return;
    }
    setLoading(true);
    const result = await adjustWalletAction({ walletId, newBalance, reason });
    setLoading(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal menyesuaikan saldo.");
      return;
    }
    toast.success("Saldo wallet disesuaikan. Perubahan tercatat di audit.");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant={variant} onClick={openDialog}>
        <Scale className="size-4" aria-hidden /> {label}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Sesuaikan saldo wallet"
        description="Gunakan hanya untuk koreksi saldo nyata. Setiap perubahan wajib memiliki alasan."
        size="sm"
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" form="adjust-form" loading={loading}>
              Simpan Penyesuaian
            </Button>
          </>
        }
      >
        <form id="adjust-form" onSubmit={onSubmit} className="space-y-3">
          {error ? <Alert tone="error">{error}</Alert> : null}
          {wallet ? null : (
            <div>
              <Label htmlFor="adjust-wallet" required>
                Wallet
              </Label>
              <Select
                id="adjust-wallet"
                value={walletId}
                onChange={(event) => {
                  const next = wallets.find((item) => item.id === event.target.value);
                  setWalletId(event.target.value);
                  setNewBalance(next?.saldo ?? 0);
                }}
              >
                {wallets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nama} — {formatRupiah(item.saldo)}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="rounded-sm bg-surface-muted/70 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-foreground-muted">Saldo saat ini</span>
              <span className="money font-semibold">{formatRupiah(selected?.saldo ?? 0)}</span>
            </div>
          </div>
          <div>
            <Label htmlFor="adjust-balance" required>
              Saldo baru
            </Label>
            <MoneyInput id="adjust-balance" value={newBalance} onChange={setNewBalance} />
            <FieldHint>
              {delta === 0
                ? "Masukkan angka berbeda dari saldo saat ini."
                : delta > 0
                  ? `Saldo akan berkurang ${formatRupiah(delta)}.`
                  : `Saldo akan bertambah ${formatRupiah(Math.abs(delta))}.`}
            </FieldHint>
          </div>
          {delta !== 0 ? (
            <div className="flex items-center justify-between gap-2 rounded-sm border border-border px-3 py-2 text-xs">
              <span className="text-foreground-muted">Selisih</span>
              <MoneyText value={-delta} signed tone={delta > 0 ? "expense" : "income"} />
            </div>
          ) : null}
          <div>
            <Label htmlFor="adjust-reason" required>
              Alasan
            </Label>
            <Textarea
              id="adjust-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Contoh: Hasil hitung ulang kas fisik, selisih Rp 50.000."
              maxLength={200}
              required
            />
            <div className="mt-1 flex justify-between text-[11px] text-foreground-muted">
              <span>Minimal 10 karakter.</span>
              <span className="money">{reason.length}/200</span>
            </div>
            {fieldError ? <FieldError>{fieldError}</FieldError> : null}
          </div>
        </form>
      </Modal>
    </>
  );
}
