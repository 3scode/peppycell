import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DataTableHeadCell = ReactNode | { content: ReactNode; className?: string };

function isHeadCellObject(cell: DataTableHeadCell): cell is { content: ReactNode; className?: string } {
  return (
    typeof cell === "object" &&
    cell !== null &&
    "content" in cell &&
    !("$$typeof" in cell)
  );
}

export function DataTable({
  head,
  children,
  className,
  caption,
  dense = false,
}: {
  head: DataTableHeadCell[];
  children: ReactNode;
  className?: string;
  caption?: string;
  dense?: boolean;
}) {
  return (
    <div
      className={cn(
        "scrollbar-thin w-full overflow-x-auto rounded-md border border-border bg-surface",
        dense && "[&_td]:px-2.5 [&_th]:px-2.5",
        className,
      )}
    >
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-border bg-surface-muted/60">
            {head.map((cell, index) => {
              const custom = isHeadCellObject(cell);
              return (
                <th
                  key={index}
                  scope="col"
                  className={cn(
                    "whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted",
                    custom && cell.className,
                  )}
                >
                  {custom ? cell.content : cell}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  className,
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cn("px-4 py-3 align-middle text-sm text-foreground", className)}>
      {children}
    </td>
  );
}

export function ListRow({
  title,
  subtitle,
  meta,
  trailing,
  icon,
  href,
  status,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  icon?: ReactNode;
  href?: string;
  status?: ReactNode;
  className?: string;
}) {
  const content = (
    <>
      {icon ? (
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-foreground-muted"
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          {status}
        </div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-xs text-foreground-muted">{subtitle}</div>
        ) : null}
        {meta ? <div className="mt-1 text-[11px] text-foreground-muted">{meta}</div> : null}
      </div>
      {trailing ? <div className="shrink-0 text-right">{trailing}</div> : null}
    </>
  );

  const base =
    "flex min-h-[64px] items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 shadow-card transition-colors";

  if (href) {
    return (
      <a href={href} className={cn(base, "hover:bg-surface-muted/60", className)}>
        {content}
      </a>
    );
  }
  return <div className={cn(base, className)}>{content}</div>;
}
