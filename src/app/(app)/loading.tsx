import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback global untuk semua halaman di group (app).
 * Tujuan utamanya: memberi umpan balik instan begitu link diklik, karena
 * halaman-halaman di sini dynamic (butuh query Supabase) dan tanpa boundary
 * ini navigasi akan terasa "beku" sampai server selesai render.
 */
export default function AppLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <span className="sr-only" role="status">
        Memuat halaman…
      </span>

      <div className="space-y-2.5">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-md border border-border bg-surface p-4 shadow-card"
          >
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-3 h-7 w-32" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>

      <div className="rounded-md border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 p-4">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/5 max-w-56" />
                <Skeleton className="h-3 w-1/4 max-w-32" />
              </div>
              <Skeleton className="h-4 w-20 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
