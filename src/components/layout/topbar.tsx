"use client";

import Link from "next/link";
import { HandCoins } from "lucide-react";
import type { SessionUser } from "@/types/domain";
import { pageTitle } from "@/components/layout/navigation";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";

export function Topbar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 h-14 border-b border-border bg-background/90 backdrop-blur md:h-16 md:bg-surface/90">
      <div className="flex h-full items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
            <span className="flex size-8 items-center justify-center rounded-sm bg-primary text-primary-foreground">
              <HandCoins className="size-4" aria-hidden />
            </span>
            <span className="text-sm font-bold">PeppyCell</span>
          </Link>
          <div className="hidden min-w-0 md:block">
            <p className="truncate text-sm font-semibold text-foreground">{pageTitle(pathname)}</p>
            <p className="text-[11px] text-foreground-muted">
              {user.role === "admin"
                ? "Akses penuh · Admin"
                : user.role === "karyawan"
                  ? "Akses kasir · Karyawan"
                  : "Akses read-only · Investor"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle compact />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
