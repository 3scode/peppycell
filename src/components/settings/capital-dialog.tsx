"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { updateCapitalAction } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Label, FieldError, FieldHint } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { MoneyInput } from "@/components/ui/money-input";
import { Alert } from "@/components/ui/alert";

export function CapitalDialog({ capital }: { capital: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modalAwal, setModalAwal] = useState(capital);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function openDialog() {
    setModalAwal(capital);
    setError(null);
    setFieldError(null);
    setOpen(true);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    if (!Number.isInteger(modalAwal) || modalAwal < 0) {
      setFieldError("Modal harus bilangan bulat ≥ 0.");
      return;
    }
    setLoading(true);
    const result = await updateCapitalAction({ modalAwal });
    setLoading(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal menyimpan modal.");
      setFieldError(result.error?.fieldErrors?.modalAwal?.[0] ?? null);
      return;
    }
    toast.success("Modal disetor disimpan.");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={openDialog}>
        <Pencil className="size-3.5" aria-hidden /> Edit
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit modal disetor"
        description="Dipakai untuk menghitung laba berjalan di halaman Wallet & Aset."
        size="sm"
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" form="capital-form" loading={loading}>
              Simpan
            </Button>
          </>
        }
      >
        <form id="capital-form" onSubmit={onSubmit} className="space-y-3">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div>
            <Label htmlFor="capital-amount" required>
              Modal disetor
            </Label>
            <MoneyInput
              id="capital-amount"
              value={modalAwal}
              onChange={setModalAwal}
              invalid={Boolean(fieldError)}
              ariaDescribedBy="capital-hint"
            />
            {fieldError ? <FieldError>{fieldError}</FieldError> : null}
            <FieldHint id="capital-hint">
              Laba berjalan = total aset − modal disetor. Set 0 kalau belum ingin dipakai.
            </FieldHint>
          </div>
        </form>
      </Modal>
    </>
  );
}
