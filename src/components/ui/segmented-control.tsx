"use client";

import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  count?: number;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex w-full max-w-full items-center gap-1 overflow-x-auto rounded-sm bg-surface-muted p-1 sm:w-auto",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] px-3 text-xs font-semibold transition-all sm:flex-none",
              active
                ? "bg-surface text-foreground shadow-card"
                : "text-foreground-muted hover:text-foreground",
            )}
          >
            {opt.label}
            {typeof opt.count === "number" ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px]",
                  active ? "bg-primary-soft text-primary" : "bg-surface text-foreground-muted",
                )}
              >
                {opt.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
