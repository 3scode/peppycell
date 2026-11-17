"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import type { SessionUser } from "@/types/domain";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge } from "@/components/ui/status-badge";
import { logoutAction } from "@/actions/auth";

export function UserMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu akun ${user.fullName}`}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-surface-muted"
      >
        <Avatar name={user.fullName} src={user.avatarUrl} size="sm" />
        <span className="hidden max-w-[120px] truncate text-xs font-semibold sm:block">
          {user.fullName}
        </span>
        <ChevronDown className="hidden size-3.5 text-foreground-muted sm:block" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="animate-fade-up absolute right-0 top-[calc(100%+8px)] z-40 w-60 rounded-md border border-border bg-surface-elevated p-2 shadow-pop"
        >
          <div className="flex items-center gap-3 rounded-sm p-2">
            <Avatar name={user.fullName} src={user.avatarUrl} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.fullName}</p>
              <p className="truncate text-[11px] text-foreground-muted">{user.email}</p>
              <div className="mt-1">
                <RoleBadge role={user.role} />
              </div>
            </div>
          </div>
          <div className="my-1 h-px bg-border" />
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-2 rounded-sm px-2 text-sm text-foreground hover:bg-surface-muted"
          >
            <Settings className="size-4" aria-hidden /> Profil & Pengaturan
          </Link>
          <Link
            href="/settings#akun"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-2 rounded-sm px-2 text-sm text-foreground hover:bg-surface-muted"
          >
            <UserRound className="size-4" aria-hidden /> Akun Saya
          </Link>
          <div className="my-1 h-px bg-border" />
          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-2 rounded-sm px-2 text-sm text-error-text hover:bg-error-soft"
            >
              <LogOut className="size-4" aria-hidden /> Keluar
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
