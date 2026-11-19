"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/**
 * Indikator halus di dalam <Link> yang menyala selama navigasi masih diproses.
 * Dipakai pada menu sidebar/bottom-nav supaya klik langsung terasa direspon,
 * meskipun server masih menyiapkan halaman tujuan.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      data-pending={pending ? "" : undefined}
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit] bg-primary/10 opacity-0 transition-opacity duration-150",
        "data-[pending]:animate-pulse-soft data-[pending]:opacity-100",
        className,
      )}
    />
  );
}
