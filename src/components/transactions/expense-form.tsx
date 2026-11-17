"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { createExpenseAction } from "@/actions/transactions";
import { formatRupiah } from "@/lib/money";
import { todayWib } from "@/lib/period";
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

interface WalletOption {
  id: string;
  nama: string;
  saldo: number;
}

const categories = [
  { value: "operasional", label: "Operasional" },
  { value: "gaji", label: "Gaji" },
  { value: "deviden", label: "Deviden" },
  { value: "lainnya", label: "Lainnya" },
] as const;

export function ExpenseForm({
  role,
  wallets,
  defaultWalletLabel,
}: {
  role: "admin" | "karyawan";
  wallets: WalletOption[] | null;
  defaultWalletLabel: string;
}) {
  const router = useRouter();
  const [tanggal, setTanggal] = useState(todayWib());
  const [kategori, setKategori] = useState<(typeof categories)[number]["value"]>("operasional");
  const [nominal, setNominal] = useState(0);
  const [walletId, setWalletId] = useState(wallets?.[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<TransactionDetail | null>(null);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());

  const selectedWallet = useMemo(
    () => wallets?.find((wallet) => wallet.id === walletId) ?? null,
    [wallets, walletId],
  );
  const saldoSetelah = selectedWallet ? selectedWallet.saldo - nominal : null;
  const insufficient = selectedWallet ? nominal > selectedWallet.saldo : false;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!nominal || nominal <= 0) {
      setError("Nominal harus lebih dari 0.");
      return;
    }
    if (description.trim().length < 5) {
      setError("Keterangan minimal 5 karakter.");
      return;
    }
    if (insufficient) {
      setError(`Saldo ${selectedWallet?.nama} tidak mencukupi.`);
      return;
    }
    const iso =
      tanggal === todayWib()
        ? new Date().toISOString()
        : new Date(`${tanggal}T12:00:00+07:00`).toISOString();

    setLoading(true);
    const result = await createExpenseAction({
      tanggal: iso,
      kategori,
      nominal,
      walletId: role === "admin" ? walletId || undefined : undefined,
      description: description.trim(),
      clientRequestId,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal menyimpan pengeluaran.");
      return;
    }
    setSuccess(result.data ?? null);
    toast.success("Pengeluaran berhasil dicatat.");
    router.refresh();
  }

  function resetForm() {
    setSuccess(null);
    setNominal(0);
    setDescription("");
    setClientRequestId(crypto.randomUUID());
  }

  return (
    <>
      <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-md border border-border bg-surface p-4 shadow-card sm:p-5">
            <div>
              <Label htmlFor="expense-date" required>Tanggal</Label>
              <Input
                id="expense-date"
                type="date"
                value={tanggal}
                max={todayWib()}
                onChange={(event) => setTanggal(event.target.value)}
                required
              />
              <FieldHint>Tidak boleh melebihi hari ini (WIB).</FieldHint>
            </div>

            <div className="mt-4">
              <Label htmlFor="expense-category" required>Kategori</Label>
              <Select
                id="expense-category"
                value={kategori}
                onChange={(event) => setKategori(event.target.value as typeof kategori)}
              >
                {categories.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </Select>
              <FieldHint>Hanya kategori Operasional yang mengurangi laba bersih payout.</FieldHint>
            </div>

            <div className="mt-4">
              <Label htmlFor="expense-amount" required>Nominal</Label>
              <MoneyInput id="expense-amount" value={nominal} onChange={setNominal} invalid={insufficient} />
              {insufficient ? (
                <p className="mt-1.5 text-xs font-medium text-error-text">
                  Saldo {selectedWallet?.nama} tersisa {formatRupiah(selectedWallet?.saldo ?? 0)}.
                </p>
              ) : null}
            </div>

            <div className="mt-4">
              <Label htmlFor="expense-wallet" required>Wallet</Label>
              {role === "admin" ? (
                <Select id="expense-wallet" value={walletId} onChange={(event) => setWalletId(event.target.value)}>
                  {(wallets ?? []).map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.nama} — {formatRupiah(wallet.saldo)}
                    </option>
                  ))}
                </Select>
              ) : (
                <div className="flex h-12 items-center gap-2 rounded-sm border border-input bg-surface-muted px-3 text-sm font-medium">
                  <Lock className="size-4 text-foreground-muted" aria-hidden /> {defaultWalletLabel}
                </div>
              )}
            </div>

            <div className="mt-4">
              <Label htmlFor="expense-description" required>Keterangan</Label>
              <Textarea
                id="expense-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Contoh: Bensin operasional konter."
                minLength={5}
                maxLength={200}
                required
              />
              <p className="mt-1 text-right text-[11px] text-foreground-muted">{description.length}/200</p>
            </div>
          </div>
        </div>

        <aside className="lg:col-span-5">
          <div className="rounded-md border border-border bg-surface p-4 shadow-card sm:p-5 lg:sticky lg:top-24">
            <h2 className="text-base font-semibold">Dampak pengeluaran</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-muted">Kategori</dt>
                <dd className="font-medium capitalize">{kategori}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-foreground-muted">Wallet</dt>
                <dd className="font-medium">{role === "admin" ? selectedWallet?.nama ?? "—" : defaultWalletLabel}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-border pt-3">
                <dt className="text-foreground-muted">Nominal</dt>
                <dd><MoneyText value={-nominal} tone="expense" size="lg" /></dd>
              </div>
              {role === "admin" && selectedWallet ? (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-foreground-muted">Saldo sekarang</dt>
                    <dd className="money font-medium">{formatRupiah(selectedWallet.saldo)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-foreground-muted">Saldo setelah</dt>
                    <dd>
                      <MoneyText value={saldoSetelah ?? 0} tone={(saldoSetelah ?? 0) < 0 ? "expense" : "default"} />
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>

            {error ? <Alert tone="error" className="mt-3">{error}</Alert> : null}
            <Button type="submit" size="lg" className="mt-4 w-full" loading={loading} disabled={insufficient || nominal <= 0}>
              {loading ? "Menyimpan…" : "Simpan Pengeluaran"}
            </Button>
            {role === "karyawan" ? (
              <p className="mt-2 text-center text-[11px] text-foreground-muted">
                Saldo wallet tidak ditampilkan untuk role Karyawan.
              </p>
            ) : null}
          </div>
        </aside>
      </form>

      <Modal
        open={Boolean(success)}
        onClose={() => setSuccess(null)}
        title="Pengeluaran tersimpan"
        description="Saldo wallet dan laba bersih sudah diperbarui."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setSuccess(null)} type="button">Selesai</Button>
            <Button onClick={resetForm} type="button">
              <ReceiptText className="size-4" aria-hidden /> Catat Lagi
            </Button>
          </>
        }
      >
        {success ? (
          <div className="space-y-3 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success-text">
              <Check className="size-6" aria-hidden />
            </div>
            <p className="text-sm font-semibold">{success.description}</p>
            <MoneyText value={success.nominal} tone="expense" size="display" />
            <p className="text-xs text-foreground-muted">
              {success.kategori} · {success.walletName} · {success.id}
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
