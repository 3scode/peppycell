"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  HandCoins,
  Loader2,
  Lock,
} from "lucide-react";
import { executePayoutAction, previewPayoutAction } from "@/actions/payouts";
import { addDays, formatPeriod } from "@/lib/period";
import { allocateRupiah, formatRupiah } from "@/lib/money";
import type {
  PayoutAllocations,
  PayoutPreview,
  PayoutRecord,
  PayoutSettings,
  Wallet,
} from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldError } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { MoneyText } from "@/components/ui/money-text";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

const allocationMeta: {
  key: keyof PayoutAllocations;
  label: string;
  description: string;
  color: string;
}[] = [
  {
    key: "retained",
    label: "Kas ditahan",
    description: "Tetap di bisnis, tidak keluar dari wallet.",
    color: "bg-chart-1",
  },
  {
    key: "admin",
    label: "Deviden admin",
    description: "Dibagi ke seluruh admin aktif sesuai porsi.",
    color: "bg-chart-2",
  },
  {
    key: "investor",
    label: "Deviden investor",
    description: "Dibagi ke investor aktif sesuai porsi.",
    color: "bg-success-text",
  },
  {
    key: "employee",
    label: "Gaji karyawan",
    description: "Komisi/gaji karyawan aktif sesuai porsi.",
    color: "bg-warning-text",
  },
];

const categoryLabel = {
  admin_dividend: "Deviden Admin",
  investor_dividend: "Deviden Investor",
  employee_commission: "Gaji Karyawan",
} as const;

const warningLabel: Record<string, string> = {
  NEGATIVE_NET_PROFIT: "Laba bersih periode ini tidak positif. Payout tidak dapat diproses.",
  ROUNDING_RETAINED: "Kas ditahan menyerap sisa pembulatan rupiah.",
  "POOL_NO_RECIPIENT:admin_dividend": "Pool deviden admin tidak memiliki penerima aktif; dana masuk kas ditahan.",
  "POOL_NO_RECIPIENT:investor_dividend": "Pool deviden investor tidak memiliki penerima aktif; dana masuk kas ditahan.",
  "POOL_NO_RECIPIENT:employee_commission": "Pool gaji karyawan tidak memiliki penerima aktif; dana masuk kas ditahan.",
};

function validWarning(code: string | undefined) {
  if (!code) return null;
  return warningLabel[code] ?? code;
}

