"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { parseRupiahInput } from "@/lib/money";

export function MoneyInput({
  value,
  onChange,
  id,
  placeholder = "0",
  className,
  disabled,
  ariaLabel,
  ariaDescribedBy,
  invalid,
}: {
  value: number;
  onChange: (value: number) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  invalid?: boolean;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const display = value > 0 ? new Intl.NumberFormat("id-ID").format(value) : "";

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-foreground-muted">
        Rp
      </span>
      <input
        id={inputId}
        inputMode="numeric"
        autoComplete="off"
        value={display}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel ?? "Nominal dalam rupiah"}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(parseRupiahInput(event.target.value))}
        className={cn(
          "money flex h-12 w-full rounded-sm border border-input bg-surface px-3 pl-10 text-right text-base font-semibold text-foreground shadow-sm transition-colors placeholder:font-normal placeholder:text-foreground-muted focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary/25 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-error",
        )}
      />
    </div>
  );
}
