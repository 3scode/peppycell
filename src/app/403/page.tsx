import Link from "next/link";
import { ShieldX } from "lucide-react";

export const metadata = { title: "Akses Ditolak" };

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-error-soft text-error-text">
          <ShieldX className="size-8" aria-hidden />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-error-text">403 · Akses ditolak</p>
        <h1 className="mt-2 text-xl font-bold tracking-tight">Halaman ini tidak tersedia untuk role Anda.</h1>
        <p className="mt-2 text-sm leading-6 text-foreground-muted">
          Data keuangan seperti wallet, margin, dan pengguna hanya dapat diakses Admin.
          Jika Anda merasa ini keliru, hubungi Admin konter.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-sm bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    </main>
  );
}
