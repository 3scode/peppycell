import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  backHref,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  backHref?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-5 sm:mb-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {backHref ? (
            <a
              href={backHref}
              className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-foreground-muted hover:text-foreground"
            >
              <span aria-hidden>←</span> Kembali
            </a>
          ) : null}
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-[22px] font-bold leading-[30px] tracking-[-0.02em] text-foreground sm:text-2xl sm:leading-8">
            {title}
          </h1>
          {description ? (
            <div className="mt-1 text-sm text-foreground-muted">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </header>
  );
}
