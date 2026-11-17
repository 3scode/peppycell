import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({
  className,
  required,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label
      className={cn("mb-1.5 block text-xs font-semibold text-foreground", className)}
      {...props}
    >
      {children}
      {required ? (
        <span aria-hidden className="ml-0.5 text-error">
          *
        </span>
      ) : null}
    </label>
  );
}

export function FieldHint({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1.5 text-xs text-foreground-muted", className)} {...props} />;
}

export function FieldError({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p role="alert" className={cn("mt-1.5 text-xs font-medium text-error-text", className)} {...props} />;
}
