import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageSizeSelect } from "@/components/ui/page-size-select";
import { cn } from "@/lib/utils";

function buildHref(base: string, params: Record<string, string | undefined>, page: number) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  search.set("page", String(page));
  return `${base}?${search.toString()}`;
}

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  basePath,
  params = {},
  pageSizeOptions,
  pageSizeParam = "limit",
  className,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  basePath: string;
  params?: Record<string, string | undefined>;
  /** Tampilkan selector jumlah baris per halaman bila diisi. */
  pageSizeOptions?: readonly number[];
  pageSizeParam?: string;
  className?: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 pt-4", className)}>
      <p className="text-xs text-foreground-muted">
        Menampilkan {from}–{to} dari {total}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {pageSizeOptions && pageSizeOptions.length > 0 ? (
          <label className="mr-1 flex items-center gap-1.5 text-xs text-foreground-muted">
            Tampilkan
            <PageSizeSelect
              value={limit}
              options={pageSizeOptions}
              basePath={basePath}
              params={params}
              param={pageSizeParam}
            />
            per halaman
          </label>
        ) : null}
        <Link
          href={buildHref(basePath, params, Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          className={cn(
            "inline-flex h-9 items-center gap-1 rounded-sm border border-border px-3 text-xs font-semibold",
            page <= 1
              ? "pointer-events-none opacity-40"
              : "hover:bg-surface-muted",
          )}
        >
          <ChevronLeft className="size-4" aria-hidden /> Sebelumnya
        </Link>
        <span className="text-xs text-foreground-muted">
          {page} / {totalPages}
        </span>
        <Link
          href={buildHref(basePath, params, Math.min(totalPages, page + 1))}
          aria-disabled={page >= totalPages}
          className={cn(
            "inline-flex h-9 items-center gap-1 rounded-sm border border-border px-3 text-xs font-semibold",
            page >= totalPages
              ? "pointer-events-none opacity-40"
              : "hover:bg-surface-muted",
          )}
        >
          Berikutnya <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
