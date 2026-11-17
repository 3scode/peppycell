"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
  className,
  disabled,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "size-4 shrink-0 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
    />
  );
}
