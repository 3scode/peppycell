"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

export function PageSizeSelect({
  value,
  options,
  basePath,
  params = {},
  param = "limit",
}: {
  value: number;
  options: readonly number[];
  basePath: string;
  params?: Record<string, string | undefined>;
  param?: string;
}) {
  const router = useRouter();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const search = new URLSearchParams();
    for (const [key, item] of Object.entries(params)) {
      if (!item || key === param || key === "page") continue;
      search.set(key, item);
    }
    search.set(param, event.target.value);
    router.push(`${basePath}?${search.toString()}`);
  }

  return (
    <span className="relative inline-flex items-center">
      <select
        value={value}
        onChange={onChange}
        aria-label="Jumlah baris per halaman"
        className="h-9 appearance-none rounded-sm border border-border bg-surface pl-2.5 pr-7 text-xs font-semibold text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2 size-3.5 text-foreground-muted"
      />
    </span>
  );
}
