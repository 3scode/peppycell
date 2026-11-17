"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { loginAction, requestPasswordResetAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldError } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    const result = await loginAction({ email, password, remember, next });
    setLoading(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal masuk.");
      setFieldErrors(result.error?.fieldErrors ?? {});
      return;
    }
    toast.success("Berhasil masuk. Mengalihkan…");
    router.push(result.data?.redirectTo ?? "/dashboard");
    router.refresh();
  }

  async function onReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetLoading(true);
    const result = await requestPasswordResetAction({ email: resetEmail });
    setResetLoading(false);
    if (!result.ok) {
      toast.error(result.error?.message ?? "Gagal mengirim permintaan.");
      return;
    }
    toast.success("Jika email terdaftar, tautan reset telah dikirim.");
    setResetOpen(false);
  }

  return (
    <>
      <form onSubmit={onSubmit} aria-labelledby="login-title" className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}

        <div>
          <Label htmlFor="email" required>
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="nama@peppycell.id"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            required
          />
          {fieldErrors.email ? <FieldError id="email-error">{fieldErrors.email[0]}</FieldError> : null}
        </div>

        <div>
          <Label htmlFor="password" required>
            Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              className="pr-12"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-sm text-foreground-muted hover:bg-surface-muted"
            >
              {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </button>
          </div>
          {fieldErrors.password ? (
            <FieldError>{fieldErrors.password[0]}</FieldError>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-foreground-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
            Ingat saya
          </label>
          <button
            type="button"
            onClick={() => {
              setResetEmail(email);
              setResetOpen(true);
            }}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Lupa password?
          </button>
        </div>

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {loading ? "Memproses…" : "Masuk"}
        </Button>

        <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-foreground-muted">
          <ShieldCheck className="size-3.5" aria-hidden />
          Diamankan Supabase Auth
        </p>
      </form>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Lupa password"
        description="Masukkan email akun Anda. Admin dapat mengirim tautan reset."
        size="sm"
      >
        <form onSubmit={onReset} className="space-y-4">
          <div>
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="nama@peppycell.id"
              required
            />
          </div>
          <div className="flex items-center gap-2 rounded-sm bg-surface-muted p-2.5 text-[11px] text-foreground-muted">
            <LockKeyhole className="size-4 shrink-0" aria-hidden />
            Tautan reset dikirim melalui Supabase Auth.
          </div>
          <Button type="submit" className="w-full" loading={resetLoading}>
            Kirim permintaan
          </Button>
        </form>
      </Modal>
    </>
  );
}