export function PayoutWizard({
  periods,
  wallets,
  settings,
  paidStarts,
  initialStart,
}: {
  periods: { start: string; end: string }[];
  wallets: Wallet[];
  settings: PayoutSettings;
  paidStarts: string[];
  initialStart?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [startDate, setStartDate] = useState(
    periods.find((period) => period.start === initialStart)?.start ?? periods[0]?.start ?? "",
  );
  const endDate = startDate ? addDays(startDate, 6) : "";

  const [basePreview, setBasePreview] = useState<PayoutPreview | null>(null);
  const [baseLoading, setBaseLoading] = useState(false);
  const [baseError, setBaseError] = useState<string | null>(null);

  const [allocations, setAllocations] = useState<PayoutAllocations>({
    retained: settings.retainedPct,
    admin: settings.adminPct,
    investor: settings.investorPct,
    employee: settings.employeePct,
  });
  const [review, setReview] = useState<PayoutPreview | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [walletId, setWalletId] = useState(
    wallets.find((wallet) => wallet.isDefault)?.id ?? wallets[0]?.id ?? "",
  );
  const [confirmed, setConfirmed] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [receipt, setReceipt] = useState<PayoutRecord | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const requestSeq = useRef(0);

  const totalPct = allocations.retained + allocations.admin + allocations.investor + allocations.employee;
  const allocationValid = Math.abs(totalPct - 100) < 0.01;
  const positiveNet = Math.max(0, basePreview?.netProfit ?? 0);
  const pools = useMemo(
    () =>
      allocateRupiah(positiveNet, [
        { key: "retained", pct: allocations.retained },
        { key: "admin", pct: allocations.admin },
        { key: "investor", pct: allocations.investor },
        { key: "employee", pct: allocations.employee },
      ]) as Record<keyof PayoutAllocations, number>,
    [positiveNet, allocations],
  );
  const totalOut = pools.admin + pools.investor + pools.employee;
  const selectedWallet = wallets.find((wallet) => wallet.id === walletId);
  const walletInsufficient = Boolean(selectedWallet && totalOut > selectedWallet.saldo);
  const alreadyPaid = paidStarts.includes(startDate);
  const canContinuePeriod =
    Boolean(basePreview) && !baseLoading && (basePreview?.netProfit ?? 0) > 0 && !alreadyPaid;

  /* eslint-disable react-hooks/set-state-in-effect --
     Fetch preview setiap periode berubah; indikator loading butuh state sinkron. */
  useEffect(() => {
    if (!startDate) return;
    const seq = ++requestSeq.current;
    setBaseLoading(true);
    setBaseError(null);
    setBasePreview(null);
    previewPayoutAction({ startDate, endDate: addDays(startDate, 6), allocations })
      .then((result) => {
        if (seq !== requestSeq.current) return;
        if (!result.ok) {
          setBaseError(result.error?.message ?? "Gagal menghitung periode.");
          return;
        }
        setBasePreview(result.data ?? null);
      })
      .finally(() => {
        if (seq === requestSeq.current) setBaseLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function updateAllocation(key: keyof PayoutAllocations, raw: string) {
    const value = Math.max(0, Math.min(100, Number(raw) || 0));
    setAllocations((prev) => ({ ...prev, [key]: value }));
    setReview(null);
  }

  async function goReview() {
    setError(null);
    if (!allocationValid) {
      setError(`Total alokasi harus 100%. Saat ini ${totalPct}%.`);
      return;
    }
    setReviewLoading(true);
    const result = await previewPayoutAction({ startDate, endDate, allocations });
    setReviewLoading(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal menghitung alokasi.");
      return;
    }
    const data = result.data ?? null;
    setReview(data);
    if (data) {
      const preferred = wallets.find(
        (wallet) => wallet.isDefault && wallet.saldo >= data.items.reduce((sum, item) => sum + item.amount, 0),
      );
      const sufficient = wallets.find(
        (wallet) => wallet.saldo >= data.items.reduce((sum, item) => sum + item.amount, 0),
      );
      setWalletId(preferred?.id ?? sufficient?.id ?? wallets.find((wallet) => wallet.isDefault)?.id ?? wallets[0]?.id ?? "");
    }
    setConfirmed(false);
    setStep(3);
  }

  async function execute() {
    if (!review) return;
    setError(null);
    if (!confirmed) {
      setError("Centang konfirmasi sebelum memproses payout.");
      return;
    }
    if (walletInsufficient) {
      setError("Saldo wallet sumber tidak mencukupi total pembagian.");
      return;
    }
    setExecuting(true);
    const result = await executePayoutAction({
      startDate,
      endDate,
      walletId,
      allocations,
      idempotencyKey,
      confirmed: true,
    });
    setExecuting(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Payout gagal diproses. Tidak ada saldo yang berubah.");
      return;
    }
    setReceipt(result.data ?? null);
    setIdempotencyKey(crypto.randomUUID());
    router.refresh();
  }

  const reviewItemsByCategory = useMemo(() => {
    if (!review) return [];
    const groups = new Map<string, PayoutPreview["items"]>();
    for (const item of review.items) {
      groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    }
    return Array.from(groups.entries());
  }, [review]);

  return (
    <div>
      <Stepper step={step} />

      {baseError ? (
        <Alert tone="error" className="mb-4">
          {baseError}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-7">
            <section className="rounded-md border border-border bg-surface p-4 shadow-card sm:p-5">
              <Label htmlFor="period-start" required>
                Periode Senin–Minggu
              </Label>
              <Select
                id="period-start"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setStep(1);
                  setBasePreview(null);
                  setBaseError(null);
                }}
              >
                {periods.map((period) => (
                  <option key={period.start} value={period.start}>
                    {formatPeriod(period.start, period.end)}
                    {paidStarts.includes(period.start) ? " — sudah diproses" : ""}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-[11px] text-foreground-muted">
                Hanya periode yang sudah ditutup (Minggu 23:59 WIB) yang dapat diproses.
              </p>

              {alreadyPaid ? (
                <Alert tone="warning" className="mt-3">
                  Periode ini sudah memiliki payout. Pilih periode lain atau lihat riwayat.
                </Alert>
              ) : null}

              {baseLoading ? (
                <div className="mt-4 flex items-center gap-2 rounded-sm bg-surface-muted p-3 text-xs text-foreground-muted">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Menghitung margin dan beban…
                </div>
              ) : basePreview ? (
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-foreground-muted">Margin penjualan</dt>
                    <dd className="money font-medium">{formatRupiah(basePreview.grossMargin)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-foreground-muted">Beban operasional</dt>
                    <dd className="money font-medium text-error-text">
                      −{formatRupiah(basePreview.operatingExpense)}
                    </dd>
                  </div>
                  <div className="flex items-end justify-between gap-2 border-t border-border pt-2">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      Laba bersih
                    </dt>
                    <dd>
                      <MoneyText
                        value={basePreview.netProfit}
                        tone={basePreview.netProfit < 0 ? "expense" : "default"}
                        size="lg"
                      />
                    </dd>
                  </div>
                </dl>
              ) : null}

              {basePreview?.warnings.length ? (
                <div className="mt-3 space-y-1.5">
                  {basePreview.warnings.map((warning) =>
                    validWarning(warning) ? (
                      <Alert
                        key={warning}
                        tone={warning === "NEGATIVE_NET_PROFIT" ? "warning" : "info"}
                      >
                        {validWarning(warning)}
                      </Alert>
                    ) : null,
                  )}
                </div>
              ) : null}

              {basePreview && basePreview.netProfit <= 0 ? (
                <Alert tone="warning" className="mt-3" title="Payout diblokir">
                  Laba bersih periode ini tidak positif. Catat transaksi lain atau pilih periode
                  berbeda.
                </Alert>
              ) : null}
            </section>
          </div>

          <aside className="lg:col-span-5">
            <div className="rounded-md border border-border bg-surface p-4 shadow-card lg:sticky lg:top-24">
              <h2 className="text-base font-semibold">Sebelum lanjut</h2>
              <ul className="mt-2 space-y-2 text-xs leading-5 text-foreground-muted">
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success-text" aria-hidden />
                  Laba dihitung dari margin penjualan dikurangi beban operasional.
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success-text" aria-hidden />
                  Transaksi historis hasil import tidak dihitung dan memblokir periode.
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success-text" aria-hidden />
                  Payout mencatat jurnal keluar per penerima; tidak dapat dibatalkan.
                </li>
              </ul>
              <Button
                className="mt-4 w-full"
                size="lg"
                onClick={() => setStep(2)}
                disabled={!canContinuePeriod}
              >
                Lanjut ke Alokasi <ArrowRight className="size-4" aria-hidden />
              </Button>
              {!canContinuePeriod && !baseLoading ? (
                <p className="mt-2 text-center text-[11px] text-foreground-muted">
                  Pilih periode dengan laba positif yang belum diproses.
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-7">
            <section className="rounded-md border border-border bg-surface p-4 shadow-card sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">Alokasi laba</h2>
                  <p className="text-xs text-foreground-muted">
                    Laba bersih {formatRupiah(basePreview?.netProfit ?? 0)} dibagi sesuai persentase.
                  </p>
                </div>
                <span
                  className={cn(
                    "money shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
                    allocationValid
                      ? "bg-success-soft text-success-text"
                      : "bg-error-soft text-error-text",
                  )}
                  aria-live="polite"
                >
                  {totalPct}%
                </span>
              </div>

              <div className="mt-4 space-y-4">
                {allocationMeta.map((meta) => (
                  <div key={meta.key}>
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor={`allocation-${meta.key}`}
                        className="text-sm font-semibold"
                      >
                        {meta.label}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          id={`allocation-${meta.key}`}
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={allocations[meta.key]}
                          onChange={(event) => updateAllocation(meta.key, event.target.value)}
                          className="h-10 w-20 text-right"
                          aria-label={`${meta.label} dalam persen`}
                        />
                        <span className="text-xs text-foreground-muted">%</span>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={allocations[meta.key]}
                        onChange={(event) => updateAllocation(meta.key, event.target.value)}
                        aria-label={`Slider ${meta.label}`}
                        aria-valuetext={`${allocations[meta.key]} persen, ${formatRupiah(pools[meta.key])}`}
                        className="h-11 flex-1 accent-primary"
                      />
                      <span className="money w-28 shrink-0 text-right text-xs font-semibold">
                        {formatRupiah(pools[meta.key])}
                      </span>
                    </div>
                    <p className="text-[11px] text-foreground-muted">{meta.description}</p>
                  </div>
                ))}
              </div>

              <div
                className={cn(
                  "mt-4 flex items-center justify-between gap-2 rounded-sm border px-3 py-2.5 text-xs",
                  allocationValid
                    ? "border-success/20 bg-success-soft text-success-text"
                    : "border-error/20 bg-error-soft text-error-text",
                )}
                aria-live="polite"
              >
                <span className="font-semibold">
                  {allocationValid ? "Total 100% — siap" : "Total harus 100%"}
                </span>
                <span className="money font-bold">{totalPct}%</span>
              </div>
            </section>

            <section className="rounded-md border border-border bg-surface p-4 shadow-card">
              <h2 className="text-sm font-semibold">Penerima</h2>
              <p className="text-[11px] text-foreground-muted">
                Porsi dihitung dari porsi default tiap pengguna di dalam pool role-nya.
              </p>
              <div className="mt-2 space-y-1">
                {(basePreview?.items ?? []).length === 0 ? (
                  <p className="rounded-sm bg-surface-muted p-3 text-xs text-foreground-muted">
                    Tidak ada penerima aktif pada alokasi ini.
                  </p>
                ) : (
                  (basePreview?.items ?? []).map((item) => (
                    <div
                      key={`${item.category}-${item.userId}`}
                      className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={cn("size-1.5 shrink-0 rounded-full", categoryDot(item.category))} />
                        <span className="truncate font-medium">{item.fullName}</span>
                        <span className="shrink-0 text-foreground-muted">{item.weightPct}%</span>
                      </span>
                      <span className="shrink-0 text-foreground-muted">
                        {formatRupiah(
                          Math.floor(
                            (pools[poolKey(item.category)] * item.weightPct) / 100,
                          ),
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <p className="mt-2 text-[10px] text-foreground-muted">
                Nominal final (termasuk pembulatan rupiah) tampil di langkah Review.
              </p>
            </section>
          </div>

          <aside className="lg:col-span-5">
            <div className="rounded-md border border-border bg-surface p-4 shadow-card lg:sticky lg:top-24">
              <h2 className="text-base font-semibold">Ringkasan alokasi</h2>
              <dl className="mt-3 space-y-2 text-xs">
                {allocationMeta.map((meta) => (
                  <div key={meta.key} className="flex items-center justify-between gap-2">
                    <dt className="inline-flex items-center gap-1.5 text-foreground-muted">
                      <span aria-hidden className={cn("size-2 rounded-full", meta.color)} />
                      {meta.label}
                    </dt>
                    <dd className="money font-semibold">{formatRupiah(pools[meta.key])}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                  <dt className="font-semibold">Total dibagikan</dt>
                  <dd><MoneyText value={totalOut} tone="payout" /></dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-foreground-muted">Kas ditahan aktual</dt>
                  <dd className="money font-medium text-foreground-muted">
                    {formatRupiah((basePreview?.netProfit ?? 0) - totalOut)}
                  </dd>
                </div>
              </dl>

              <div className="mt-3 rounded-sm bg-surface-muted/70 p-2.5 text-[11px] leading-5 text-foreground-muted">
                Kas ditahan menyerap sisa pembulatan dan pool yang tidak punya penerima aktif.
                Retained tidak mengurangi saldo wallet.
              </div>

              <Button
                className="mt-4 w-full"
                size="lg"
                onClick={goReview}
                loading={reviewLoading}
                disabled={!allocationValid}
              >
                Lanjut ke Review <ArrowRight className="size-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                className="mt-1.5 w-full"
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
              >
                <ArrowLeft className="size-4" aria-hidden /> Kembali ke Periode
              </Button>
            </div>
          </aside>
        </div>
      ) : null}

      {step === 3 && review ? (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-7">
            <section className="rounded-md border border-border bg-surface p-4 shadow-card sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold">Review & eksekusi</h2>
                  <p className="text-xs text-foreground-muted">
                    {formatPeriod(review.startDate, review.endDate)} · laba{" "}
                    {formatRupiah(review.netProfit)}
                  </p>
                </div>
                <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary">
                  Langkah akhir
                </span>
              </div>

              <div className="mt-3 space-y-1">
                {reviewItemsByCategory.map(([category, items]) => (
                  <div key={category} className="rounded-sm border border-border">
                    <div className="flex items-center justify-between gap-2 bg-surface-muted/70 px-2.5 py-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                        {categoryLabel[category as keyof typeof categoryLabel] ?? category}
                      </p>
                      <span className="money text-[11px] font-semibold">
                        {formatRupiah(items.reduce((sum, item) => sum + item.amount, 0))}
                      </span>
                    </div>
                    <div className="divide-y divide-border">
                      {items.map((item) => (
                        <div
                          key={`${item.category}-${item.userId}`}
                          className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{item.fullName}</p>
                            <p className="text-[10px] text-foreground-muted">
                              porsi {item.weightPct}% dari pool
                            </p>
                          </div>
                          <span className="money shrink-0 font-semibold">
                            {formatRupiah(item.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-end justify-between gap-2 border-t border-border pt-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                    Total kas keluar
                  </p>
                  <p className="text-[10px] text-foreground-muted">Tanpa kas ditahan.</p>
                </div>
                <MoneyText
                  value={review.items.reduce((sum, item) => sum + item.amount, 0)}
                  tone="payout"
                  size="display"
                />
              </div>
            </section>

            {review.warnings.length > 0 ? (
              <div className="space-y-1.5">
                {review.warnings.map((warning) =>
                  validWarning(warning) ? (
                    <Alert key={warning} tone={warning === "NEGATIVE_NET_PROFIT" ? "warning" : "info"}>
                      {validWarning(warning)}
                    </Alert>
                  ) : null,
                )}
              </div>
            ) : null}
          </div>

          <aside className="lg:col-span-5">
            <div className="rounded-md border border-border bg-surface p-4 shadow-card lg:sticky lg:top-24">
              <h2 className="text-base font-semibold">Sumber dana</h2>
              <p className="text-xs text-foreground-muted">
                Pilih wallet yang saldonya dipotong untuk pembagian.
              </p>

              <div className="mt-3">
                <Label htmlFor="payout-wallet" required>
                  Wallet sumber
                </Label>
                <Select
                  id="payout-wallet"
                  value={walletId}
                  onChange={(event) => setWalletId(event.target.value)}
                >
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.nama} — {formatRupiah(wallet.saldo)}
                    </option>
                  ))}
                </Select>
                {walletInsufficient ? (
                  <FieldError>
                    Saldo {selectedWallet?.nama} {formatRupiah(selectedWallet?.saldo ?? 0)}, dibutuhkan{" "}
                    {formatRupiah(totalOut)}.
                  </FieldError>
                ) : selectedWallet ? (
                  <p className="mt-1 text-[11px] text-foreground-muted">
                    Saldo setelah payout:{" "}
                    <span className="money font-semibold">
                      {formatRupiah(selectedWallet.saldo - totalOut)}
                    </span>
                  </p>
                ) : null}
              </div>

              <div className="mt-3 space-y-1.5 rounded-sm bg-surface-muted/70 p-3 text-[11px] leading-5 text-foreground-muted">
                <div className="flex justify-between gap-2">
                  <span>Kas ditahan</span>
                  <span className="money font-semibold text-foreground">
                    {formatRupiah(review.retainedActual)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>Dibagikan</span>
                  <span className="money font-semibold text-foreground">
                    {formatRupiah(review.items.reduce((sum, item) => sum + item.amount, 0))}
                  </span>
                </div>
                <div className="flex justify-between gap-2 border-t border-border pt-1.5">
                  <span>Laba bersih</span>
                  <span className="money font-semibold text-foreground">
                    {formatRupiah(review.netProfit)}
                  </span>
                </div>
              </div>

              <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2.5 rounded-sm border border-border p-3">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-0.5 size-4 rounded border-input accent-primary"
                />
                <span className="text-xs leading-5 text-foreground-muted">
                  Saya sudah memeriksa periode, alokasi, dan penerima. Payout akan membuat jurnal
                  keluar dan tidak dapat dibatalkan.
                </span>
              </label>

              {error ? <Alert tone="error" className="mt-3">{error}</Alert> : null}

              <Button
                className="mt-3 w-full"
                size="lg"
                onClick={execute}
                loading={executing}
                disabled={!confirmed || walletInsufficient}
              >
                <HandCoins className="size-4" aria-hidden /> Proses Payout Sekarang
              </Button>
              <Button
                variant="ghost"
                className="mt-1.5 w-full"
                onClick={() => {
                  setError(null);
                  setStep(2);
                }}
              >
                <ArrowLeft className="size-4" aria-hidden /> Ubah Alokasi
              </Button>
              <p className="mt-2 flex items-center justify-center gap-1 text-[10px] text-foreground-muted">
                <Lock className="size-3" aria-hidden /> Idempotent · aman dari double submit
              </p>
            </div>
          </aside>
        </div>
      ) : null}

      {step === 3 && !review ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface p-5 text-sm text-foreground-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Memuat review payout…
        </div>
      ) : null}

      <Modal
        open={Boolean(receipt)}
        onClose={() => {
          setReceipt(null);
          setStep(1);
        }}
        title="Payout selesai"
        description="Jurnal keluar sudah tercatat dan saldo wallet diperbarui."
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setReceipt(null);
                setStep(1);
              }}
            >
              Proses Periode Lain
            </Button>
            <Button asChild type="button">
              <Link href={receipt ? `/profit-sharing/history/${receipt.id}` : "/profit-sharing/history"}>
                Lihat Detail
              </Link>
            </Button>
          </>
        }
      >
        {receipt ? (
          <div className="space-y-3 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success-text">
              <CheckCircle2 className="size-6" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold">
                {formatPeriod(receipt.startDate, receipt.endDate)}
              </p>
              <p className="text-xs text-foreground-muted">{receipt.id}</p>
            </div>
            <MoneyText value={receipt.totalDistributed} tone="payout" size="display" />
            <p className="text-xs text-foreground-muted">
              Dibagikan melalui {receipt.walletName} · {receipt.items.length} penerima
            </p>
            <a
              href={`/api/payouts/${receipt.id}/pdf`}
              className="inline-flex h-11 items-center gap-1.5 rounded-sm border border-border px-4 text-sm font-semibold hover:bg-surface-muted"
            >
              <Download className="size-4" aria-hidden /> Unduh PDF
            </a>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items = [
    { step: 1, label: "Verifikasi Periode" },
    { step: 2, label: "Alokasi" },
    { step: 3, label: "Review & Eksekusi" },
  ];
  return (
    <ol className="mb-4 grid grid-cols-3 gap-1 rounded-md border border-border bg-surface p-2 shadow-card">
      {items.map((item) => {
        const done = step > item.step;
        const current = step === item.step;
        return (
          <li
            key={item.step}
            aria-current={current ? "step" : undefined}
            className="flex items-center gap-2 px-1"
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                done
                  ? "bg-success-soft text-success-text"
                  : current
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-muted text-foreground-muted",
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : item.step}
            </span>
            <span
              className={cn(
                "hidden text-[11px] font-semibold leading-4 sm:block",
                current ? "text-foreground" : "text-foreground-muted",
              )}
            >
              {item.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function categoryDot(category: string) {
  if (category === "admin_dividend") return "bg-chart-2";
  if (category === "investor_dividend") return "bg-success-text";
  return "bg-warning-text";
}

function poolKey(category: string): keyof PayoutAllocations {
  if (category === "admin_dividend") return "admin";
  if (category === "investor_dividend") return "investor";
  return "employee";
}
