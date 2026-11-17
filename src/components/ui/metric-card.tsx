import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MoneyText } from "@/components/ui/money-text";

export function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  signed = false,
  hero = false,
  className,
  action,
}: {
  label: string;
  value: number | string;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "income" | "expense" | "transfer" | "payout" | "muted";
  signed?: boolean;
  hero?: boolean;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-surface p-4 shadow-card sm:p-5",
        hero && "rounded-lg border-primary/20 bg-gradient-to-br from-primary-soft/70 to-surface p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
          {label}
        </p>
        {icon ? (
          <span
            aria-hidden
            className={cn(
              "flex size-9 items-center justify-center rounded-full bg-surface-muted text-foreground-muted",
              hero && "bg-primary/10 text-primary",
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {typeof value === "number" ? (
          <MoneyText
            value={value}
            tone={tone}
            signed={signed}
            size={hero ? "display" : "lg"}
            className={hero ? "text-foreground" : undefined}
          />
        ) : (
          <p
            className={cn(
              "money font-bold text-foreground",
              hero ? "text-[26px] leading-[34px] sm:text-[28px]" : "text-xl leading-7",
            )}
          >
            {value}
          </p>
        )}
      </div>
      {hint ? <div className="mt-1 text-xs text-foreground-muted">{hint}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
