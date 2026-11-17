import { redirect } from "next/navigation";
import { HandCoins, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export const metadata = { title: "Masuk" };

const perks = [
  { icon: ShieldCheck, text: "Role-safe — modal & margin tidak terlihat karyawan" },
  { icon: Sparkles, text: "Bagi hasil mingguan satu klik, transparan per penerima" },
  { icon: Wallet, text: "Kas, rekening, dan saldo digital terpantau dalam satu tempat" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  const { next } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col bg-background lg:grid lg:grid-cols-[44%_56%]">
      <section className="relative hidden overflow-hidden bg-primary-soft p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div aria-hidden className="absolute inset-0 bg-grid-pattern opacity-60" />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-card">
              <HandCoins className="size-5" aria-hidden />
            </span>
            <span className="text-lg font-bold tracking-tight text-foreground">PeppyCell</span>
          </div>
          <h1 className="mt-12 max-w-md text-3xl font-bold leading-tight tracking-[-0.03em] text-foreground xl:text-4xl">
            Laba mingguan rapi, modal tetap aman.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-foreground-muted">
            Control room keuangan untuk konter pulsa & kuota. Catat penjualan cepat,
            pantau aset, dan bagi hasil tanpa spreadsheet.
          </p>
          <ul className="mt-8 space-y-3">
            {perks.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-2.5 text-sm text-foreground">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-primary shadow-card">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-foreground-muted">
          © {new Date().getFullYear()} PeppyCell · Zona waktu Asia/Jakarta (WIB)
        </p>
      </section>

      <section className="flex flex-1 flex-col">
        <header className="flex items-center justify-between p-4 sm:p-6 lg:justify-end">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-sm bg-primary text-primary-foreground">
              <HandCoins className="size-4" aria-hidden />
            </span>
            <span className="text-base font-bold">PeppyCell</span>
          </div>
          <ThemeToggle compact />
        </header>

        <div className="flex flex-1 items-center justify-center px-5 pb-10 sm:px-8">
          <div className="w-full max-w-[400px]">
            <div className="mb-6 lg:hidden">
              <h1 className="text-[22px] font-bold leading-[30px] tracking-[-0.02em]">
                Masuk ke control room keuangan konter Anda.
              </h1>
              <p className="mt-1 text-sm text-foreground-muted">
                Gunakan email kantor yang diberikan Admin.
              </p>
            </div>
            <div className="hidden lg:block">
              <h2 className="text-2xl font-bold tracking-[-0.02em]">Masuk</h2>
              <p className="mb-6 mt-1 text-sm text-foreground-muted">
                Gunakan email kantor yang diberikan Admin.
              </p>
            </div>
            <LoginForm next={next} />
            <div className="mt-8 rounded-md border border-border bg-surface p-3 text-center text-[11px] leading-5 text-foreground-muted lg:hidden">
              PeppyCell membantu Admin, Karyawan, dan Investor bekerja dari satu sumber data yang sama.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
