"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { updatePayoutSettingsAction } from "@/actions/payouts";
import type { PayoutAllocations, PayoutSettings } from "@/types/domain";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

const fields: { key: keyof PayoutAllocations; label: string; hint: string }[] = [
  {
    key: "retained",
    label: "Kas ditahan",
    hint: "Tetap di bisnis dan tidak keluar dari wallet. Boleh 0%.",
  },
  {
    key: "admin",
    label: "Deviden admin",
    hint: "Dibagi ke seluruh admin aktif sesuai porsi masing-masing.",
  },
  {
    key: "investor",
    label: "Deviden investor",
    hint: "Dibagi ke investor aktif sesuai porsi masing-masing.",
  },
  {
    key: "employee",
    label: "Gaji karyawan",
    hint: "Komisi/gaji karyawan aktif sesuai porsi masing-masing.",
  },
];

function valuesOf(settings: PayoutSettings): PayoutAllocations {
  return {
    retained: settings.retainedPct,
    admin: settings.adminPct,
    investor: settings.investorPct,
    employee: settings.employeePct,
  };
}

export function PayoutSettingsDialog({ settings }: { settings: PayoutSettings }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PayoutAllocations>(() => valuesOf(settings));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = values.retained + values.admin + values.investor + values.employee;
  const valid = Math.abs(total - 100) < 0.01;

  function openDialog() {
    setValues(valuesOf(settings));
    setError(null);
    setOpen(true);
  }

  function closeDialog() {
    if (loading) return;
    setOpen(false);
  }

  function update(key: keyof PayoutAllocations, raw: string) {
    const value = Math.max(0, Math.min(100, Number(raw) || 0));
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    const result = await updatePayoutSettingsAction(values);
    setLoading(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal menyimpan alokasi.");
      return;
    }
    toast.success("Alokasi default diperbarui.");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}>
        <SlidersHorizontal className="size-4" aria-hidden /> Atur alokasi
      </Button>

      <Modal
        open={open}
        onClose={closeDialog}
        title="Atur alokasi default"
        description="Dipakai sebagai nilai awal wizard bagi hasil berikutnya. Payout yang sudah selesai tidak berubah."
        size="md"
        footer={
          <>
            <Button variant="outline" type="button" onClick={closeDialog} disabled={loading}>
              Batal
            </Button>
            <Button type="submit" form="payout-settings-form" loading={loading} disabled={!valid}>
              Simpan Alokasi
            </Button>
          </>
        }
      >
        <form id="payout-settings-form" onSubmit={onSubmit} className="space-y-3">
          {error ? <Alert tone="error">{error}</Alert> : null}

          {fields.map((field) => (
            <div key={field.key}>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`settings-${field.key}`} className="mb-0">
                  {field.label}
                </Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id={`settings-${field.key}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={1}
                    value={values[field.key]}
                    onChange={(event) => update(field.key, event.target.value)}
                    className="h-10 w-20 text-right"
                    aria-label={`${field.label} dalam persen`}
                  />
                  <span className="text-xs text-foreground-muted">%</span>
                </div>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-foreground-muted">{field.hint}</p>
            </div>
          ))}

          <div
            className={cn(
              "flex items-center justify-between gap-2 rounded-sm border px-3 py-2.5 text-xs",
              valid
                ? "border-success/20 bg-success-soft text-success-text"
                : "border-error/20 bg-error-soft text-error-text",
            )}
            aria-live="polite"
          >
            <span className="font-semibold">
              {valid ? "Total 100% — siap disimpan" : "Total alokasi harus 100%"}
            </span>
            <span className="money font-bold">{total}%</span>
          </div>

          <p className="text-[11px] leading-4 text-foreground-muted">
            Kas ditahan boleh diatur 0%. Nominal kas ditahan tetap bisa menerima sisa pembulatan
            rupiah dan pool yang tidak punya penerima aktif.
          </p>
        </form>
      </Modal>
    </>
  );
}
