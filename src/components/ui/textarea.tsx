import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[88px] w-full resize-y rounded-sm border border-input bg-surface px-3 py-2.5 text-sm text-foreground shadow-sm transition-colors placeholder:text-foreground-muted focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary/25 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-error",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
