import { cn } from "@/lib/utils";

export function Progress({
  value,
  max = 100,
  label,
  className,
  tone = "primary",
}: {
  value: number;
  max?: number;
  label?: string;
  className?: string;
  tone?: "primary" | "success" | "warning" | "error";
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  const toneClass =
    tone === "success"
      ? "bg-success-text"
      : tone === "warning"
        ? "bg-warning-text"
        : tone === "error"
          ? "bg-error-text"
          : "bg-primary";
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-muted", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", toneClass)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
