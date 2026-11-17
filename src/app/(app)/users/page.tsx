import Link from "next/link";
import { RotateCcw, Search, Users } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { listUsers } from "@/lib/data/repository";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { UserFormDialog } from "@/components/users/user-form-dialog";
import { UserTable } from "@/components/users/user-table";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pengguna" };

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function filterHref(q: string | undefined, role: string | undefined) {
  const search = new URLSearchParams();
  if (q) search.set("q", q);
  if (role) search.set("role", role);
  const qs = search.toString();
  return qs ? `/users?${qs}` : "/users";
}

const roleTabs = [
  { value: "all", label: "Semua" },
  { value: "admin", label: "Admin" },
  { value: "karyawan", label: "Karyawan" },
  { value: "investor", label: "Investor" },
];

export default async function UsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireRole("admin");
  const params = await searchParams;
  const q = one(params.q)?.trim().toLowerCase();
  const role = one(params.role);

  const all = (await listUsers(user)).filter((item) => !item.deletedAt);
  const users = all.filter((item) => {
    if (role && role !== "all" && item.role !== role) return false;
    if (!q) return true;
    return (
      item.fullName.toLowerCase().includes(q) || item.email.toLowerCase().includes(q)
    );
  });

  const activeCount = all.filter((item) => item.isActive).length;
  const adminCount = all.filter((item) => item.role === "admin").length;
  const activeAdmins = all.filter((item) => item.role === "admin" && item.isActive);
  const protectedIds = Array.from(
    new Set([
      user.id,
      ...(activeAdmins.length <= 1 ? activeAdmins.map((item) => item.id) : []),
    ]),
  );

  return (
    <div>
      <PageHeader
        title="Pengguna"
        description="Kelola akses, role, dan porsi bagi hasil default tiap orang."
        actions={<UserFormDialog />}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Total pengguna"
          value={`${all.length} akun`}
          icon={<Users className="size-5" />}
          hint="Termasuk akun nonaktif"
        />
        <MetricCard label="Aktif" value={`${activeCount} akun`} hint="Bisa login dan menerima payout" />
        <MetricCard label="Admin" value={`${adminCount} akun`} hint="Akses penuh" />
      </div>

      <div className="mb-3 flex w-full items-center gap-1 overflow-x-auto rounded-sm bg-surface-muted p-1 sm:w-auto">
        {roleTabs.map((tab) => {
          const active = (role ?? "all") === tab.value || (tab.value === "all" && !role);
          return (
            <Link
              key={tab.value}
              href={filterHref(q, tab.value === "all" ? undefined : tab.value)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-[6px] px-3 text-xs font-semibold sm:flex-none",
                active
                  ? "bg-surface text-foreground shadow-card"
                  : "text-foreground-muted hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <form
        action="/users"
        method="get"
        className="mb-4 flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface p-2.5 shadow-card"
      >
        {role ? <input type="hidden" name="role" value={role} /> : null}
        <div className="min-w-[200px] flex-[2]">
          <label htmlFor="q" className="mb-1 block text-[11px] font-semibold text-foreground-muted">
            Cari pengguna
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
              aria-hidden
            />
            <Input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="Nama atau email…"
              className="h-10 pl-9"
            />
          </div>
        </div>
        <Button type="submit" size="sm" className="h-10">
          Cari
        </Button>
        <Link
          href="/users"
          className="inline-flex h-10 items-center gap-1 rounded-sm px-2 text-xs font-semibold text-foreground-muted hover:text-foreground"
        >
          <RotateCcw className="size-3.5" aria-hidden /> Reset
        </Link>
      </form>

      {users.length === 0 ? (
        <EmptyState
          icon={<Users className="size-7" />}
          title={q || role ? "Tidak ada pengguna yang cocok" : "Baru ada Anda di sini"}
          description={
            q || role
              ? "Coba kata kunci lain atau hapus filter role."
              : "Tambah karyawan untuk mencatat transaksi atau investor untuk melihat laporan."
          }
          action={
            q || role ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/users">Reset filter</Link>
              </Button>
            ) : (
              <UserFormDialog />
            )
          }
        />
      ) : (
        <UserTable
          key={`${q ?? ""}-${role ?? "all"}`}
          users={users}
          currentUserId={user.id}
          protectedIds={protectedIds}
        />
      )}

      <div className="mt-4 rounded-sm border border-dashed border-border p-3 text-[11px] leading-5 text-foreground-muted">
        Porsi bagi hasil menentukan pembagian di dalam pool role, bukan persentase laba total.
        Mengubah porsi tidak mengubah payout yang sudah selesai. Role Admin terakhir tidak dapat
        diturunkan atau dinonaktifkan.
      </div>
    </div>
  );
}
