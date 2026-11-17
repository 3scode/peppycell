"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-error-soft text-error-text">
          <span aria-hidden className="text-xl font-bold">!</span>
        </div>
        <h1 className="text-lg font-bold">Terjadi kesalahan saat memuat halaman.</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Data Anda tidak berubah. Coba muat ulang; jika masih gagal, hubungi Admin.
        </p>
        {error.digest ? (
          <p className="mt-2 text-[11px] text-foreground-muted">Kode: {error.digest}</p>
        ) : null}
        <Button onClick={reset} className="mt-5">
          <RefreshCw className="size-4" aria-hidden /> Coba Lagi
        </Button>
      </div>
    </main>
  );
}
