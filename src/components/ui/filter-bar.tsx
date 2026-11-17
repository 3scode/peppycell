import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2.5 shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FilterChip({
  active,
  children,
  onClick,
  type = "button",
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-full border px-3 text-xs font-semibold transition-colors",
        active
          ? "border-primary/30 bg-primary-soft text-primary"
          : "border-border bg-surface text-foreground-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
