"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, Plus } from "lucide-react";
import type { SessionUser } from "@/types/domain";
import { cn } from "@/lib/utils";
import { MORE_NAV_BY_ROLE, MOBILE_NAV_BY_ROLE } from "@/components/layout/navigation";
import { LinkPending } from "@/components/layout/link-pending";
import { Modal } from "@/components/ui/modal";

export function BottomNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const items = MOBILE_NAV_BY_ROLE[user.role];
  const moreItems = MORE_NAV_BY_ROLE[user.role];
  const canRecord = user.role === "admin" || user.role === "karyawan";

  const renderItem = (href: string, label: string, Icon: typeof MoreHorizontal, shortLabel?: string) => {
    const active =
      pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-sm px-1 text-[10px] font-medium",
          active ? "text-primary" : "text-foreground-muted",
        )}
      >
        <LinkPending />
        <Icon className="size-5" aria-hidden />
        <span className="truncate">{shortLabel ?? label}</span>
      </Link>
    );
  };

  return (
    <>
      <nav
        aria-label="Navigasi bawah"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden"
      >
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center px-1">
          {items.slice(0, 2).map((item) => renderItem(item.href, item.label, item.icon, item.shortLabel))}
          <div className="flex items-center justify-center">
            {canRecord ? (
              <Link
                href="/transactions/new?type=sale"
                aria-label="Catat penjualan"
                className="relative -mt-5 flex size-14 items-center justify-center overflow-hidden rounded-full bg-primary text-primary-foreground shadow-overlay transition-transform active:scale-95"
              >
                <LinkPending className="bg-primary-foreground/20" />
                <Plus className="size-6" aria-hidden />
              </Link>
            ) : (
              <span className="text-[10px] text-foreground-muted">PeppyCell</span>
            )}
          </div>
          {items.slice(2).map((item) => renderItem(item.href, item.label, item.icon, item.shortLabel))}
          {moreItems.length > 0 ? (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-sm px-1 text-[10px] font-medium text-foreground-muted"
            >
              <MoreHorizontal className="size-5" aria-hidden />
              <span>Lainnya</span>
            </button>
          ) : null}
        </div>
      </nav>

      <Modal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="Menu lainnya"
        description="Akses cepat menu lainnya."
        size="sm"
      >
        <div className="grid gap-1.5">
          {moreItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="relative flex min-h-12 items-center gap-3 overflow-hidden rounded-sm px-3 text-sm font-medium hover:bg-surface-muted"
              >
                <LinkPending />
                <Icon className="size-5 text-foreground-muted" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
