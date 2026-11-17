"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { updateProfileAction } from "@/actions/settings";
import type { SessionUser } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldError } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";

export function ProfileDialog({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(user.fullName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function openDialog() {
    setFullName(user.fullName);
    setError(null);
    setFieldError(null);
    setOpen(true);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    const clean = fullName.trim();
    if (clean.length < 3) {
      setFieldError("Nama minimal 3 karakter.");
      return;
    }
    if (clean.length > 60) {
      setFieldError("Nama maksimal 60 karakter.");
      return;
    }
    setLoading(true);
    const result = await updateProfileAction({ fullName: clean });
    setLoading(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal menyimpan profil.");
      setFieldError(result.error?.fieldErrors?.fullName?.[0] ?? null);
      return;
    }
    toast.success("Perubahan disimpan.");
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
        title="Edit profil"
        description="Nama tampil di transaksi, payout, dan jejak audit."
        size="sm"
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" form="profile-form" loading={loading}>
              Simpan
            </Button>
          </>
        }
      >
        <form id="profile-form" onSubmit={onSubmit} className="space-y-3">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div>
            <Label htmlFor="profile-name" required>
              Nama lengkap
            </Label>
            <Input
              id="profile-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              maxLength={60}
              minLength={3}
              autoComplete="name"
              aria-invalid={Boolean(fieldError)}
              required
            />
            {fieldError ? <FieldError>{fieldError}</FieldError> : null}
            <div className="mt-1 flex justify-between text-[11px] text-foreground-muted">
              <span>2–60 karakter.</span>
              <span className="money">{fullName.trim().length}/60</span>
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <p className="flex h-12 items-center rounded-sm border border-input bg-surface-muted px-3 text-sm text-foreground-muted">
              {user.email}
            </p>
            <p className="mt-1.5 text-[11px] text-foreground-muted">
              Email tidak dapat diubah sendiri. Hubungi Admin untuk perubahan.
            </p>
          </div>
        </form>
      </Modal>
    </>
  );
}
