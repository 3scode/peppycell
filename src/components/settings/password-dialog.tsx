"use client";

import { useMemo, useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { changePasswordAction } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldError, FieldHint } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

function scorePassword(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 5);
}

const strengthMeta = [
  { label: "Kosong", color: "bg-border", text: "text-foreground-muted" },
  { label: "Lemah", color: "bg-error", text: "text-error-text" },
  { label: "Lemah", color: "bg-error", text: "text-error-text" },
  { label: "Sedang", color: "bg-warning", text: "text-warning-text" },
  { label: "Kuat", color: "bg-success", text: "text-success-text" },
  { label: "Sangat kuat", color: "bg-success", text: "text-success-text" },
];

export function PasswordDialog() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const score = useMemo(() => scorePassword(newPassword), [newPassword]);
  const meta = strengthMeta[score]!;
  const strongEnough = newPassword.length >= 8 && /[A-Za-z]/.test(newPassword) && /\d/.test(newPassword);
  const match = confirmPassword.length > 0 && confirmPassword === newPassword;

  function close() {
    setOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setFieldErrors({});
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!strongEnough) {
      setError("Password baru minimal 8 karakter, kombinasi huruf dan angka.");
      return;
    }
    if (!match) {
      setError("Konfirmasi password tidak sama.");
      return;
    }
    setLoading(true);
    const result = await changePasswordAction({ currentPassword, newPassword, confirmPassword });
    setLoading(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal memperbarui password.");
      setFieldErrors(result.error?.fieldErrors ?? {});
      return;
    }
    toast.success("Password diperbarui.");
    close();
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <KeyRound className="size-3.5" aria-hidden /> Ganti Password
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Ganti password"
        description="Gunakan password unik yang tidak dipakai di layanan lain."
        size="sm"
        footer={
          <>
            <Button variant="outline" type="button" onClick={close}>
              Batal
            </Button>
            <Button type="submit" form="password-form" loading={loading}>
              Perbarui Password
            </Button>
          </>
        }
      >
        <form id="password-form" onSubmit={onSubmit} className="space-y-3">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <div>
            <Label htmlFor="current-password" required>
              Password saat ini
            </Label>
            <Input
              id="current-password"
              type={show ? "text" : "password"}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              aria-invalid={Boolean(fieldErrors.currentPassword)}
              required
            />
            {fieldErrors.currentPassword ? (
              <FieldError>{fieldErrors.currentPassword[0]}</FieldError>
            ) : null}
          </div>

          <div>
            <Label htmlFor="new-password" required>
              Password baru
            </Label>
            <Input
              id="new-password"
              type={show ? "text" : "password"}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              aria-invalid={Boolean(fieldErrors.newPassword) || (newPassword.length > 0 && !strongEnough)}
              required
            />
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1" aria-hidden>
                {[1, 2, 3, 4, 5].map((level) => (
                  <span
                    key={level}
                    className={cn(
                      "h-1 flex-1 rounded-full transition-colors",
                      level <= score ? meta.color : "bg-border",
                    )}
                  />
                ))}
              </div>
              <span className={cn("text-[11px] font-semibold", meta.text)} aria-live="polite">
                {meta.label}
              </span>
            </div>
            <FieldHint>Minimal 8 karakter, kombinasi huruf dan angka.</FieldHint>
            {fieldErrors.newPassword ? <FieldError>{fieldErrors.newPassword[0]}</FieldError> : null}
          </div>

          <div>
            <Label htmlFor="confirm-password" required>
              Konfirmasi password baru
            </Label>
            <Input
              id="confirm-password"
              type={show ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              aria-invalid={confirmPassword.length > 0 && !match}
              required
            />
            {confirmPassword.length > 0 && !match ? (
              <FieldError>Konfirmasi password tidak sama.</FieldError>
            ) : null}
            {fieldErrors.confirmPassword ? (
              <FieldError>{fieldErrors.confirmPassword[0]}</FieldError>
            ) : null}
          </div>

          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-foreground-muted">
            <input
              type="checkbox"
              checked={show}
              onChange={(event) => setShow(event.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
            Tampilkan password
          </label>
        </form>
      </Modal>
    </>
  );
}
