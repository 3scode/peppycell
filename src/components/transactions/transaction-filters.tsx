"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface FilterValues {
  from: string;
  to: string;
  walletId: string;
  userId: string;
  q: string;
}

export function TransactionFilters({
  type,
  from,
  to,
  walletId,
  userId,
  q,
  wallets,
  users,
  showWallet,
  showUser,
}: {
  type?: string;
  from?: string;
  to?: string;
  walletId?: string;
  userId?: string;
  q?: string;
  wallets: { id: string; nama: string }[];
  users: { id: string; fullName: string }[];
  showWallet: boolean;
  showUser: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<FilterValues>({
    from: from ?? "",
    to: to ?? "",
    walletId: walletId ?? "",
    userId: userId ?? "",
    q: q ?? "",
  });
  const [previousProps, setPreviousProps] = useState({ from, to, walletId, userId, q });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  if (
    previousProps.from !== from ||
    previousProps.to !== to ||
    previousProps.walletId !== walletId ||
    previousProps.userId !== userId ||
    previousProps.q !== q
  ) {
    setPreviousProps({ from, to, walletId, userId, q });
    setValues({
      from: from ?? "",
      to: to ?? "",
      walletId: walletId ?? "",
      userId: userId ?? "",
      q: q ?? "",
    });
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function urlFor(next: FilterValues): string {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    if (next.walletId) params.set("walletId", next.walletId);
    if (next.userId) params.set("userId", next.userId);
    if (next.q) params.set("q", next.q);
    const query = params.toString();
    return query ? `/transactions?${query}` : "/transactions";
  }

  function navigate(next: FilterValues) {
    clearTimeout(timer.current);
    startTransition(() => router.replace(urlFor(next), { scroll: false }));
  }

  function change(patch: Partial<FilterValues>, debounce = false) {
    const next = { ...values, ...patch };
    setValues(next);
    clearTimeout(timer.current);
    if (debounce) {
      timer.current = setTimeout(() => navigate(next), 400);
    } else {
      navigate(next);
    }
  }

  return (
    <FilterBar className="mb-4">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          navigate(values);
        }}
        className="flex w-full flex-wrap items-end gap-2"
      >
        {type ? <input type="hidden" name="type" value={type} /> : null}
        <div className="min-w-[132px] flex-1">
          <label htmlFor="from" className="mb-1 block text-[11px] font-semibold text-foreground-muted">Dari</label>
          <Input
            id="from"
            type="date"
            value={values.from}
            onChange={(event) => change({ from: event.target.value })}
            className="h-10"
          />
        </div>
        <div className="min-w-[132px] flex-1">
          <label htmlFor="to" className="mb-1 block text-[11px] font-semibold text-foreground-muted">Sampai</label>
          <Input
            id="to"
            type="date"
            value={values.to}
            onChange={(event) => change({ to: event.target.value })}
            className="h-10"
          />
        </div>
        {showWallet ? (
          <div className="min-w-[140px] flex-1">
            <label htmlFor="walletId" className="mb-1 block text-[11px] font-semibold text-foreground-muted">Wallet</label>
            <Select
              id="walletId"
              value={values.walletId}
              onChange={(event) => change({ walletId: event.target.value })}
              className="h-10"
            >
              <option value="">Semua wallet</option>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>{wallet.nama}</option>
              ))}
            </Select>
          </div>
        ) : null}
        {showUser ? (
          <div className="min-w-[140px] flex-1">
            <label htmlFor="userId" className="mb-1 block text-[11px] font-semibold text-foreground-muted">Dicatat oleh</label>
            <Select
              id="userId"
              value={values.userId}
              onChange={(event) => change({ userId: event.target.value })}
              className="h-10"
            >
              <option value="">Semua user</option>
              {users.map((item) => (
                <option key={item.id} value={item.id}>{item.fullName}</option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="min-w-[160px] flex-[2]">
          <label htmlFor="q" className="mb-1 block text-[11px] font-semibold text-foreground-muted">Cari</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" aria-hidden />
            <Input
              id="q"
              value={values.q}
              onChange={(event) => change({ q: event.target.value }, true)}
              placeholder="Produk / keterangan / user"
              className="h-10 pl-9"
            />
          </div>
        </div>
        <Button type="submit" size="sm" className="h-10" loading={isPending}>
          Terapkan
        </Button>
        <Link
          href="/transactions"
          className="inline-flex h-10 items-center gap-1 rounded-sm px-2 text-xs font-semibold text-foreground-muted hover:text-foreground"
        >
          <RotateCcw className="size-3.5" aria-hidden /> Reset
        </Link>
      </form>
    </FilterBar>
  );
}
