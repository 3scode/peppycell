import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-12 w-full rounded-sm border border-input bg-surface px-3 text-sm text-foreground shadow-sm transition-colors placeholder:text-foreground-muted focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary/25 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-error aria-invalid:outline-error/20",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
