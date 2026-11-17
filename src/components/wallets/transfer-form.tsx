"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, CheckCircle2, Lock } from "lucide-react";
import { toast } from "sonner";
import { transferWalletAction } from "@/actions/wallets";
import { formatRupiah } from "@/lib/money";
import { todayWib } from "@/lib/period";
import type { TransactionSafe, Wallet } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldError } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { Alert } from "@/components/ui/alert";
import { MoneyText } from "@/components/ui/money-text";

export function TransferForm({
  wallets,
  initialFrom,
}: {
  wallets: Wallet[];
  initialFrom?: string;
}) {
  const router = useRouter();
  const [fromId, setFromId] = useState(
    wallets.find((wallet) => wallet.id === initialFrom)?.id ?? wallets[0]?.id ?? "",
  );
  const [toId, setToId] = useState(
    wallets.find((wallet) => wallet.id !== (initialFrom ?? wallets[0]?.id))?.id ?? "",
  );
  const [tanggal, setTanggal] = useState(todayWib());
  const [nominal, setNominal] = useState(0);
  const [description, setDescription] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [success, setSuccess] = useState<TransactionSafe | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());

  const from = wallets.find((wallet) => wallet.id === fromId);
  const to = wallets.find((wallet) => wallet.id === toId);
  const sameWallet = Boolean(fromId && toId && fromId === toId);
  const insufficient = Boolean(from && nominal > from.saldo);
  const invalidNominal = nominal <= 0;
  const descriptionInvalid = description.trim().length < 5;

  const fromAfter = (from?.saldo ?? 0) - nominal;
  const toAfter = (to?.saldo ?? 0) + nominal;
  const canSubmit = Boolean(from && to) && !sameWallet && !insufficient && !invalidNominal && !descriptionInvalid;

  const quickAmounts = useMemo(() => {
    if (!from) return [];
    return [0.25, 0.5, 1].map((ratio) => ({
      ratio,
      value: Math.floor(from.saldo * ratio),
      label: ratio === 1 ? "Semua" : `${ratio * 100}%`,
    }));
  }, [from]);

  function swap() {
    setFromId(toId);
    setToId(fromId);
    setNominal(0);
  }

  function requestConfirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (sameWallet) {
      setError("Wallet asal dan tujuan tidak boleh sama.");
      return;
    }
    if (invalidNominal) {
      setError("Nominal harus lebih dari 0.");
      return;
    }
    if (insufficient) {
      setError(`Saldo ${from?.nama} tidak mencukupi (tersisa ${formatRupiah(from?.saldo ?? 0)}).`);
      return;
    }
    if (descriptionInvalid) {
      setError("Keterangan minimal 5 karakter.");
      return;
    }
    setConfirmOpen(true);
  }

  async function execute() {
    setLoading(true);
    setError(null);
    const result = await transferWalletAction({
      fromWalletId: fromId,
      toWalletId: toId,
      tanggal,
      nominal,
      description: description.trim(),
      clientRequestId,
    });
    setLoading(false);
    if (!result.ok) {
      setConfirmOpen(false);
      setError(result.error?.message ?? "Mutasi gagal diproses.");
      setFieldErrors(result.error?.fieldErrors ?? {});
      return;
    }
    setConfirmOpen(false);
    setSuccess(result.data ?? null);
    toast.success("Mutasi berhasil. Kedua saldo wallet sudah diperbarui.");
    router.refresh();
  }

  function reset() {
    setSuccess(null);
    setNominal(0);
    setDescription("");
    setClientRequestId(crypto.randomUUID());
    setError(null);
  }

  return (
    <>
      <form onSubmit={requestConfirm} className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-md border border-border bg-surface p-4 shadow-card sm:p-5">
            <Label htmlFor="transfer-date" required>Tanggal transfer</Label>
            <Input
              id="transfer-date"
              type="date"
              value={tanggal}
              max={todayWib()}
              onChange={(event) => setTanggal(event.target.value)}
              required
            />
            <p className="mt-1 text-[11px] text-foreground-muted">
              Tanggal tidak boleh melewati hari ini (WIB).
            </p>
          </div>
          <div className="rounded-md border border-border bg-surface p-4 shadow-card sm:p-5">
            <div>
              <Label htmlFor="from-wallet" required>
                Dari wallet
              </Label>
              <Select
                id="from-wallet"
                value={fromId}
                onChange={(event) => {
                  setFromId(event.target.value);
                  setNominal(0);
                }}
              >
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.nama} — {formatRupiah(wallet.saldo)}
                  </option>
                ))}
              </Select>
              {from ? (
                <p className="mt-1 text-[11px] text-foreground-muted">
                  Saldo tersedia <span className="money font-semibold">{formatRupiah(from.saldo)}</span>
                </p>
              ) : null}
            </div>

            <div className="my-2 flex justify-center">
              <button
                type="button"
                onClick={swap}
                aria-label="Tukar wallet asal dan tujuan"
                className="flex size-11 items-center justify-center rounded-full border border-border bg-surface text-foreground-muted shadow-card transition-transform hover:text-primary active:rotate-180"
              >
                <ArrowLeftRight className="size-4" aria-hidden />
              </button>
            </div>

            <div>
              <Label htmlFor="to-wallet" required>
                Ke wallet
              </Label>
              <Select
                id="to-wallet"
                value={toId}
                onChange={(event) => setToId(event.target.value)}
                aria-invalid={sameWallet}
              >
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.nama} — {formatRupiah(wallet.saldo)}
                  </option>
                ))}
              </Select>
              {sameWallet ? (
                <FieldError>Wallet asal dan tujuan tidak boleh sama.</FieldError>
              ) : null}
            </div>

            <div className="mt-4">
              <Label htmlFor="transfer-amount" required>
                Nominal
              </Label>
              <MoneyInput
                id="transfer-amount"
                value={nominal}
                onChange={setNominal}
                invalid={insufficient}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {quickAmounts.map((quick) => (
                  <button
                    key={quick.label}
                    type="button"
                    onClick={() => setNominal(quick.value)}
                    className="h-9 rounded-full border border-border px-3 text-[11px] font-semibold text-foreground-muted hover:border-primary/40 hover:text-primary"
                  >
                    {quick.label}
                    {quick.ratio !== 1 ? ` · ${formatRupiah(quick.value, { compact: true })}` : ""}
                  </button>
                ))}
              </div>
              {insufficient ? (
                <p className="mt-1.5 text-xs font-medium text-error-text">
                  Saldo {from?.nama} tidak mencukupi (tersisa {formatRupiah(from?.saldo ?? 0)}).
                </p>
              ) : null}
            </div>

            <div className="mt-4">
              <Label htmlFor="transfer-description" required>
                Keterangan
              </Label>
              <Textarea
                id="transfer-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Contoh: Setor kas konter ke rekening BCA."
                maxLength={200}
                minLength={5}
                required
              />
              <div className="mt-1 flex justify-between text-[11px] text-foreground-muted">
                <span>Minimal 5 karakter.</span>
                <span className="money">{description.length}/200</span>
              </div>
            </div>

            {error ? <Alert tone="error" className="mt-3">{error}</Alert> : null}
          </div>
        </div>

        <aside className="lg:col-span-5">
          <div className="rounded-md border border-border bg-surface p-4 shadow-card sm:p-5 lg:sticky lg:top-24">
            <h2 className="text-base font-semibold">Preview mutasi</h2>
            <p className="text-xs text-foreground-muted">
              Saldo baru dihitung otomatis sebelum konfirmasi.
            </p>

            <div className="mt-4 space-y-3">
              <div className="rounded-sm border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">{from?.nama ?? "—"}</p>
                  <span className="rounded-full bg-error-soft px-2 py-0.5 text-[10px] font-semibold text-error-text">
                    Keluar
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                  <span className="money text-foreground-muted">{formatRupiah(from?.saldo ?? 0)}</span>
                  <span aria-hidden className="text-foreground-muted">→</span>
                  <MoneyText value={fromAfter} tone={fromAfter < 0 ? "expense" : "default"} />
                </div>
              </div>

              <div className="rounded-sm border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold">{to?.nama ?? "—"}</p>
                  <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success-text">
                    Masuk
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                  <span className="money text-foreground-muted">{formatRupiah(to?.saldo ?? 0)}</span>
                  <span aria-hidden className="text-foreground-muted">→</span>
                  <MoneyText value={toAfter} tone="income" />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-end justify-between gap-2 border-t border-border pt-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                Nominal
              </span>
              <MoneyText value={nominal} tone="transfer" size="display" />
            </div>

            <Button type="submit" size="lg" className="mt-4 w-full" disabled={!canSubmit}>
              <ArrowLeftRight className="size-4" aria-hidden /> Konfirmasi Mutasi
            </Button>
            <p className="mt-2 flex items-start gap-1 text-center text-[11px] leading-4 text-foreground-muted">
              <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
              Saldo dan jurnal berubah bersamaan. Tidak ada mutasi tanpa keterangan.
            </p>
          </div>
        </aside>
      </form>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Konfirmasi mutasi aset"
        description="Periksa kembali detail pemindahan saldo."
        size="sm"
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setConfirmOpen(false)}>
              Kembali
            </Button>
            <Button type="button" onClick={execute} loading={loading}>
              Ya, Mutasikan
            </Button>
          </>
        }
      >
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-foreground-muted">Dari</dt>
            <dd className="font-medium">{from?.nama}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-foreground-muted">Ke</dt>
            <dd className="font-medium">{to?.nama}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-border pt-2">
            <dt className="text-foreground-muted">Nominal</dt>
            <dd><MoneyText value={nominal} tone="transfer" /></dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-foreground-muted">Keterangan</dt>
            <dd className="max-w-[220px] text-right text-xs">{description}</dd>
          </div>
        </dl>
        {fieldErrors.form ? <FieldError>{fieldErrors.form[0]}</FieldError> : null}
      </Modal>

      <Modal
        open={Boolean(success)}
        onClose={() => setSuccess(null)}
        title="Mutasi berhasil"
        description="Saldo kedua wallet sudah diperbarui dan jurnal tercatat."
        size="sm"
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setSuccess(null)}>
              Selesai
            </Button>
            <Button type="button" onClick={reset}>
              Mutasi Lagi
            </Button>
          </>
        }
      >
        {success ? (
          <div className="space-y-3 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success-text">
              <CheckCircle2 className="size-6" aria-hidden />
            </div>
            <MoneyText value={success.nominal} tone="transfer" size="display" />
            <p className="text-xs text-foreground-muted">
              {success.walletName} → {success.destinationWalletName}
            </p>
            <p className="text-[11px] text-foreground-muted">ID mutasi: {success.id}</p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
