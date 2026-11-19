"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HandCoins } from "lucide-react";
import type { SessionUser } from "@/types/domain";
import { cn } from "@/lib/utils";
import { NAV_BY_ROLE } from "@/components/layout/navigation";
import { LinkPending } from "@/components/layout/link-pending";

export function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const items = NAV_BY_ROLE[user.role];

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col border-r border-border bg-surface md:flex xl:w-[280px]">
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-4 xl:px-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground">
          <HandCoins className="size-5" aria-hidden />
        </span>
        <div className="hidden xl:block">
          <p className="text-sm font-bold leading-4 tracking-tight">PeppyCell</p>
          <p className="text-[10px] text-foreground-muted">Control room konter</p>
        </div>
      </div>

      <nav aria-label="Navigasi utama" className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={cn(
                "group relative flex min-h-11 items-center gap-3 overflow-hidden rounded-sm px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-primary-soft text-primary"
                  : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
              )}
            >
              <LinkPending />
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className="hidden xl:inline">{item.label}</span>
              {active ? (
                <span aria-hidden className="ml-auto hidden size-1.5 rounded-full bg-primary xl:block" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="hidden border-t border-border p-4 xl:block">
        <p className="text-[11px] font-semibold text-foreground-muted">Zona waktu</p>
        <p className="mt-0.5 text-xs text-foreground">Asia/Jakarta (WIB)</p>
        <p className="mt-2 text-[10px] text-foreground-muted">
          Periode bagi hasil: Senin–Minggu
        </p>
      </div>
    </aside>
  );
}
