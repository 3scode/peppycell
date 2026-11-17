import Link from "next/link";
import {
  Bell,
  ChevronRight,
  KeyRound,
  LayoutGrid,
  Palette,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { RoleBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { AvatarUploader } from "@/components/settings/avatar-uploader";
import { ProfileDialog } from "@/components/settings/profile-dialog";
import { PasswordDialog } from "@/components/settings/password-dialog";
import { ThemePreference } from "@/components/settings/theme-preference";
import { NotificationPreference } from "@/components/settings/notification-preference";
import { LogoutAllCard } from "@/components/settings/logout-all-card";

export const metadata = { title: "Profil & Pengaturan" };

const roleLabel: Record<string, string> = {
  admin: "Admin",
  karyawan: "Karyawan",
  investor: "Investor",
};

const sections = [
  { id: "akun", label: "Akun", icon: UserRound },
  { id: "keamanan", label: "Keamanan", icon: ShieldCheck },
  { id: "tampilan", label: "Tampilan", icon: Palette },
  { id: "notifikasi", label: "Notifikasi", icon: Bell },
];

function SectionCard({
  id,
  title,
  description,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: typeof UserRound;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <Card className="overflow-hidden">
        <div className="flex items-start gap-3 border-b border-border p-4 sm:p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon className="size-4" aria-hidden />
          </span>
          <div>
            <h2 id={`${id}-title`} className="text-base font-semibold">
              {title}
            </h2>
            <p className="mt-0.5 text-xs text-foreground-muted">{description}</p>
          </div>
        </div>
        <div className="space-y-3 p-4 sm:p-5">{children}</div>
      </Card>
    </section>
  );
}

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/settings");

  const isAdmin = user.role === "admin";

  return (
    <div className="mx-auto max-w-[880px]">
      <PageHeader
        title="Profil & Pengaturan"
        description="Kelola profil, keamanan akun, tema, dan preferensi notifikasi."
      />

      <div className="grid gap-4 lg:grid-cols-12">
        <aside className="hidden lg:col-span-3 lg:block">
          <nav
            aria-label="Navigasi pengaturan"
            className="sticky top-24 space-y-1 rounded-md border border-border bg-surface p-2 shadow-card"
          >
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="flex h-10 items-center gap-2 rounded-sm px-2.5 text-xs font-semibold text-foreground-muted hover:bg-surface-muted hover:text-foreground"
                >
                  <Icon className="size-4" aria-hidden /> {section.label}
                  <ChevronRight className="ml-auto size-3.5" aria-hidden />
                </a>
              );
            })}
            {isAdmin ? (
              <Link
                href="/users"
                className="flex h-10 items-center gap-2 rounded-sm px-2.5 text-xs font-semibold text-primary hover:bg-primary-soft"
              >
                <LayoutGrid className="size-4" aria-hidden /> Kelola Pengguna
              </Link>
            ) : null}
          </nav>
        </aside>

        <div className="space-y-4 lg:col-span-9">
          <Card className="p-4 sm:p-5">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <AvatarUploader user={user} />
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <h2 className="truncate text-lg font-bold">{user.fullName}</h2>
                <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                  <RoleBadge role={user.role} />
                  <span className="text-xs text-foreground-muted">{user.email}</span>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-foreground-muted">
                  {user.role === "admin"
                    ? "Akses penuh: transaksi, wallet, laba, pengguna, dan payout."
                    : user.role === "karyawan"
                      ? "Mencatat penjualan dan pengeluaran. Modal, margin, dan aset tidak ditampilkan."
                      : "Akses read-only: laba agregat dan deviden milik Anda."}
                </p>
              </div>
            </div>
          </Card>

          <SectionCard
            id="akun"
            title="Akun"
            description="Nama dan email yang dipakai di seluruh aplikasi."
            icon={UserRound}
          >
            <div className="divide-y divide-border rounded-sm border border-border">
              <div className="flex min-h-14 items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] text-foreground-muted">Nama lengkap</p>
                  <p className="truncate text-sm font-medium">{user.fullName}</p>
                </div>
                <ProfileDialog user={user} />
              </div>
              <div className="flex min-h-14 items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] text-foreground-muted">Email</p>
                  <p className="truncate text-sm font-medium">{user.email}</p>
                </div>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
                  Read-only
                </span>
              </div>
              <div className="flex min-h-14 items-center justify-between gap-3 px-3.5 py-2.5">
                <div>
                  <p className="text-[11px] text-foreground-muted">Role</p>
                  <p className="text-sm font-medium">{roleLabel[user.role]}</p>
                </div>
                <RoleBadge role={user.role} />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="keamanan"
            title="Keamanan"
            description="Perbarui password dan cabut sesi yang tidak dikenal."
            icon={ShieldCheck}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border p-3">
              <div>
                <p className="text-sm font-medium">Password</p>
                <p className="text-[11px] text-foreground-muted">
                  Dikelola oleh Supabase Auth.
                </p>
              </div>
              <PasswordDialog />
            </div>
            <LogoutAllCard />
          </SectionCard>

          <SectionCard
            id="tampilan"
            title="Tampilan"
            description="Tema berlaku langsung dan tersimpan di profil."
            icon={Palette}
          >
            <ThemePreference initialTheme={user.theme} />
          </SectionCard>

          <SectionCard
            id="notifikasi"
            title="Notifikasi"
            description="Atur pengingat operasional mingguan."
            icon={Bell}
          >
            <NotificationPreference initialEnabled={user.notificationPayout} />
            <Alert tone="info">
              Notifikasi hanya berupa banner di dalam aplikasi. Email/push belum diaktifkan pada
              versi ini.
            </Alert>
          </SectionCard>

          <div className="rounded-sm border border-dashed border-border p-3 text-[11px] leading-5 text-foreground-muted">
            <KeyRound className="mr-1 inline size-3.5" aria-hidden />
            PeppyCell tidak pernah menampilkan password. Jika akun Anda tidak bisa diakses, hubungi
            Admin untuk reset melalui Supabase Auth.
          </div>
        </div>
      </div>
    </div>
  );
}
