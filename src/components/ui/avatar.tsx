import { cn } from "@/lib/utils";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

const colors = [
  "bg-primary-soft text-primary",
  "bg-success-soft text-success-text",
  "bg-transfer-soft text-transfer-text",
  "bg-payout-soft text-payout-text",
  "bg-warning-soft text-warning-text",
];

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizeClass =
    size === "sm"
      ? "size-8 text-[11px]"
      : size === "lg"
        ? "size-14 text-lg"
        : size === "xl"
          ? "size-20 text-2xl"
          : "size-10 text-sm";
  const color = colors[(name.charCodeAt(0) || 0) % colors.length];

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`Avatar ${name}`}
        className={cn("shrink-0 rounded-full border border-border object-cover", sizeClass, className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        color,
        sizeClass,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
