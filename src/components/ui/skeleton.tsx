import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse-soft rounded-sm bg-surface-muted", className)} />;
}

export function Shimmer({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-shimmer rounded-md", className)} />;
}

export function MoneySkeleton({ className }: { className?: string }) {
  return <Shimmer className={cn("h-7 w-32", className)} />;
}
