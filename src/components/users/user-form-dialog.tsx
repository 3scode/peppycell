"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, Power, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  createUserAction,
  toggleUserAction,
  updateUserAction,
} from "@/actions/users";
import type { UserRole, UserSummary } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldError, FieldHint } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";

const roleOptions: { value: UserRole; label: string; description: string }[] = [
  { value: "admin", label: "Admin", description: "Akses penuh ke wallet, laba, pengguna, dan payout." },
  { value: "karyawan", label: "Karyawan", description: "Mencatat penjualan/pengeluaran tanpa melihat modal & margin." },
  { value: "investor", label: "Investor", description: "Read-only: laba agregat dan deviden miliknya." },
];

export function UserFormDialog({
  user,
  mode = "create",
  className,
}: {
  user?: UserSummary;
  mode?: "create" | "edit";
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [role, setRole] = useState<UserRole>(user?.role ?? "karyawan");
  const [defaultProfitShare, setDefaultProfitShare] = useState(user?.defaultProfitShare ?? 100);
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function close() {
    setOpen(false);
    setError(null);
    setFieldErrors({});
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    const result =
      mode === "create"
        ? await createUserAction({ email, password, fullName, role, defaultProfitShare })
        : await updateUserAction({
            id: user!.id,
            fullName,
            role,
            defaultProfitShare,
            isActive,
            password: password.trim() ? password : undefined,
          });
    setLoading(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal menyimpan pengguna.");
      setFieldErrors(result.error?.fieldErrors ?? {});
      return;
    }
    toast.success(
      mode === "create"
        ? `${fullName} ditambahkan.`
        : password.trim()
          ? "Pengguna dan password diperbarui."
          : "Pengguna diperbarui.",
    );
    if (mode === "create") {
      setEmail("");
      setPassword("");
      setFullName("");
      setRole("karyawan");
      setDefaultProfitShare(100);
      setShowPassword(false);
    } else if (password.trim()) {
      setPassword("");
      setShowPassword(false);
    }
    close();
    router.refresh();
  }

  async function onToggle() {
    if (!user) return;
    const next = !user.isActive;
    if (!window.confirm(next ? "Aktifkan kembali pengguna ini?" : "Nonaktifkan pengguna ini? Ia tidak bisa login sampai diaktifkan kembali.")) {
      return;
    }
    setToggling(true);
    const result = await toggleUserAction({ id: user.id, isActive: next });
    setToggling(false);
    if (!result.ok) {
      toast.error(result.error?.message ?? "Gagal mengubah status pengguna.");
      return;
    }
    toast.success(next ? "Pengguna diaktifkan." : "Pengguna dinonaktifkan.");
    close();
    router.refresh();
  }

  return (
    <>
      {mode === "create" ? (
        <Button size="sm" className="h-11" onClick={() => setOpen(true)}>
          <UserPlus className="size-4" aria-hidden /> Tambah Pengguna
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${user?.fullName}`}
          className={
            className ??
            "inline-flex h-9 items-center gap-1 rounded-sm border border-border px-2.5 text-xs font-semibold hover:bg-surface-muted"
          }
        >
          <Pencil className="size-3.5" aria-hidden /> Edit
        </button>
      )}

      <Modal
        open={open}
        onClose={close}
        title={mode === "create" ? "Tambah pengguna" : "Edit pengguna"}
        description={
          mode === "create"
            ? "Buat akun pengguna baru dengan password awal yang bisa langsung dipakai login."
            : "Perubahan role berlaku pada payout berikutnya; payout lama tidak berubah."
        }
        size="md"
        footer={
          <>
            {user && mode === "edit" ? (
              <Button
                type="button"
                variant={user.isActive ? "danger" : "success"}
                onClick={onToggle}
                loading={toggling}
                className="mr-auto"
              >
                <Power className="size-4" aria-hidden />
                {user.isActive ? "Nonaktifkan" : "Aktifkan"}
              </Button>
            ) : null}
            <Button variant="outline" type="button" onClick={close}>
              Batal
            </Button>
            <Button type="submit" form="user-form" loading={loading}>
              {mode === "create" ? "Tambah Pengguna" : "Simpan Perubahan"}
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={onSubmit} className="space-y-3">
          {error ? <Alert tone="error">{error}</Alert> : null}
          {mode === "create" ? (
            <>
              <div>
                <Label htmlFor="user-email" required>
                  Email
                </Label>
                <Input
                  id="user-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nama@peppycell.id"
                  aria-invalid={Boolean(fieldErrors.email)}
                  required
                />
                {fieldErrors.email ? <FieldError>{fieldErrors.email[0]}</FieldError> : null}
              </div>
              <div>
                <Label htmlFor="user-password" required>
                  Password awal
                </Label>
                <div className="relative">
                  <Input
                    id="user-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Minimal 8 karakter"
                    className="pr-12"
                    minLength={8}
                    aria-invalid={Boolean(fieldErrors.password)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                    className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-sm text-foreground-muted hover:bg-surface-muted"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden />
                    ) : (
                      <Eye className="size-4" aria-hidden />
                    )}
                  </button>
                </div>
                <FieldHint>Berikan password ini ke pengguna. Password bisa diubah setelah login.</FieldHint>
                {fieldErrors.password ? <FieldError>{fieldErrors.password[0]}</FieldError> : null}
              </div>
            </>
          ) : (
            <div>
              <Label>Email</Label>
              <p className="flex h-12 items-center rounded-sm border border-input bg-surface-muted px-3 text-sm text-foreground-muted">
                {user?.email}
              </p>
              <FieldHint>Email tidak dapat diubah sendiri; hubungi Admin lain.</FieldHint>
            </div>
          )}

          <div>
            <Label htmlFor="user-name" required>
              Nama lengkap
            </Label>
            <Input
              id="user-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              maxLength={60}
              placeholder="Nama sesuai absensi"
              aria-invalid={Boolean(fieldErrors.fullName)}
              required
            />
            {fieldErrors.fullName ? <FieldError>{fieldErrors.fullName[0]}</FieldError> : null}
          </div>

          <div>
            <Label htmlFor="user-role" required>
              Role
            </Label>
            <Select
              id="user-role"
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <FieldHint>{roleOptions.find((option) => option.value === role)?.description}</FieldHint>
          </div>

          <div>
            <Label htmlFor="user-share" required>
              Porsi bagi hasil default
            </Label>
            <div className="relative">
              <Input
                id="user-share"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                value={defaultProfitShare}
                onChange={(event) =>
                  setDefaultProfitShare(Math.max(0, Math.min(100, Number(event.target.value) || 0)))
                }
                className="pr-9 text-right"
                aria-invalid={Boolean(fieldErrors.defaultProfitShare)}
                required
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-foreground-muted">
                %
              </span>
            </div>
            <FieldHint>
              Porsi dihitung relatif terhadap total porsi role yang sama, bukan persentase laba
              total. Contoh: dua investor 60% dan 40% membagi pool investor.
            </FieldHint>
            {fieldErrors.defaultProfitShare ? (
              <FieldError>{fieldErrors.defaultProfitShare[0]}</FieldError>
            ) : null}
          </div>

          {mode === "edit" ? (
            <div>
              <Label htmlFor="user-new-password">Password baru</Label>
              <div className="relative">
                <Input
                  id="user-new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Kosongkan jika tidak diubah"
                  className="pr-12"
                  minLength={password ? 8 : undefined}
                  aria-invalid={Boolean(fieldErrors.password)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-sm text-foreground-muted hover:bg-surface-muted"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </div>
              <FieldHint>
                Isi untuk mengganti password pengguna. Minimal 8 karakter. Kosongkan jika tidak
                ingin mengubah.
              </FieldHint>
              {fieldErrors.password ? <FieldError>{fieldErrors.password[0]}</FieldError> : null}
            </div>
          ) : null}

          {mode === "edit" ? (
            <label className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-sm border border-border p-3">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                className="mt-0.5 size-4 rounded border-input accent-primary"
              />
              <span>
                <span className="text-sm font-medium">Akun aktif</span>
                <span className="mt-0.5 block text-[11px] text-foreground-muted">
                  Akun nonaktif tidak dapat login dan tidak menerima payout baru.
                </span>
              </span>
            </label>
          ) : (
            <Alert tone="info" title="Akun langsung aktif">
              Pengguna bisa login memakai email dan password awal ini. Minta pengguna mengganti
              password setelah login pertama.
            </Alert>
          )}
        </form>
      </Modal>
    </>
  );
}
