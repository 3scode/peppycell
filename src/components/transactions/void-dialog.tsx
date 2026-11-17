"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { voidTransactionAction } from "@/actions/transactions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Label, FieldError } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";

export function VoidDialog({
  transactionId,
  amountLabel,
}: {
  transactionId: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    if (reason.trim().length < 10) {
      setFieldError("Alasan minimal 10 karakter.");
      return;
    }
    setLoading(true);
    const result = await voidTransactionAction({ id: transactionId, reason });
    setLoading(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal membatalkan transaksi.");
      return;
    }
    toast.success("Transaksi dibatalkan. Jurnal balik tercatat.");
    setOpen(false);
    setReason("");
    router.refresh();
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Ban className="size-4" aria-hidden /> Batalkan Transaksi
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Batalkan transaksi?"
        description="Transaksi tidak dihapus. Sistem membuat jurnal balik dan mengembalikan saldo wallet."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} type="button">
              Batal
            </Button>
            <Button
              variant="danger-solid"
              type="submit"
              form="void-form"
              loading={loading}
            >
              Ya, batalkan
            </Button>
          </>
        }
      >
        <form id="void-form" onSubmit={onSubmit} className="space-y-3">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Alert tone="warning" title={`Efek saldo ${amountLabel}`}>
            Saldo wallet terkait akan dikembalikan ke kondisi sebelum transaksi. Transaksi payout
            dan hasil import tidak dapat dibatalkan.
          </Alert>
          <div>
            <Label htmlFor="void-reason" required>Alasan pembatalan</Label>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Salah input produk, seharusnya Telkomsel 15 GB."
              aria-invalid={Boolean(fieldError)}
              required
            />
            <div className="mt-1 flex items-center justify-between text-[11px] text-foreground-muted">
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
