import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/money";

type MoneyTone = "default" | "income" | "expense" | "transfer" | "payout" | "muted" | "success" | "warning";

const toneClass: Record<MoneyTone, string> = {
  default: "text-foreground",
  income: "text-success-text",
  expense: "text-error-text",
  transfer: "text-foreground",
  payout: "text-payout-text",
  muted: "text-foreground-muted",
  success: "text-success-text",
  warning: "text-warning-text",
};

export function MoneyText({
  value,
  tone = "default",
  signed = false,
  compact = false,
  className,
  size = "md",
}: {
  value: number;
  tone?: MoneyTone;
  signed?: boolean;
  compact?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg" | "display";
}) {
  const sizeClass =
    size === "display"
      ? "text-[26px] leading-[34px] font-bold sm:text-[28px] sm:leading-9"
      : size === "lg"
        ? "text-xl font-bold leading-7"
        : size === "sm"
          ? "text-xs font-semibold"
          : "text-sm font-semibold";

  const sign = signed ? (value > 0 ? "+" : value < 0 ? "−" : "") : value < 0 ? "−" : "";
  const formatted = formatRupiah(Math.abs(value), { compact });

  return (
    <span
      className={cn("money whitespace-nowrap", sizeClass, toneClass[tone], className)}
      aria-label={`${value < 0 ? "minus " : ""}${formatRupiah(Math.abs(value))}`}
    >
      {sign}
      {formatted}
    </span>
  );
}
