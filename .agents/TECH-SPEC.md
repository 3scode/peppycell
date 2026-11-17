# TECH-SPEC.md — PeppyCell Web System

> **Versi:** 1.0 · **Tanggal:** 10 Nov 2026 · **Status:** Draft untuk review
> **Sumber:** [`prd.md`](../prd.md) · [`DESIGN.md`](./DESIGN.md) · Skill: write-tech-spec
> **Platform:** Web mobile-first · **Stack:** Next.js 16 + Supabase + Vercel
> **Design references:** Tidak digunakan (keputusan user; tanpa Google Stitch)

---

## Ringkasan Eksekutif

Tech spec ini menerjemahkan 17 screen dan 12 component dari DESIGN.md menjadi arsitektur yang bisa langsung diimplementasikan: Next.js 16 App Router di Vercel, Supabase Postgres + Auth + RLS, dan seluruh mutasi finansial lewat PostgreSQL RPC yang atomik.

**Prinsip teknis utama:**

1. **Role-safe di level database** — harga beli & margin disimpan di tabel terpisah (`product_costs`, `transaction_costs`) yang hanya bisa dibaca Admin. Karyawan tidak bisa membocorkan data lewat query langsung, DevTools, atau API.
2. **Uang tidak pernah floating point** — semua nominal `numeric(14,2)` di Postgres, dikirim sebagai integer rupiah di API, dihitung dengan floor + largest-remainder agar Σ persentase = 100% dan Σ item = pool.
3. **Mutasi atomik** — penjualan, pengeluaran, transfer, penyesuaian saldo, void, dan payout dieksekusi lewat RPC `SECURITY DEFINER` dengan row lock + idempotency key.
4. **Server-first** — RSC untuk baca, Server Actions untuk tulis; route handler hanya untuk health, polling status payout, export, PDF, dan avatar.
5. **RLS deny-by-default** — semua tabel di `public` mengaktifkan RLS; grant langsung ke `authenticated` dicabut untuk tabel finansial.

### Keputusan atas Open Questions DESIGN.md

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Konfigurasi persentase alokasi | Tabel singleton `payout_settings` (retained/admin/investor/employee), check sum = 100 |
| 2 | Omzet karyawan | Karyawan melihat jumlah transaksi + nilai penjualan **miliknya** (harga jual), tidak pernah profit/margin/aset |
| 3 | Void transaksi | Admin-only, alasan wajib, membuat **jurnal balik** (`reversal_of`), bukan delete |
| 4 | Porsi investor/karyawan | `default_profit_share` sebagai bobot relatif dalam pool; total bobot tidak harus 100 |
| 5 | Pool tanpa penerima | Pool dialihkan ke `retained_earnings` dan dicatat di `payout_history.notes` |
| 6 | Pembulatan | Pool non-retained di-`floor`; largest remainder di dalam tiap pool; sisa pembulatan & pool tanpa penerima masuk retained earnings |
| 7 | Retained earnings | Tidak memotong wallet; tetap sebagai saldo bisnis |

### Deviasi dari PRD (disetujui lewat spec ini)

| PRD | Tech Spec | Alasan |
|---|---|---|
| `products.harga_beli` | Dipindah ke `product_costs` (1:1) | Column-level security; RLS tidak bisa hide kolom |
| `transactions` tanpa qty/snapshot | Tambah `qty`, `unit_price`, `status`, `reversal_of`, `client_request_id`, `payout_id` | Margin historis akurat + audit + idempotency |
| `transactions.periode_payout` varchar | Diganti `payout_id` + `payout_history.start_date/end_date` | Relasi kuat, anti duplikat periode |
| `payout_history` hanya total | Tambah `payout_items` per penerima | Desain Screen 12–14 butuh breakdown per orang |
| Belum ada settings alokasi | Tambah `payout_settings` singleton | Admin bisa atur persentase |
| Belum ada audit saldo | Tambah `wallet_adjustments` + `audit_logs` | Penyesuaian saldo & void harus bisa ditelusuri |
| Belum ada import legacy | Tambah `import_batches` + `legacy_ref` | Migrasi CSV/Excel dari PRD |

### Scope MVP

**In scope:** Auth + RBAC, dashboard 3 role, transaksi (penjualan/pengeluaran/void), produk + margin, wallet + mutasi + penyesuaian, weekly profit sharing + payout + riwayat, manajemen pengguna, profil/pengaturan, 403/404, import CSV legacy.

**Out of scope (fase berikutnya):** modul servis HP/PC, multi-outlet, pajak, WhatsApp/email notification, integrasi H2H OrderKuota, mobile app native.

---

# BAGIAN 1 — Tech Stack & Arsitektur

## 1.1 Tech Stack

| Layer | Technology | Version | Catatan |
|---|---|---|---|
| Runtime | Node.js | **24 LTS** | Next 16 butuh ≥20.9; Supabase JS butuh ≥22 |
| Package manager | Bun | **1.4.4** | Semua script `bun run`, lockfile `bun.lock` |
| Framework | Next.js | **16.4.5** | App Router, RSC, Server Actions, `proxy.ts` |
| UI Runtime | React | **19.3.1** | `useActionState`, `useOptimistic` |
| Language | TypeScript | **7.0.2** | `strict: true`, `noUncheckedIndexedAccess: true` |
| Styling | Tailwind CSS | **4.3.5** | CSS-first `@theme`, `@tailwindcss/postcss` 4.3.5 |
| Component library | shadcn/ui (CLI `shadcn`) | **4.23.0** | Radix primitives, copy-in components |
| Icons | lucide-react | **1.70.0** | Outline 1.75px |
| Forms | react-hook-form | **7.91.0** | + `@hookform/resolvers` 7.0.3 |
| Validation | Zod | **4.6.7** | Schema dipakai client + server + test |
| Data tables | @tanstack/react-table | **9.3.1** | Basis shadcn DataTable |
| Charts | Recharts | **3.10.1** | Client component, lazy-loaded |
| Toast | sonner | **2.0.8** | Mengikuti spec Toast DESIGN.md |
| Theme | next-themes | **0.4.6** | `class` strategy, light/dark/system |
| Dates | date-fns + @date-fns/tz | **4.4.0 / 1.5.0** | Zona waktu `Asia/Jakarta` |
| PDF | @react-pdf/renderer | **4.9.0** | Receipt payout |
| CSV | papaparse | **5.7.0** | Import legacy + export transaksi |
| XLSX | exceljs | **4.4.0** | Parser file Excel legacy (dipakai hanya di script import) |
| Image | sharp | **0.34.4** | Re-encode avatar 512×512 WebP |
| Database | PostgreSQL (Supabase) | **17** | Managed, region `ap-southeast-1` |
| BaaS | Supabase (Auth, PostgREST, RLS, Storage) | CLI **3.0.0** | Project staging + production terpisah |
| Supabase client | @supabase/supabase-js / @supabase/ssr | **2.119.0 / 0.12.7** | Cookie-based SSR session |
| ORM | — (SQL migrations + generated types) | — | `supabase gen types typescript` |
| Logging | pino | **10.4.0** | JSON structured logs |
| Error tracking | @sentry/nextjs | **11.11.0** | Errors + performance + source maps |
| Analytics | @vercel/analytics / @vercel/speed-insights | **2.0.1 / 2.1.0** | Web vitals |
| Testing | Vitest / Testing Library / jsdom | **5.1.0 / 16.3.3 / 31.0.0** | Unit + component |
| E2E | Playwright | **1.65.0** | 7 critical flows |
| CI/CD | GitHub Actions + Vercel | — | Preview per PR, production manual approval |
| Hosting | Vercel | — | Region `sin1` (dekat Supabase Singapore) |

> **Catatan Tailwind 4:** tidak ada `tailwind.config.ts`. Token DESIGN.md ditulis di `src/app/globals.css` via `@theme` + CSS variables shadcn (Appendix B DESIGN.md).

> **Catatan TailAdmin:** PRD menyebut TailAdmin sebagai template/layout. Di spec ini TailAdmin dipakai sebagai **referensi pola layout** (sidebar, topbar, dark mode), bukan template mentah. Implementasi memakai komponen shadcn/ui + token DESIGN.md agar konsisten dengan design system PeppyCell dan tidak membawa dependency/JS yang tidak perlu.

## 1.2 Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser (mobile-first, PWA-ready)                               │
│  ├─ RSC payload + streamed Suspense                             │
│  ├─ Client islands: chart, combobox, wizard, filter             │
│  └─ Cookie session (httpOnly, secure, sameSite=lax)             │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────────────┐
│ Vercel — Next.js 16 (region sin1)                               │
│  ├─ src/proxy.ts        → refresh session + route guard          │
│  ├─ RSC pages           → read via supabase-js (user JWT)        │
│  ├─ Server Actions      → zod → RBAC → Supabase RPC             │
│  ├─ Route Handlers      → JSON / CSV / PDF / polling / avatar   │
│  └─ instrumentation.ts  → Sentry server init                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS (PostgREST + RPC)
┌───────────────────────────▼─────────────────────────────────────┐
│ Supabase — ap-southeast-1                                       │
│  ├─ GoTrue (Auth)       → email/password, invite, PKCE          │
│  ├─ PostgREST           → REST + RLS enforcement                │
│  ├─ Postgres 17         → tables, enums, RPC SECURITY DEFINER   │
│  ├─ Storage             → avatar (max 2MB)                      │
│  └─ Logs / PITR         → observability + backup                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼────────────────────┐
        ▼                   ▼                    ▼
   Sentry              Vercel Analytics     Supabase Logs
   (errors/traces)     (web vitals)         (Postgres/Auth)
```

### Request Lifecycle

| Jenis request | Jalur | Catatan |
|---|---|---|
| Baca halaman | Browser → `proxy.ts` → RSC page → `supabase-js` → PostgREST (RLS) | Streaming + Suspense per section |
| Mutasi form | Browser → Server Action → `withAction` (auth + role) → zod → RPC → revalidate | Cookie otomatis, tanpa API token di client |
| Polling payout | Browser → `GET /api/payouts/:id/status` → Supabase RPC | Setelah eksekusi, interval 2s maks 60s |
| Download PDF/CSV | Browser → Route Handler → RPC/query → stream file | Auth dicek di handler |
| Realtime | Tidak dipakai di MVP | Polling cukup untuk status payout |

### Strategi Rendering & Data

| Area | Strategi | Cache |
|---|---|---|
| Dashboard | RSC + Suspense per card; RPC `get_dashboard_metrics` | `revalidate: 30s`, tag `dashboard:{role}:{userId}` |
| Transaksi list | RSC + `searchParams`; RLS query langsung | No cache (`dynamic`) |
| Detail transaksi | RSC | No cache |
| Produk | RSC + client search (debounce) | `revalidate: 60s`, tag `products` |
| Wallet | RSC | `revalidate: 30s`, tag `wallets` |
| Bagi hasil preview | Server Action `previewPayout` + client state | No cache |
| Payout history | RSC | No cache |
| Pengguna | RSC | `revalidate: 60s`, tag `users` |
| Profil | RSC + Server Action | No cache |

> **Aturan:** data finansial yang bisa berubah karena transaksi **tidak boleh** di-cache lebih dari 30 detik. Setiap mutasi memanggil `revalidateTag` terkait.

## 1.3 Struktur Folder

```
peppycell/
├── .agents/
│   ├── DESIGN.md
│   ├── TECH-SPEC.md
│   └── PROGRESS.md
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── error.tsx
│   │   ├── global-error.tsx
│   │   ├── not-found.tsx
│   │   ├── forbidden.tsx                 # error boundary untuk forbidden()
│   │   ├── 403/page.tsx                  # halaman 403 statis (di luar AppShell)
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (app)/
│   │   │   ├── layout.tsx                 # AppShell + role guard
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── transactions/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx           # ?type=sale|expense
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── products/page.tsx
│   │   │   ├── wallets/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [id]/page.tsx
│   │   │   │   └── transfer/page.tsx
│   │   │   ├── profit-sharing/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── history/
│   │   │   │       ├── page.tsx
│   │   │   │       └── [id]/page.tsx
│   │   │   ├── users/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── auth/confirm/route.ts          # invite/recovery token
│   │   └── api/
│   │       ├── health/route.ts
│   │       ├── me/route.ts
│   │       ├── avatar/route.ts
│   │       ├── dashboard/route.ts
│   │       ├── transactions/route.ts
│   │       ├── transactions/[id]/route.ts
│   │       ├── products/route.ts
│   │       ├── wallets/route.ts
│   │       ├── wallets/[id]/route.ts
│   │       ├── payouts/route.ts
│   │       ├── payouts/[id]/route.ts
│   │       ├── payouts/[id]/status/route.ts
│   │       ├── payouts/[id]/pdf/route.ts
│   │       ├── users/route.ts
│   │       └── export/transactions/route.ts
│   ├── actions/
│   │   ├── auth.ts
│   │   ├── transactions.ts
│   │   ├── products.ts
│   │   ├── wallets.ts
│   │   ├── payouts.ts
│   │   ├── users.ts
│   │   └── settings.ts
│   ├── components/
│   │   ├── ui/                            # shadcn generated
│   │   ├── layout/
│   │   │   ├── app-shell.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── bottom-nav.tsx
│   │   │   ├── topbar.tsx
│   │   │   └── fab.tsx
│   │   ├── dashboard/
│   │   ├── transactions/
│   │   ├── products/
│   │   ├── wallets/
│   │   ├── payouts/
│   │   ├── users/
│   │   └── shared/                        # PageHeader, EmptyState, MoneyText, dst.
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts
│   │   │   ├── client.ts
│   │   │   ├── admin.ts
│   │   │   └── middleware.ts
│   │   ├── auth/
│   │   │   ├── session.ts
│   │   │   ├── require-role.ts
│   │   │   └── permissions.ts
│   │   ├── validations/
│   │   │   ├── transaction.ts
│   │   │   ├── product.ts
│   │   │   ├── wallet.ts
│   │   │   ├── payout.ts
│   │   │   └── user.ts
│   │   ├── money.ts                       # format + allocation + rounding
│   │   ├── period.ts                      # week bounds WIB
│   │   ├── csv.ts                         # parser import legacy
│   │   ├── errors.ts                      # AppError + code mapping
│   │   ├── action-wrapper.ts              # withAction
│   │   ├── resilience.ts                  # retry + circuit breaker
│   │   ├── logger.ts
│   │   ├── mappers.ts                     # snake_case RPC → camelCase domain
│   │   ├── idempotency.ts
│   │   └── utils.ts
│   ├── types/
│   │   ├── database.ts                    # generated Supabase types
│   │   └── domain.ts
│   ├── proxy.ts                           # Next 16 (pengganti middleware.ts)
│   ├── instrumentation.ts                 # Sentry server/edge
│   └── instrumentation-client.ts          # Sentry browser
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 202611070001_init_extensions.sql
│   │   ├── 202611070002_enums.sql
│   │   ├── 202611070003_core_tables.sql
│   │   ├── 202611070004_indexes.sql
│   │   ├── 202611070005_rls.sql
│   │   ├── 202611070006_functions.sql
│   │   └── 202611070007_seed_reference.sql
│   ├── tests/                             # pgTAP RLS + RPC
│   └── seed.sql
├── scripts/
│   ├── import-legacy.ts
│   ├── seed-admin.ts
│   ├── seed-demo.ts
│   ├── smoke.ts
│   └── check-env.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── public/
├── components.json
├── next.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── vitest.config.ts
├── vitest.integration.ts
├── playwright.config.ts
├── eslint.config.mjs
├── package.json
├── bun.lock
└── .env.example
```

## 1.4 Justifikasi

| Pilihan | Alasan |
|---|---|
| **Next.js 16 App Router** | Sesuai PRD; RSC mengurangi JS client untuk dashboard finansial, Server Actions menghilangkan API layer terpisah, Vercel deploy native |
| **Supabase** | PRD mewajibkan Postgres + Auth + RLS; RPC Postgres memungkinkan transaksi atomik untuk payout & mutasi saldo |
| **Tanpa ORM** | RLS + RPC + generated types lebih sederhana daripada Prisma/Drizzle di atas Supabase; migration SQL eksplisit dan mudah di-audit |
| **Tabel cost terpisah** | Satu-satunya cara reliable untuk menyembunyikan harga beli dari karyawan di level privilege database |
| **Server Actions + RPC** | Validasi Zod tetap di server; RPC menjaga invariants (saldo, duplikat payout) di satu tempat |
| **Tailwind 4 + shadcn/ui** | Sesuai PRD; token DESIGN.md dipetakan ke CSS variables; komponen bisa di-copy dan dimodifikasi |
| **Vercel region sin1** | Latency rendah ke Supabase `ap-southeast-1` dan pengguna Indonesia |
| **Bun** | Instalasi & script cepat; dipakai konsisten di lokal dan CI |

## 1.5 Code Snippets

### `next.config.ts`

```ts
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://*.vercel.app https://*.sentry.io",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.supabase.co",
              "connect-src 'self' https://*.supabase.co https://*.sentry.io https://vitals.vercel-insights.com",
              "font-src 'self' data:",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
```

### `src/proxy.ts` — refresh session + guard (Next.js 16)

```ts
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_ROUTES = ["/login", "/auth/confirm", "/api/health"];
const ROLE_PREFIXES: Record<string, string[]> = {
  "/wallets": ["admin"],
  "/products": ["admin", "karyawan"],
  "/transactions": ["admin", "karyawan"],
  "/users": ["admin"],
  "/profit-sharing/new": ["admin"],
  "/profit-sharing": ["admin", "investor"],
};

export default async function proxy(request: NextRequest) {
  const { response, user, role } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (PUBLIC_ROUTES.some((p) => pathname.startsWith(p))) return response;

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, data: null, error: { code: "UNAUTHORIZED", message: "Sesi tidak valid." }, meta: null },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  for (const [prefix, allowed] of Object.entries(ROLE_PREFIXES)) {
    if (pathname.startsWith(prefix) && !allowed.includes(role)) {
      const url = request.nextUrl.clone();
      url.pathname = "/403";
      return NextResponse.rewrite(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
```

### `src/lib/supabase/server.ts`

```ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component tidak boleh menulis cookie; proxy yang refresh.
          }
        },
      },
    },
  );
}
```

### `src/lib/supabase/admin.ts` — service role, server-only

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
```

### `src/lib/auth/require-role.ts`

```ts
import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { UserRole } from "@/types/domain";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, email, full_name, role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile?.is_active) return null;
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    isActive: profile.is_active,
  };
}

export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role)) redirect("/403");
  return user;
}

// Untuk Route Handler / API: jangan redirect, kembalikan error JSON.
export async function requireApiRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AppError("UNAUTHORIZED", "Sesi tidak valid. Silakan login ulang.");
  if (!roles.includes(user.role)) throw new AppError("FORBIDDEN", "Anda tidak punya akses.");
  return user;
}
```

> `AppError` memetakan `UNAUTHORIZED` → HTTP 401 dan `FORBIDDEN` → 403 di `toApiError`.

---

# BAGIAN 2 — Database Design

## 2.1 Ringkasan Database

| Item | Detail |
|---|---|
| Database | Supabase PostgreSQL 17 (region `ap-southeast-1`) |
| ORM/Driver | `@supabase/supabase-js` + PostgREST; SQL migration manual |
| Pendekatan | Relational, normalized, RLS deny-by-default |
| Tools Migrasi | Supabase CLI 3.0.0 (`supabase migration new`, `supabase db push`) |
| Tipe Uang | `numeric(14,2)`; dikirim sebagai integer rupiah (tanpa desimal) |
| Zona Waktu | Semua `timestamptz` disimpan UTC; render & period boundary `Asia/Jakarta` |
| ID | UUID v4 (`gen_random_uuid()`) |
| Audit | `audit_logs` + `wallet_adjustments` + kolom `created_at/updated_at` |

## 2.2 ERD

```
auth.users
   │ 1:1
   ▼
users ──────────────< transactions >────────────── wallets
   │ 1:N                    │ 1:1                      │ 1:N
   │                        ▼                          ▼
   │                 transaction_costs          wallet_adjustments
   │                        │
   │                        │ N:1
   │                        ▼
   │                     products ──1:1── product_costs
   │
   ├──< payout_items >── payout_history ──N:1── wallets
   │         │                  │
   │         └──1:1── transactions (payout)
   │
   └──< wallet_adjustments / audit_logs / import_batches

payout_settings (singleton 1:1 app)
```

**Alur data kunci:** User mencatat penjualan → `transactions` (data aman) + `transaction_costs` (admin-only) + update `wallets.saldo`. Payout → `payout_history` + `payout_items` per penerima + `transactions` per item + potong wallet.

## 2.3 Enums

```sql
create type public.user_role as enum ('admin', 'karyawan', 'investor');
create type public.wallet_type as enum ('cash', 'bank', 'digital');
create type public.transaction_type as enum ('income', 'expense', 'transfer', 'payout');
create type public.transaction_status as enum ('active', 'void');
create type public.payout_status as enum ('processing', 'completed', 'failed');
create type public.payout_category as enum ('admin_dividend', 'investor_dividend', 'employee_commission');
```

## 2.4 Entity Overview

### `users` — profil publik + role

| Field | Type | Constraints | Cardinality |
|---|---|---|---|
| `id` | uuid | PK, FK → `auth.users(id)` ON DELETE CASCADE | 1:1 ke `auth.users` |
| `email` | text | NOT NULL, UNIQUE | — |
| `full_name` | text | NOT NULL, CHECK length 2–60 | — |
| `role` | `user_role` | NOT NULL, DEFAULT `'karyawan'` | — |
| `default_profit_share` | numeric(5,2) | NOT NULL, DEFAULT 0, CHECK 0–100 | — |
| `is_active` | boolean | NOT NULL, DEFAULT true | — |
| `avatar_url` | text | NULL | — |
| `theme` | text | NOT NULL, DEFAULT `'system'`, CHECK IN (`light`,`dark`,`system`) | — |
| `notification_payout` | boolean | NOT NULL, DEFAULT true | — |
| `invited_at` | timestamptz | NULL | — |
| `last_seen_at` | timestamptz | NULL | — |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | — |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | — |

**Relasi:** 1:N `transactions.user_id` (pencatat), 1:N `payout_items.user_id` (penerima), 1:N `wallet_adjustments.actor_id`, 1:N `audit_logs.actor_id`.

### `wallets` — aset bisnis

| Field | Type | Constraints | Cardinality |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | — |
| `nama_wallet` | varchar(40) | NOT NULL, UNIQUE | — |
| `tipe` | `wallet_type` | NOT NULL, DEFAULT `'cash'` | — |
| `saldo` | numeric(14,2) | NOT NULL, DEFAULT 0, CHECK ≥ 0 | — |
| `is_active` | boolean | NOT NULL, DEFAULT true | — |
| `is_default` | boolean | NOT NULL, DEFAULT false | — |
| `sort_order` | smallint | NOT NULL, DEFAULT 0 | — |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | — |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | — |

**Partial unique index:** hanya satu `is_default = true`.
**Relasi:** 1:N `transactions.wallet_id`, 1:N `transactions.wallet_destination_id`, 1:N `payout_history.wallet_id`, 1:N `wallet_adjustments.wallet_id`.

### `products` — data aman (harga jual)

| Field | Type | Constraints | Cardinality |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | — |
| `nama_produk` | varchar(60) | NOT NULL, UNIQUE (`lower(nama_produk)`) | — |
| `operator` | varchar(20) | NOT NULL | — |
| `harga_jual` | numeric(14,2) | NOT NULL, CHECK > 0 | — |
| `is_active` | boolean | NOT NULL, DEFAULT true | — |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | — |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | — |

**Relasi:** 1:1 `product_costs`, 1:N `transactions.product_id`.

### `product_costs` — harga beli (Admin-only)

| Field | Type | Constraints | Cardinality |
|---|---|---|---|
| `product_id` | uuid | PK, FK → `products(id)` ON DELETE CASCADE | 1:1 ke `products` |
| `harga_beli` | numeric(14,2) | NOT NULL, CHECK ≥ 0 | — |
| `updated_by` | uuid | FK → `users(id)` | N:1 ke `users` |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | — |

**Invariant:** `harga_beli ≤ products.harga_jual` (trigger `assert_positive_margin`).

### `transactions` — jurnal transaksi (data aman)

| Field | Type | Constraints | Cardinality |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | — |
| `tanggal` | timestamptz | NOT NULL, DEFAULT now() | — |
| `tipe` | `transaction_type` | NOT NULL | — |
| `kategori` | varchar(30) | NOT NULL | — |
| `nominal` | numeric(14,2) | NOT NULL, CHECK > 0 | — |
| `qty` | integer | NOT NULL, DEFAULT 1, CHECK > 0 | — |
| `unit_price` | numeric(14,2) | NULL, CHECK ≥ 0 | — |
| `wallet_id` | uuid | NOT NULL, FK → `wallets(id)` | N:1 ke `wallets` |
| `wallet_destination_id` | uuid | NULL, FK → `wallets(id)` | N:1 ke `wallets` (transfer) |
| `product_id` | uuid | NULL, FK → `products(id)` | N:1 ke `products` |
| `keterangan` | text | NULL, CHECK length ≤ 200 | — |
| `payout_id` | uuid | NULL, FK → `payout_history(id)` | N:1 ke `payout_history` |
| `user_id` | uuid | NOT NULL, FK → `users(id)` | N:1 ke `users` |
| `status` | `transaction_status` | NOT NULL, DEFAULT `'active'` | — |
| `reversal_of` | uuid | NULL, FK → `transactions(id)` | 1:1 opsional |
| `legacy_ref` | text | UNIQUE, NULL | — |
| `client_request_id` | uuid | NOT NULL, UNIQUE, DEFAULT gen_random_uuid() | — |
| `import_batch_id` | uuid | NULL, FK → `import_batches(id)` | N:1 |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | — |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | — |

**CHECK tipe:**

```sql
alter table public.transactions add constraint transactions_tipe_shape check (
  (tipe = 'income'   and product_id is not null and unit_price is not null
                     and wallet_destination_id is null) or
  (tipe = 'expense'  and product_id is null and unit_price is null and wallet_destination_id is null) or
  (tipe = 'transfer' and product_id is null and unit_price is null
                     and wallet_destination_id is not null and wallet_destination_id <> wallet_id) or
  (tipe = 'payout'   and product_id is null and unit_price is null
                     and wallet_destination_id is null and payout_id is not null)
);
```

**Aturan kategori:** `income` → `penjualan`; `expense` → `operasional` | `gaji` | `deviden` | `lainnya`; `transfer` → `transfer`; `payout` → `deviden` | `gaji`.

### `transaction_costs` — margin snapshot (Admin-only)

| Field | Type | Constraints | Cardinality |
|---|---|---|---|
| `transaction_id` | uuid | PK, FK → `transactions(id)` ON DELETE CASCADE | 1:1 ke `transactions` |
| `unit_cost` | numeric(14,2) | NOT NULL, CHECK ≥ 0 | — |
| `margin` | numeric(14,2) | NOT NULL | — |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | — |

**Invariant:** baris ini hanya dibuat untuk `tipe='income'`; `margin = (unit_price − unit_cost) × qty`; dihitung di RPC, bukan client.

### `payout_settings` — konfigurasi alokasi global

| Field | Type | Constraints | Cardinality |
|---|---|---|---|
| `id` | smallint | PK, DEFAULT 1, CHECK id = 1 | 1:1 app |
| `retained_pct` | numeric(5,2) | NOT NULL, DEFAULT 20, CHECK 0–100 | — |
| `admin_pct` | numeric(5,2) | NOT NULL, DEFAULT 40, CHECK 0–100 | — |
| `investor_pct` | numeric(5,2) | NOT NULL, DEFAULT 30, CHECK 0–100 | — |
| `employee_pct` | numeric(5,2) | NOT NULL, DEFAULT 10, CHECK 0–100 | — |
| `updated_by` | uuid | FK → `users(id)` | N:1 |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | — |

**CHECK:** `retained_pct + admin_pct + investor_pct + employee_pct = 100`.

### `payout_history` — satu record per periode

| Field | Type | Constraints | Cardinality |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | — |
| `start_date` | date | NOT NULL | — |
| `end_date` | date | NOT NULL, CHECK ≥ start_date | — |
| `gross_margin_total` | numeric(14,2) | NOT NULL, DEFAULT 0 | — |
| `operating_expense_total` | numeric(14,2) | NOT NULL, DEFAULT 0 | — |
| `net_profit_total` | numeric(14,2) | NOT NULL, DEFAULT 0 | — |
| `retained_earnings` | numeric(14,2) | NOT NULL, DEFAULT 0 | — |
| `total_distributed` | numeric(14,2) | NOT NULL, DEFAULT 0 | — |
| `wallet_id` | uuid | NOT NULL, FK → `wallets(id)` | N:1 |
| `status` | `payout_status` | NOT NULL, DEFAULT `'processing'` | — |
| `idempotency_key` | text | NOT NULL, UNIQUE | — |
| `allocations` | jsonb | NOT NULL, DEFAULT `'{}'::jsonb` | Snapshot persentase saat eksekusi |
| `notes` | text | NULL | — |
| `created_by` | uuid | NOT NULL, FK → `users(id)` | N:1 |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | — |
| `completed_at` | timestamptz | NULL | — |
| `failed_reason` | text | NULL | — |

**UNIQUE (`start_date`, `end_date`)** — anti-double payout per periode.
**CHECK:** `total_distributed = net_profit_total − retained_earnings`.

### `payout_items` — breakdown per penerima

| Field | Type | Constraints | Cardinality |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | — |
| `payout_id` | uuid | NOT NULL, FK → `payout_history(id)` ON DELETE CASCADE | N:1 |
| `user_id` | uuid | NOT NULL, FK → `users(id)` | N:1 |
| `category` | `payout_category` | NOT NULL | — |
| `weight_pct` | numeric(5,2) | NOT NULL, DEFAULT 0, CHECK 0–100 | — |
| `amount` | numeric(14,2) | NOT NULL, CHECK > 0 | — |
| `transaction_id` | uuid | UNIQUE, FK → `transactions(id)` | 1:1 opsional |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | — |

**UNIQUE (`payout_id`, `user_id`, `category`)**.

### `wallet_adjustments` — audit penyesuaian saldo

| Field | Type | Constraints | Cardinality |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | — |
| `wallet_id` | uuid | NOT NULL, FK → `wallets(id)` | N:1 |
| `old_balance` | numeric(14,2) | NOT NULL | — |
| `new_balance` | numeric(14,2) | NOT NULL, CHECK ≥ 0 | — |
| `delta` | numeric(14,2) | NOT NULL, CHECK ≠ 0 | — |
| `reason` | text | NOT NULL, CHECK length ≥ 10 | — |
| `actor_id` | uuid | NOT NULL, FK → `users(id)` | N:1 |
| `client_request_id` | uuid | NOT NULL, UNIQUE, DEFAULT gen_random_uuid() | Idempotency |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | — |

### `audit_logs` — jejak aksi sensitif

| Field | Type | Constraints | Cardinality |
|---|---|---|---|
| `id` | bigserial | PK | — |
| `table_name` | text | NOT NULL | — |
| `record_id` | text | NOT NULL | ID record (uuid/smallint sebagai text) |
| `action` | text | NOT NULL (insert/update/delete/void/payout) | — |
| `old_values` | jsonb | NULL | — |
| `new_values` | jsonb | NULL | — |
| `reason` | text | NULL | — |
| `actor_id` | uuid | NULL, FK → `users(id)` | N:1 |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | — |

### `import_batches` — migrasi legacy

| Field | Type | Constraints | Cardinality |
|---|---|---|---|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | — |
| `source` | text | NOT NULL (`csv`, `xlsx`, `manual`) | — |
| `filename` | text | NOT NULL | — |
| `row_count` | integer | NOT NULL, DEFAULT 0 | — |
| `status` | text | NOT NULL, CHECK IN (`dry_run`,`committed`,`rolled_back`,`failed`) | — |
| `report` | jsonb | NULL | — |
| `created_by` | uuid | FK → `users(id)` | N:1 |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | — |

## 2.5 Cardinality Summary

| Relation | Type | Description |
|---|---|---|
| `auth.users` → `users` | 1:1 | Profil publik per akun auth |
| `users` → `transactions` | 1:N | Satu user mencatat banyak transaksi |
| `users` → `payout_items` | 1:N | Satu user menerima banyak item payout |
| `wallets` → `transactions` | 1:N | Wallet sebagai sumber dana |
| `wallets` → `transactions` (destination) | 1:N | Wallet tujuan transfer |
| `products` → `transactions` | 1:N | Produk dijual di banyak transaksi |
| `products` → `product_costs` | 1:1 | Harga beli per produk |
| `transactions` → `transaction_costs` | 1:1 | Snapshot margin per penjualan |
| `transactions` → `transactions` | 1:1 | Reversal opsional (`reversal_of`) |
| `payout_history` → `payout_items` | 1:N | Breakdown per penerima |
| `payout_items` → `transactions` | 1:1 | Satu transaksi `payout` per penerima |
| `wallets` → `payout_history` | 1:N | Wallet sumber payout |
| `wallets` → `wallet_adjustments` | 1:N | Riwayat penyesuaian saldo |
| `import_batches` → `transactions` | 1:N | Baris hasil import legacy |

## 2.6 Index Strategy

| Index | Tabel | Alasan |
|---|---|---|
| `transactions_tanggal_idx` | `transactions(tanggal desc)` | List & filter tanggal |
| `transactions_tanggal_wib_idx` | `transactions((tanggal at time zone 'Asia/Jakarta')::date)` | Period payout tanpa full scan |
| `transactions_user_tanggal_idx` | `transactions(user_id, tanggal desc)` | Karyawan "hari ini milik saya" |
| `transactions_wallet_tanggal_idx` | `transactions(wallet_id, tanggal desc)` | Detail wallet |
| `transactions_payout_idx` | `transactions(payout_id)` | Detail payout |
| `transactions_status_idx` | `transactions(status) where status='active'` | Agregat laba |
| `transactions_product_idx` | `transactions(product_id)` | Margin per produk |
| `transactions_client_request_uidx` | `UNIQUE(client_request_id)` | Idempotency |
| `transactions_reversal_uidx` | `UNIQUE(reversal_of) where reversal_of is not null` | Satu reversal per transaksi |
| `transactions_legacy_ref_uidx` | `UNIQUE(legacy_ref)` | Import legacy |
| `transaction_costs_pk` | `transaction_costs(transaction_id)` | Join margin |
| `products_nama_lower_uidx` | `UNIQUE(lower(nama_produk))` | Cegah duplikat case-insensitive |
| `products_operator_idx` | `products(operator)` | Filter katalog |
| `payout_history_period_uidx` | `UNIQUE(start_date, end_date)` | Anti double payout |
| `payout_history_status_idx` | `payout_history(status, start_date desc)` | List & banner |
| `payout_items_payout_idx` | `payout_items(payout_id)` | Breakdown |
| `payout_items_user_idx` | `payout_items(user_id, created_at desc)` | Deviden investor |
| `wallet_adjustments_wallet_idx` | `wallet_adjustments(wallet_id, created_at desc)` | Tab audit |
| `audit_logs_record_idx` | `audit_logs(table_name, record_id)` | Jejak record |
| `users_role_active_idx` | `users(role, is_active)` | Pool payout & manajemen user |
| `wallets_default_uidx` | `UNIQUE(is_default) where is_default` | Satu wallet default |
| `users_email_lower_uidx` | `UNIQUE(lower(email))` | Cegah duplikat case-insensitive |

## 2.7 RLS Strategy

| Table | Admin | Karyawan | Investor | Direct write |
|---|---|---|---|---|
| `users` | all | select self, update self (nama/avatar/theme/notif) | select self, update self | update via policy + trigger guard |
| `wallets` | all | — | — | RPC only |
| `products` | all | select `is_active=true` | — | update admin (insert/delete revoked) |
| `product_costs` | all | — | — | RPC only |
| `transactions` | all | select own **hari ini WIB** | — | RPC only |
| `transaction_costs` | all | — | — | RPC only |
| `payout_settings` | select/update | — | — | RPC only |
| `payout_history` | all | — | select jika punya item | RPC only |
| `payout_items` | all | — | select own | RPC only |
| `wallet_adjustments` | all | — | — | RPC only |
| `audit_logs` | all | — | — | trigger/RPC only |
| `import_batches` | all | — | — | script admin |

**Prinsip:** `enable row level security` di semua tabel; `revoke insert/update/delete` pada tabel finansial (`transactions`, `wallets`, `payout_history`, `payout_items`, `transaction_costs`, `product_costs`, `payout_settings`, `wallet_adjustments`, `audit_logs`, `import_batches`) dan `revoke insert/delete` pada `products`; grant hanya `select` yang diizinkan + `execute` function.

## 2.8 Data Flow

```
Penjualan:
  Karyawan pilih produk (products: id, nama, harga_jual)
    → create_sale(product_id, qty, client_request_id)
    → baca product_costs.harga_beli (server-side, tidak dikirim balik)
    → insert transactions (unit_price = harga_jual)
    → insert transaction_costs (unit_cost, margin)
    → update wallets(Cash).saldo += nominal
    → return { id, nama_produk, qty, subtotal } (tanpa cost/margin)

Payout:
  Admin preview (start, end)
    → agregasi margin dari transaction_costs + expense operasional
    → hitung 4 alokasi + per penerima
  Admin execute (satu transaksi atomik)
    → advisory lock periode + lock wallet FOR UPDATE
    → hitung net + build items (helper largest-remainder)
    → insert payout_history(status=completed)
    → insert payout_items + transactions(tipe='payout')
    → update wallet saldo -= total_distributed
    → audit_logs
```

## 2.9 Data Migration Strategy

| Aspek | Keputusan |
|---|---|
| Legacy | CSV/Excel manual (PRD) → import via script Bun |
| Versioning | Supabase migrations, nama `YYYYMMDDHHMMSS_description.sql` |
| Rollback | Migration `down` manual (Supabase CLI tidak auto-generate down); production rollback via PITR + forward-fix |
| Zero downtime | Expand-contract: tambah kolom nullable → backfill → baru NOT NULL; tidak drop kolom di deploy yang sama |
| Cutover | Read-only window 2–4 jam; import → rekonsiliasi → go-live |
| Idempotensi import | `legacy_ref` unique + `import_batches` |

## 2.10 Seed Data

| Data | Purpose | Quantity |
|---|---|---|
| Admin user | Akses awal | 1 (`admin@peppycell.local`) |
| Karyawan user | Test RBAC | 1 (`kasir@peppycell.local`) |
| Investor user | Test read-only | 2 (`investor1@`, `investor2@`) |
| Wallets | Cash, Rekening BCA, Saldo OrderKuota | 3 |
| Products | Telkomsel/Indosat/XL/Tri/Smartfren | 10 |
| Product costs | Harga beli untuk 10 produk | 10 |
| Payout settings | 20/40/30/10 | 1 |
| Demo transactions | 30 hari terakhir, mixed income/expense | 60 |
| Demo payout | 2 periode selesai | 2 |

## 2.11 Code Snippets

### Enums + tabel inti

```sql
-- 202611070002_enums.sql
create type public.user_role as enum ('admin', 'karyawan', 'investor');
create type public.wallet_type as enum ('cash', 'bank', 'digital');
create type public.transaction_type as enum ('income', 'expense', 'transfer', 'payout');
create type public.transaction_status as enum ('active', 'void');
create type public.payout_status as enum ('processing', 'completed', 'failed');
create type public.payout_category as enum ('admin_dividend', 'investor_dividend', 'employee_commission');

-- 202611070003_core_tables.sql
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null check (char_length(full_name) between 2 and 60),
  role public.user_role not null default 'karyawan',
  default_profit_share numeric(5,2) not null default 0 check (default_profit_share between 0 and 100),
  is_active boolean not null default true,
  avatar_url text,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  notification_payout boolean not null default true,
  invited_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_lower_uidx on public.users (lower(email));

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  nama_wallet varchar(40) not null unique,
  tipe public.wallet_type not null default 'cash',
  saldo numeric(14,2) not null default 0 check (saldo >= 0),
  is_active boolean not null default true,
  is_default boolean not null default false,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index wallets_default_uidx on public.wallets (is_default) where is_default;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  nama_produk varchar(60) not null,
  operator varchar(20) not null,
  harga_jual numeric(14,2) not null check (harga_jual > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_nama_lower_uidx on public.products (lower(nama_produk));

create table public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  harga_beli numeric(14,2) not null check (harga_beli >= 0),
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

create table public.payout_settings (
  id smallint primary key default 1 check (id = 1),
  retained_pct numeric(5,2) not null default 20 check (retained_pct between 0 and 100),
  admin_pct numeric(5,2) not null default 40 check (admin_pct between 0 and 100),
  investor_pct numeric(5,2) not null default 30 check (investor_pct between 0 and 100),
  employee_pct numeric(5,2) not null default 10 check (employee_pct between 0 and 100),
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  check (retained_pct + admin_pct + investor_pct + employee_pct = 100)
);

create table public.payout_history (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  gross_margin_total numeric(14,2) not null default 0,
  operating_expense_total numeric(14,2) not null default 0,
  net_profit_total numeric(14,2) not null default 0,
  retained_earnings numeric(14,2) not null default 0,
  total_distributed numeric(14,2) not null default 0,
  wallet_id uuid not null references public.wallets(id),
  status public.payout_status not null default 'processing',
  idempotency_key text not null unique,
  allocations jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  failed_reason text,
  unique (start_date, end_date),
  check (total_distributed = net_profit_total - retained_earnings)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  tanggal timestamptz not null default now(),
  tipe public.transaction_type not null,
  kategori varchar(30) not null,
  nominal numeric(14,2) not null check (nominal > 0),
  qty integer not null default 1 check (qty > 0),
  unit_price numeric(14,2) check (unit_price >= 0),
  wallet_id uuid not null references public.wallets(id),
  wallet_destination_id uuid references public.wallets(id),
  product_id uuid references public.products(id),
  keterangan text check (char_length(keterangan) <= 200),
  payout_id uuid references public.payout_history(id),
  user_id uuid not null references public.users(id),
  status public.transaction_status not null default 'active',
  reversal_of uuid references public.transactions(id),
  legacy_ref text unique,
  client_request_id uuid not null unique default gen_random_uuid(),
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_tipe_shape check (
    (tipe = 'income'   and product_id is not null and unit_price is not null
                       and wallet_destination_id is null) or
    (tipe = 'expense'  and product_id is null and unit_price is null and wallet_destination_id is null) or
    (tipe = 'transfer' and product_id is null and unit_price is null
                       and wallet_destination_id is not null and wallet_destination_id <> wallet_id) or
    (tipe = 'payout'   and product_id is null and unit_price is null
                       and wallet_destination_id is null and payout_id is not null)
  )
);
create unique index transactions_reversal_uidx
  on public.transactions (reversal_of) where reversal_of is not null;

create table public.transaction_costs (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  margin numeric(14,2) not null,
  created_at timestamptz not null default now()
);

create table public.payout_items (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payout_history(id) on delete cascade,
  user_id uuid not null references public.users(id),
  category public.payout_category not null,
  weight_pct numeric(5,2) not null default 0 check (weight_pct between 0 and 100),
  amount numeric(14,2) not null check (amount > 0),
  transaction_id uuid unique references public.transactions(id),
  created_at timestamptz not null default now(),
  unique (payout_id, user_id, category)
);

create table public.wallet_adjustments (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id),
  old_balance numeric(14,2) not null,
  new_balance numeric(14,2) not null check (new_balance >= 0),
  delta numeric(14,2) not null check (delta <> 0),
  reason text not null check (char_length(reason) >= 10),
  actor_id uuid not null references public.users(id),
  client_request_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigserial primary key,
  table_name text not null,
  record_id text not null,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  reason text,
  actor_id uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('csv','xlsx','manual')),
  filename text not null,
  row_count integer not null default 0,
  status text not null check (status in ('dry_run','committed','rolled_back','failed')),
  report jsonb,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

alter table public.transactions
  add constraint transactions_import_batch_fk
  foreign key (import_batch_id) references public.import_batches(id);
```

### RLS helper + policy inti

```sql
create or replace function public.current_user_role()
returns public.user_role
language sql stable security definer
set search_path = public, pg_temp
as $$
  select role from public.users where id = auth.uid() and is_active = true;
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select coalesce(public.current_user_role() = 'admin', false); $$;

alter table public.users enable row level security;
alter table public.wallets enable row level security;
alter table public.products enable row level security;
alter table public.product_costs enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_costs enable row level security;
alter table public.payout_settings enable row level security;
alter table public.payout_history enable row level security;
alter table public.payout_items enable row level security;
alter table public.wallet_adjustments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.import_batches enable row level security;

-- users: self read, admin all
create policy users_select on public.users for select to authenticated
using (
  (id = auth.uid() and public.current_user_role() is not null)
  or public.is_admin()
);

create policy users_update_self on public.users for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = public.current_user_role());

create policy users_update_admin on public.users for update to authenticated
using (public.is_admin()) with check (public.is_admin());

-- products: karyawan hanya produk aktif; admin all
create policy products_select on public.products for select to authenticated
using (public.is_admin() or (is_active = true and public.current_user_role() = 'karyawan'));

create policy products_write on public.products for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- product_costs: admin only
create policy product_costs_admin on public.product_costs for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- transaction_costs: admin only (margin snapshot)
create policy transaction_costs_admin on public.transaction_costs for select to authenticated
using (public.is_admin());

-- transactions: admin all; karyawan own today WIB; no direct write
create policy transactions_select on public.transactions for select to authenticated
using (
  public.is_admin()
  or (
    public.current_user_role() = 'karyawan'
    and user_id = auth.uid()
    and (tanggal at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date
  )
);

revoke insert, delete on public.products from authenticated;
revoke insert, update, delete on public.transactions from authenticated;
revoke insert, update, delete on public.transaction_costs from authenticated;
revoke insert, update, delete on public.wallets from authenticated;
revoke insert, update, delete on public.payout_history from authenticated;
revoke insert, update, delete on public.payout_items from authenticated;
revoke insert, update, delete on public.product_costs from authenticated;
revoke insert, update, delete on public.payout_settings from authenticated;
revoke insert, update, delete on public.wallet_adjustments from authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, update, delete on public.import_batches from authenticated;

-- wallets, payout, audit: admin only
create policy wallets_admin on public.wallets for select to authenticated using (public.is_admin());
create policy payout_settings_admin on public.payout_settings for select to authenticated using (public.is_admin());
create policy payout_history_admin on public.payout_history for select to authenticated using (public.is_admin());
create policy payout_items_admin on public.payout_items for select to authenticated using (public.is_admin());
create policy wallet_adjustments_admin on public.wallet_adjustments for select to authenticated using (public.is_admin());
create policy audit_logs_admin on public.audit_logs for select to authenticated using (public.is_admin());
create policy import_batches_admin on public.import_batches for select to authenticated using (public.is_admin());

-- investor: hanya item deviden miliknya + header payout terkait
create policy payout_items_investor on public.payout_items for select to authenticated
using (public.current_user_role() = 'investor' and user_id = auth.uid());

create policy payout_history_investor on public.payout_history for select to authenticated
using (
  public.current_user_role() = 'investor'
  and exists (
    select 1 from public.payout_items pi
    where pi.payout_id = payout_history.id and pi.user_id = auth.uid()
  )
);
```

### Trigger `updated_at` + `handle_new_user`

```sql
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_updated_at before update on public.users
for each row execute function public.set_updated_at();
create trigger wallets_updated_at before update on public.wallets
for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger product_costs_updated_at before update on public.product_costs
for each row execute function public.set_updated_at();
create trigger payout_settings_updated_at before update on public.payout_settings
for each row execute function public.set_updated_at();
create trigger transactions_updated_at before update on public.transactions
for each row execute function public.set_updated_at();

-- Harga beli tidak boleh melebihi harga jual.
create or replace function public.assert_product_margin()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_price numeric(14,2);
begin
  select harga_jual into v_price from public.products where id = new.product_id;
  if v_price is not null and new.harga_beli > v_price then
    raise exception 'INVALID_MARGIN' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger product_costs_margin
before insert or update on public.product_costs
for each row execute function public.assert_product_margin();

-- Self-service hanya boleh ubah nama/avatar/theme/notifikasi.
-- role, porsi, email, dan status aktif hanya boleh diubah Admin/service role.
create or replace function public.guard_user_sensitive_fields()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  -- service role / koneksi admin langsung (migration, seed) boleh ubah semua field.
  if auth.role() = 'service_role'
     or session_user in ('postgres', 'supabase_admin')
     or public.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.default_profit_share is distinct from old.default_profit_share
     or new.is_active is distinct from old.is_active
     or new.email is distinct from old.email then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger users_guard_sensitive
before update on public.users
for each row execute function public.guard_user_sensitive_fields();

-- Audit otomatis untuk perubahan sensitif: harga produk, cost, role/porsi/status user,
-- metadata/status wallet, dan payout settings. RPC transaksi tetap menulis audit eksplisit.
create or replace function public.audit_sensitive_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_id text := coalesce(v_new->>'id', v_old->>'id');
begin
  insert into public.audit_logs (table_name, record_id, action, old_values, new_values, actor_id)
  values (tg_table_name, v_id, lower(tg_op), v_old, v_new, auth.uid());
  return coalesce(new, old);
end;
$$;

create trigger products_audit
after insert or update or delete on public.products
for each row execute function public.audit_sensitive_change();

create trigger product_costs_audit
after insert or update or delete on public.product_costs
for each row execute function public.audit_sensitive_change();

create trigger users_audit
after update of role, default_profit_share, is_active on public.users
for each row execute function public.audit_sensitive_change();

create trigger wallets_audit
after update of nama_wallet, tipe, is_active, is_default on public.wallets
for each row execute function public.audit_sensitive_change();

create trigger payout_settings_audit
after update on public.payout_settings
for each row execute function public.audit_sensitive_change();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,'user'), '@', 1)),
    'karyawan'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
```

### Generate types

```bash
bunx supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" --schema public > src/types/database.ts
```

---

# BAGIAN 3 — Interface Design

> Next.js App Router: **halaman (RSC)** untuk baca, **Server Actions** untuk mutasi, **Route Handlers** untuk file/health/polling/avatar.
> Semua endpoint mutasi memakai sesi cookie; tidak ada token di client.

## 3.1 Halaman / Route per Screen

| # | Screen DESIGN.md | Route | Rendering | Sumber data | Akses |
|---|---|---|---|---|---|
| 01 | Login | `/login` | Client form + Server Action | Supabase Auth | Public |
| 02 | Dashboard | `/dashboard` | RSC + Suspense per card | RPC `get_dashboard_metrics` | Admin, Karyawan, Investor |
| 03 | Transaksi | `/transactions` | RSC + `searchParams` | `transactions` (RLS) + join aman | Admin, Karyawan (own today) |
| 04 | Input Penjualan | `/transactions/new?type=sale` | RSC shell + client form | `products` + action `createSaleAction` | Admin, Karyawan |
| 05 | Input Pengeluaran | `/transactions/new?type=expense` | RSC shell + client form | `wallets` (admin) / wallet default implisit (karyawan) + action `createExpenseAction` | Admin, Karyawan |
| 06 | Detail Transaksi | `/transactions/[id]` | RSC + drawer client | `transactions` + `transaction_costs` (admin) | Admin, Karyawan (own) |
| 07 | Produk | `/products` | RSC + client table | `products` + `product_costs` (admin) | Admin (full), Karyawan (aktif) |
| 08 | Wallet & Aset | `/wallets` | RSC | `wallets` | Admin |
| 09 | Detail Wallet | `/wallets/[id]` | RSC | `wallets` + `transactions` + `wallet_adjustments` | Admin |
| 10 | Mutasi Aset | `/wallets/transfer` | RSC shell + client form | `wallets` + action `transferAction` | Admin |
| 11 | Bagi Hasil | `/profit-sharing` | RSC | Admin: RPC `preview_payout` + `payout_history`; Investor: `payout_history` saja | Admin, Investor (read-only) |
| 12 | Wizard Bagi Hasil | `/profit-sharing/new` | RSC shell + client wizard | RPC `preview_payout` + action `executePayoutAction` | Admin |
| 13 | Riwayat Payout | `/profit-sharing/history` | RSC + filter | `payout_history` + `payout_items` (RLS) | Admin, Investor (own) |
| 14 | Detail Payout | `/profit-sharing/history/[id]` | RSC | RPC `get_payout_receipt` | Admin, Investor (own) |
| 15 | Pengguna | `/users` | RSC + client table | `users` + Admin API invite | Admin |
| 16 | Profil & Pengaturan | `/settings` | RSC + client form | `users` | Semua role |
| 17 | 403 / 404 | `forbidden.tsx`, `not-found.tsx`, `/403` | Static | — | Semua role |
| — | Auth callback | `/auth/confirm` | Route Handler | Supabase token exchange | Public |

**Route groups:** `(auth)` untuk login tanpa AppShell; `(app)` untuk semua halaman login dengan AppShell + role guard. `layout.tsx` di `(app)` memanggil `requireRole("admin", "karyawan", "investor")` dan meneruskan `role` ke AppShell.

## 3.2 Server Actions

Semua action mengembalikan `ActionResult<T>`:

```ts
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> } };
```

| Action | Input (Zod) | Role | Efek |
|---|---|---|---|
| `loginAction` | `{ email, password, remember, next? }` | Public | Supabase signInWithPassword, set cookie, redirect |
| `logoutAction` | `{}` | Auth | signOut + redirect `/login` |
| `requestPasswordResetAction` | `{ email }` | Public | Kirim email reset (selalu sukses agar tidak enumerate) |
| `updatePasswordAction` | `{ password }` | Auth | Update password setelah link recovery |
| `createSaleAction` | `{ productId, qty, description?, clientRequestId }` | Admin, Karyawan | RPC `create_sale` |
| `createExpenseAction` | `{ tanggal, category, amount, walletId?, description, clientRequestId }` | Admin, Karyawan | RPC `create_expense`; `walletId` diabaikan & dipaksa wallet default untuk karyawan |
| `voidTransactionAction` | `{ transactionId, reason }` | Admin | RPC `void_transaction` |
| `createProductAction` | `{ nama, operator, hargaBeli, hargaJual }` | Admin | RPC `upsert_product` |
| `updateProductAction` | `{ id, nama, operator, hargaBeli, hargaJual }` | Admin | RPC `upsert_product` |
| `toggleProductAction` | `{ id, isActive }` | Admin | Update `products.is_active` |
| `createWalletAction` | `{ nama, tipe, saldoAwal, isDefault? }` | Admin | RPC `create_wallet` |
| `updateWalletAction` | `{ id, nama, tipe, isDefault }` | Admin | RPC `update_wallet` (metadata, bukan saldo) |
| `toggleWalletAction` | `{ id, isActive }` | Admin | RPC `toggle_wallet` (nonaktif harus saldo 0) |
| `transferAction` | `{ fromWalletId, toWalletId, amount, description, clientRequestId }` | Admin | RPC `transfer_wallet` |
| `adjustBalanceAction` | `{ walletId, newBalance, reason, clientRequestId }` | Admin | RPC `adjust_wallet_balance` |
| `updatePayoutSettingsAction` | `{ retainedPct, adminPct, investorPct, employeePct }` | Admin | RPC `update_payout_settings` |
| `previewPayoutAction` | `{ startDate, endDate, allocations? }` | Admin | RPC `preview_payout` |
| `executePayoutAction` | `{ startDate, endDate, walletId, allocations, idempotencyKey }` | Admin | RPC `execute_payout` |
| `inviteUserAction` | `{ email, fullName, role, defaultProfitShare }` | Admin | Admin API invite + upsert `users` (trigger `handle_new_user` membuat baris awal) |
| `updateUserAction` | `{ id, fullName, role, defaultProfitShare, isActive }` | Admin | Update `users` |
| `toggleUserAction` | `{ id, isActive }` | Admin | Nonaktifkan/aktifkan; RLS langsung berlaku |
| `resendInviteAction` | `{ id }` | Admin | Kirim ulang invite Supabase |
| `updateProfileAction` | `{ fullName }` | Auth | Update self; avatar via `/api/avatar` |
| `updateThemeAction` | `{ theme }` | Auth | Update `users.theme` |
| `updateNotificationAction` | `{ enabled }` | Auth | Update `notification_payout` |
| `changePasswordAction` | `{ currentPassword, newPassword }` | Auth | Re-auth lalu update password |

## 3.3 Route Handlers

| Method | Path | Description | Auth | Response |
|---|---|---|---|---|
| GET | `/api/health` | Health check app + DB | Public | `{ status, db, version }` |
| GET | `/api/me` | Profil sesi aktif | Auth | `SessionUser` |
| POST | `/api/avatar` | Upload/hapus avatar (multipart, `remove=true`) | Auth | `{ avatarUrl }` |
| GET | `/api/dashboard?start=&end=` | Metrics role-aware (refresh client) | Auth | JSON metrics |
| GET | `/api/transactions?type=&from=&to=&walletId=&userId=&q=&page=&limit=` | List transaksi | Admin, Karyawan | `Paginated<TransactionSafe>` |
| GET | `/api/transactions/[id]` | Detail transaksi | Admin, Karyawan (own) | `TransactionDetail` |
| GET | `/api/products?q=&operator=&page=&limit=` | Katalog produk | Admin, Karyawan | `Paginated<Product>` |
| GET | `/api/wallets` | List wallet + total aset | Admin | `{ wallets, totalAssets }` |
| GET | `/api/wallets/[id]` | Detail wallet + ringkasan | Admin | `WalletDetail` |
| GET | `/api/payouts?status=&year=&month=&page=&limit=` | Riwayat payout | Admin, Investor | `Paginated<PayoutSummary>` |
| GET | `/api/payouts/[id]` | Receipt payout | Admin, Investor (own) | `PayoutReceipt` |
| GET | `/api/payouts/[id]/status` | Polling status eksekusi | Admin | `{ status, completedAt, failedReason }` |
| GET | `/api/payouts/[id]/pdf` | Unduh PDF payout | Admin, Investor (own) | `application/pdf` |
| GET | `/api/users?q=&role=&page=&limit=` | Direktori user | Admin | `Paginated<UserSummary>` |
| GET | `/api/export/transactions?from=&to=&type=` | Export CSV | Admin | `text/csv` |
| GET | `/auth/confirm?token_hash=&type=` | Tukar token invite/recovery | Public | Redirect |

**Aturan route handler:** gunakan `requireApiRole` (bukan `requireRole`) agar sesi invalid menghasilkan 401/403 JSON, bukan redirect. Setiap handler membungkus response dengan format standar (3.5), menangkap error ke `AppError`, dan menambahkan header `X-Request-ID`. Query string, params, dan body divalidasi Zod (whitelist filter/sort) sebelum menyentuh Supabase. Route `/api/avatar` dan `/api/payouts/[id]/pdf` memakai `export const runtime = "nodejs"` (sharp/PDF tidak jalan di Edge).

## 3.4 Supabase RPC

| Function | Args | Returns | Role | Catatan |
|---|---|---|---|---|
| `create_sale` | `product_id, qty, keterangan, client_request_id` | `jsonb` safe | Admin, Karyawan | Snapshot cost + tambah saldo Cash |
| `create_expense` | `wallet_id, nominal, kategori, keterangan, tanggal, client_request_id` | `jsonb` | Admin, Karyawan | Validasi saldo cukup |
| `transfer_wallet` | `from_id, to_id, nominal, keterangan, client_request_id` | `jsonb` | Admin | Lock dua wallet |
| `adjust_wallet_balance` | `wallet_id, new_balance, reason, client_request_id` | `jsonb` | Admin | Audit `wallet_adjustments` + idempotency |
| `void_transaction` | `transaction_id, reason` | `jsonb` | Admin | Jurnal balik |
| `upsert_product` | `id?, nama, operator, harga_beli, harga_jual` | `jsonb` | Admin | Produk + cost atomik |
| `create_wallet` | `nama, tipe, saldo_awal, is_default` | `jsonb` | Admin | Saldo awal via adjustment |
| `update_wallet` | `id, nama, tipe, is_default` | `jsonb` | Admin | Metadata saja; saldo tidak berubah |
| `toggle_wallet` | `id, is_active` | `jsonb` | Admin | Nonaktif hanya jika saldo 0; default tidak boleh nonaktif |
| `update_payout_settings` | `retained, admin, investor, employee` | `jsonb` | Admin | Validasi sum = 100 |
| `preview_payout` | `start_date, end_date, allocations?` | `jsonb` | Admin | Read-only; default dari settings, override wizard boleh |
| `execute_payout` | `start_date, end_date, wallet_id, allocations, idempotency_key` | `jsonb` | Admin | Atomik + lock + anti duplikat |
| `get_dashboard_metrics` | `start_date, end_date` | `jsonb` | Semua role | Output berbeda per role |
| `get_investor_dividends` | `limit, offset` | `jsonb` | Investor | Hanya item milik sendiri |
| `get_payout_receipt` | `payout_id` | `jsonb` | Admin, Investor (own) | Filter baris investor |
| `current_user_role` / `is_admin` | — | enum/boolean | Internal | Helper RLS |

**Grant:** `revoke execute on function ... from public, anon; grant execute ... to authenticated;` Function wajib `security definer set search_path = public, pg_temp`.
- 15 RPC bisnis: execute hanya untuk `authenticated`.
- Helper `current_user_role` / `is_admin`: execute untuk `authenticated` (dibutuhkan evaluasi RLS), bukan `anon`.
- `build_payout_items`: `revoke execute ... from public, anon, authenticated` (hanya dipanggil dari RPC `security definer`).
- **Cek role wajib menangani NULL:** `current_user_role()` mengembalikan NULL untuk user nonaktif. Gunakan `if not public.is_admin()` (helper sudah `coalesce(..., false)`) atau `if v_role is null or v_role not in (...)`; jangan pernah memakai `v_role not in (...)` tanpa cek NULL karena NULL tidak dianggap true oleh `IF`.
- **Konvensi penamaan:** RPC mengembalikan `jsonb` snake_case (mengikuti kolom DB). Server Action/Route Handler memetakan ke camelCase di boundary (`src/lib/mappers.ts`) sebelum dikirim ke client; tipe domain (`TransactionSafe`, `PayoutSummary`, dst.) memakai camelCase.

## 3.5 Standarisasi Response Format

### Sukses (Route Handler)

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": { "page": 1, "limit": 25, "total": 148, "totalPages": 6 }
}
```

### Error (Route Handler)

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Saldo Cash tidak mencukupi.",
    "details": { "walletId": "uuid", "saldo": 50000, "dibutuhkan": 120000 }
  },
  "meta": null
}
```

### Server Action

```ts
// sukses
{ ok: true, data: { id: "uuid", subtotal: 12000 } }
// gagal
{ ok: false, error: { code: "VALIDATION_ERROR", message: "Periksa kembali input Anda.", fieldErrors: { qty: ["Jumlah minimal 1"] } } }
```

## 3.6 Error Codes

| Code | HTTP | Retryable | Deskripsi |
|---|---|---|---|
| `VALIDATION_ERROR` | 422 | Tidak | Input tidak valid (Zod / CHECK) |
| `UNAUTHORIZED` | 401 | Tidak | Belum login / sesi invalid |
| `FORBIDDEN` | 403 | Tidak | Role tidak punya akses |
| `NOT_FOUND` | 404 | Tidak | Resource tidak ada |
| `CONFLICT` | 409 | Tidak | Duplikat nama/email/periode |
| `INSUFFICIENT_BALANCE` | 422 | Tidak | Saldo wallet kurang |
| `SAME_WALLET` | 422 | Tidak | Wallet asal = tujuan |
| `WALLET_INACTIVE` | 422 | Tidak | Wallet nonaktif |
| `PRODUCT_INACTIVE` | 422 | Tidak | Produk nonaktif |
| `PRODUCT_COST_MISSING` | 422 | Tidak | Harga beli belum diisi |
| `INVALID_MARGIN` | 422 | Tidak | Harga beli melebihi harga jual |
| `DEFAULT_WALLET_MISSING` | 422 | Tidak | Wallet default Cash belum dikonfigurasi |
| `INVALID_ALLOCATION` | 422 | Tidak | Total alokasi ≠ 100% |
| `PAYOUT_PERIOD_OPEN` | 422 | Tidak | Periode belum selesai |
| `HISTORICAL_PERIOD` | 422 | Tidak | Periode memuat transaksi hasil import legacy |
| `DUPLICATE_PAYOUT` | 409 | Tidak | Periode sudah pernah dipayout |
| `PAYOUT_LOSS` | 422 | Tidak | Laba bersih ≤ 0 |
| `PAYOUT_VOID_NOT_SUPPORTED` | 422 | Tidak | Payout tidak bisa di-void langsung |
| `IDEMPOTENCY_CONFLICT` | 409 | Tidak | Key sama, payload berbeda |
| `RATE_LIMITED` | 429 | Ya (setelah delay) | Terlalu banyak request |
| `INTERNAL_ERROR` | 500 | Ya (manual) | Error tak terduga |
| `SERVICE_UNAVAILABLE` | 503 | Ya | Supabase down / circuit open |

## 3.7 Pagination, Filter, Sorting

- **Metode:** page-based.
- **Request:** `?page=1&limit=25` (default 25, max 100).
- **Response meta:** `{ page, limit, total, totalPages }`.
- **Sorting:** `?sort=tanggal&order=desc`; whitelist kolom per resource (`tanggal`, `nominal`, `nama_produk`, `created_at`, `start_date`).
- **Filter transaksi:** `type=income|expense|transfer|payout`, `from`, `to` (ISO date), `walletId`, `userId` (admin only), `q` (cari keterangan/produk).
- **Karyawan:** filter `userId` diabaikan & dipaksa `auth.uid()` + hari ini WIB, walaupun request memanipulasi query.
- **Investor:** `GET /api/payouts` otomatis difilter `payout_items.user_id = auth.uid()`.
- **Cursor-based** tidak dipakai di MVP karena volume konter kecil (<10k transaksi/bulan).

## 3.8 Auth & Role Guard

```
Login → Supabase Auth (email/password)
  → public.users (role, is_active)
  → proxy.ts refresh cookie + redirect
  → (app)/layout.tsx requireRole("admin","karyawan","investor")
  → Page-level requireRole(...) sesuai matriks
  → Server Action withAction(roles) cek sesi + role
  → RLS + RPC role check (last line of defense)
```

- **Page-level guard wajib:** `proxy.ts` hanya coarse (prefix route); setiap page memanggil `requireRole(...)` sesuai matriks Bagian 3.1. Contoh: `/profit-sharing/new` tetap admin-only walau prefix `/profit-sharing` juga boleh investor.
- **Tidak ada self-registration.** User dibuat lewat invite Admin.
- **Invite flow:** `auth.admin.inviteUserByEmail` → insert/upsert `public.users` → user klik link → `/auth/confirm` → set password → login.
- **Deaktivasi:** set `is_active=false`; `current_user_role()` mengembalikan null → semua RLS & RPC menolak. Sesi lama tidak bisa membaca data.
- **Password reset:** `resetPasswordForEmail` → `/auth/confirm?type=recovery` → `updatePasswordAction`.
- **Remember me:** Supabase cookie maxAge 30 hari vs session cookie.
- **Role change:** langsung berlaku di request berikutnya karena role dibaca dari DB, bukan dari JWT claim.

## 3.9 Code Snippets

### `src/lib/action-wrapper.ts`

```ts
import "server-only";
import { ZodError } from "zod";
import * as Sentry from "@sentry/nextjs";
import { AppError, toActionError } from "@/lib/errors";
import { getSessionUser, type SessionUser } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import type { ActionResult, UserRole } from "@/types/domain";

export function withAction<TInput, TOutput>(
  name: string,
  roles: UserRole[],
  schema: { parse: (input: unknown) => TInput },
  handler: (input: TInput, ctx: { user: SessionUser }) => Promise<TOutput>,
) {
  return async (raw: unknown): Promise<ActionResult<TOutput>> => {
    const started = performance.now();
    try {
      // Auth dicek SEBELUM validasi/parsing input.
      const user = await getSessionUser();
      if (!user) {
        return { ok: false, error: { code: "UNAUTHORIZED", message: "Sesi tidak valid. Silakan login ulang." } };
      }
      if (!roles.includes(user.role)) {
        return { ok: false, error: { code: "FORBIDDEN", message: "Anda tidak punya akses ke aksi ini." } };
      }

      const input = schema.parse(raw);
      const data = await handler(input, { user });
      logger.info({ action: name, durationMs: Math.round(performance.now() - started) }, "action_ok");
      return { ok: true, data };
    } catch (error) {
      if (error instanceof ZodError) {
        return {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Periksa kembali input Anda.",
            fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
          },
        };
      }
      if (error instanceof AppError) {
        logger.warn({ action: name, code: error.code }, "action_fail");
        return { ok: false, error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors } };
      }
      Sentry.captureException(error, { tags: { action: name } });
      logger.error({ action: name, err: error }, "action_error");
      return { ok: false, error: toActionError(error) };
    }
  };
}

// Login/reset/password recovery memakai `withPublicAction` (tanpa auth)
// dengan bentuk error yang sama; implementasinya memakai inti error-mapping
// yang sama seperti `withAction`, hanya melewati cek sesi/role.
// Jangan pakai `withAction` untuk route publik.
```

### `src/actions/transactions.ts` — create sale

```ts
"use server";

import { revalidateTag } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withAction } from "@/lib/action-wrapper";
import { AppError } from "@/lib/errors";

const createSaleSchema = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().min(1).max(99),
  description: z.string().trim().max(200).optional(),
  clientRequestId: z.string().uuid(),
});

export const createSaleAction = withAction(
  "transactions.createSale",
  ["admin", "karyawan"],
  createSaleSchema,
  async (input, { user }) => {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.rpc("create_sale", {
      p_product_id: input.productId,
      p_qty: input.qty,
      p_keterangan: input.description ?? null,
      p_client_request_id: input.clientRequestId,
    });

    if (error) throw AppError.fromPostgrest(error);
    revalidateTag(`dashboard:${user.role}:${user.id}`);
    revalidateTag("transactions");
    revalidateTag("wallets");

    const row = data as {
      id: string;
      nama_produk: string;
      qty: number;
      subtotal: number;
      wallet_nama: string;
      tanggal: string;
      duplicate: boolean;
    };
    return {
      id: row.id,
      productName: row.nama_produk,
      qty: row.qty,
      subtotal: row.subtotal,
      walletName: row.wallet_nama,
      tanggal: row.tanggal,
      duplicate: row.duplicate,
    };
  },
);
```

### `src/app/api/transactions/route.ts`

```ts
import { NextResponse, type NextRequest } from "next/server";
import { requireApiRole } from "@/lib/auth/require-role";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { startOfTodayWib } from "@/lib/period";
import { AppError, toApiError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  try {
    const user = await requireApiRole("admin", "karyawan");
    const supabase = await createSupabaseServerClient();
    const params = request.nextUrl.searchParams;

    const page = Math.max(1, Number(params.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 25)));
    const from = (page - 1) * limit;

    let query = supabase
      .from("transactions")
      .select("id, tanggal, tipe, kategori, nominal, walletId:wallet_id, productId:product_id, keterangan, userId:user_id, status", { count: "exact" })
      .order("tanggal", { ascending: false })
      .range(from, from + limit - 1);

    if (user.role === "karyawan") {
      query = query.eq("user_id", user.id).gte("tanggal", startOfTodayWib());
    }
    if (params.get("type")) query = query.eq("tipe", params.get("type")!);

    const { data, error, count } = await query;
    if (error) throw AppError.fromPostgrest(error);

    return NextResponse.json({
      success: true,
      data,
      error: null,
      meta: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) },
    }, { headers: { "X-Request-ID": requestId } });
  } catch (error) {
    const { status, body } = toApiError(error);
    return NextResponse.json(body, { status, headers: { "X-Request-ID": requestId } });
  }
}
```

---

# BAGIAN 4 — Alur Logika & Business Rules

## 4.1 Auth

**Login:**
1. `loginAction` validasi email/password (Zod).
2. `supabase.auth.signInWithPassword`.
3. Jika sukses, ambil `public.users` (role, is_active).
4. Jika `is_active=false` → signOut + error `FORBIDDEN`.
5. Redirect ke `next` atau `/dashboard`.
6. `proxy.ts` me-refresh cookie pada setiap request.

**Invite:**
1. Admin isi email, nama, role, porsi.
2. `supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: APP_URL/auth/confirm })`.
3. Insert/upsert `public.users` (service role, karena belum ada sesi user) dengan id dari response.
4. Jika insert gagal → hapus auth user (compensating action) + error.
5. User klik link → `/auth/confirm` → set password → login.

**Deaktivasi:**
1. `toggleUserAction` set `is_active=false` (tidak boleh diri sendiri).
2. RLS helper `current_user_role()` return null untuk user nonaktif.
3. Semua query/RPC ditolak; sesi lama tidak bisa baca data.

## 4.2 Penjualan (`create_sale`)

1. Client memilih produk dari `products` (hanya `id`, `nama_produk`, `operator`, `harga_jual`).
2. Form mengirim `productId`, `qty`, `keterangan?`, `clientRequestId`.
3. Server Action `withAction` mengecek sesi + role (`admin`/`karyawan`) sebelum validasi Zod.
4. RPC `create_sale`:
   - Cek idempotency `client_request_id`; jika ada → return existing.
   - Cek produk aktif; ambil `harga_beli` dari `product_costs`.
   - Lock wallet default (`Cash`) `FOR UPDATE`.
   - Insert `transactions` (`tipe=income`, snapshot `unit_price`).
   - Insert `transaction_costs` (`unit_cost`, `margin = (harga_jual − harga_beli) × qty`).
   - Update saldo wallet += nominal.
   - Return data aman (tanpa cost/margin).
5. Client menampilkan success sheet; revalidate dashboard/transaksi/wallet.
6. Karyawan **tidak menerima** `harga_beli`, `margin`, atau saldo wallet di response mana pun.

### `create_sale` SQL

```sql
create or replace function public.create_sale(
  p_product_id uuid,
  p_qty integer,
  p_keterangan text,
  p_client_request_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_product public.products;
  v_cost numeric(14,2);
  v_wallet public.wallets;
  v_tx public.transactions;
  v_nominal numeric(14,2);
begin
  -- v_role bisa NULL untuk user nonaktif; jangan pernah loloskan NULL.
  if v_role is null or v_role not in ('admin','karyawan') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_product_id is null or p_client_request_id is null then
    raise exception 'VALIDATION_ERROR:payload' using errcode = '22023';
  end if;

  select * into v_tx from public.transactions
  where client_request_id = p_client_request_id and user_id = auth.uid();
  if found then
    if v_tx.product_id is distinct from p_product_id or v_tx.qty is distinct from p_qty then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    select * into v_product from public.products where id = v_tx.product_id;
    select * into v_wallet from public.wallets where id = v_tx.wallet_id;
    return jsonb_build_object(
      'id', v_tx.id, 'nama_produk', v_product.nama_produk, 'qty', v_tx.qty,
      'subtotal', v_tx.nominal, 'wallet_nama', v_wallet.nama_wallet,
      'tanggal', v_tx.tanggal, 'duplicate', true
    );
  end if;

  if p_qty is null or p_qty < 1 or p_qty > 99 then
    raise exception 'VALIDATION_ERROR:qty' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = p_product_id and is_active = true;
  if not found then raise exception 'PRODUCT_INACTIVE' using errcode = 'P0002'; end if;

  select harga_beli into v_cost from public.product_costs where product_id = p_product_id;
  if v_cost is null then raise exception 'PRODUCT_COST_MISSING' using errcode = 'P0002'; end if;

  select * into v_wallet from public.wallets
  where is_default = true and is_active = true
  for update;
  if not found then raise exception 'DEFAULT_WALLET_MISSING' using errcode = 'P0002'; end if;

  v_nominal := v_product.harga_jual * p_qty;

  insert into public.transactions
    (tipe, kategori, nominal, qty, unit_price, wallet_id, product_id, keterangan, user_id, client_request_id)
  values
    ('income', 'penjualan', v_nominal, p_qty, v_product.harga_jual, v_wallet.id,
     v_product.id, nullif(trim(p_keterangan), ''), auth.uid(), p_client_request_id)
  returning * into v_tx;

  insert into public.transaction_costs (transaction_id, unit_cost, margin)
  values (v_tx.id, v_cost, (v_product.harga_jual - v_cost) * p_qty);

  update public.wallets set saldo = saldo + v_nominal where id = v_wallet.id;

  insert into public.audit_logs (table_name, record_id, action, new_values, actor_id)
  values ('transactions', v_tx.id::text, 'insert', to_jsonb(v_tx), auth.uid());

  return jsonb_build_object(
    'id', v_tx.id,
    'nama_produk', v_product.nama_produk,
    'qty', p_qty,
    'subtotal', v_nominal,
    'wallet_nama', v_wallet.nama_wallet,
    'tanggal', v_tx.tanggal,
    'duplicate', false
  );
exception
  when unique_violation then
    select * into v_tx from public.transactions where client_request_id = p_client_request_id;
    if not found or v_tx.user_id is distinct from auth.uid() then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    if v_tx.product_id is distinct from p_product_id or v_tx.qty is distinct from p_qty then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    select * into v_product from public.products where id = v_tx.product_id;
    select * into v_wallet from public.wallets where id = v_tx.wallet_id;
    return jsonb_build_object(
      'id', v_tx.id, 'nama_produk', v_product.nama_produk, 'qty', v_tx.qty,
      'subtotal', v_tx.nominal, 'wallet_nama', v_wallet.nama_wallet,
      'tanggal', v_tx.tanggal, 'duplicate', true
    );
end;
$$;

revoke execute on function public.create_sale(uuid, integer, text, uuid) from public, anon;
grant execute on function public.create_sale(uuid, integer, text, uuid) to authenticated;
```

## 4.3 Pengeluaran (`create_expense`)

1. Validasi field: tanggal ≤ hari ini WIB, kategori salah satu `operasional | gaji | deviden | lainnya`, nominal > 0, deskripsi 5–200 char.
2. Karyawan: wallet dipaksa ke wallet default Cash; Admin boleh pilih wallet aktif.
3. RPC lock wallet → cek `saldo >= nominal` → insert transaksi `expense` + kurangi saldo → audit.
4. Jika saldo kurang → `INSUFFICIENT_BALANCE`, tidak ada perubahan.
5. Return ringkasan + saldo terbaru (admin) / tanpa saldo (karyawan).
6. Hanya kategori `operasional` yang masuk perhitungan laba bersih; `gaji`/`deviden`/`lainnya` adalah kas keluar non-operasional (tidak mengurangi laba dua kali).

## 4.4 Wallet: Transfer & Penyesuaian

**Transfer (`transfer_wallet`):**
1. Admin only; wallet asal ≠ tujuan; keduanya aktif.
2. Lock kedua wallet **dalam urutan id** (hindari deadlock).
3. Cek saldo asal ≥ nominal.
4. Insert transaksi `transfer` (`wallet_id=from`, `wallet_destination_id=to`).
5. Update saldo asal − nominal, tujuan + nominal.
6. Audit + idempotency.

**Penyesuaian (`adjust_wallet_balance`):**
1. Admin only; alasan wajib ≥10 char; saldo baru ≥0.
2. Hitung delta; jika 0 → `VALIDATION_ERROR`.
3. Update saldo wallet; insert `wallet_adjustments` (old, new, delta, reason, actor, `client_request_id`).
4. Key idempotency sama + payload sama → return existing; payload beda → `IDEMPOTENCY_CONFLICT`.
5. Tidak membuat transaksi income/expense — supaya laba tidak terdistorsi.
6. Audit log.

**Hapus/nonaktif wallet:** hanya jika saldo 0; set `is_active=false`. Wallet default tidak boleh dinonaktifkan.

**Set wallet default:** `create_wallet`/`update_wallet` harus melepas `is_default` wallet lama dan menetapkan yang baru dalam satu transaksi (partial unique index hanya mengizinkan satu default).

**Saldo awal 0:** `create_wallet` tidak membuat baris `wallet_adjustments` (delta 0 melanggar CHECK).

**Audit wallet:** perubahan metadata/status wallet dan `update_payout_settings` dicatat di `audit_logs` (old/new + actor).

## 4.5 Produk

- Create/update lewat RPC `upsert_product` untuk menjaga `products` + `product_costs` atomik. Urutan wajib: update `products.harga_jual` dulu, lalu `product_costs.harga_beli` (trigger margin memeriksa harga terbaru).
- Validasi: nama unik (case-insensitive), harga jual > 0, harga beli ≥ 0, harga jual ≥ harga beli.
- Harga berubah → transaksi lama tetap memakai snapshot (`unit_price` + `transaction_costs.unit_cost`).
- Setiap create/update harga & status produk dicatat di `audit_logs` (old/new).
- Nonaktifkan produk → tidak muncul di picker karyawan, tetap muncul di riwayat.
- Hapus permanen tidak disediakan; hanya nonaktif.

## 4.6 Weekly Profit Sharing

### Formula

```
Gross Margin        = Σ transaction_costs.margin
                      where transactions.tipe='income' AND status='active'
                      AND reversal_of IS NULL AND import_batch_id IS NULL
                      AND tanggal ∈ [start 00:00 WIB, end+1 00:00 WIB)

Operating Expense   = Σ transactions.nominal
                      where tipe='expense' AND kategori='operasional' AND status='active'
                      AND reversal_of IS NULL AND import_batch_id IS NULL
                      AND tanggal ∈ periode

Net Profit          = Gross Margin − Operating Expense

Retained (teoretis) = Net × retained_pct
Admin Dividend      = Net × admin_pct
Investor Pool       = Net × investor_pct
Employee Pool       = Net × employee_pct

Total Cash Out      = Admin Dividend + Investor Pool + Employee Pool
                      (retained tidak memotong wallet)
Retained (aktual)   = Net − Σ amount payout_items
                      (termasuk sisa pembulatan & pool tanpa penerima)
```

### Aturan

- Periode = Senin–Minggu WIB; `end_date = start_date + 6`.
- `payout_settings` adalah **nilai awal** wizard; Admin boleh menyesuaikan di step Alokasi selama total = 100%. `execute_payout` menerima snapshot final `allocations` dan menyimpannya di `payout_history.allocations`; RPC tidak membaca ulang settings.
- Payout hanya bisa dieksekusi jika `end_date < hari ini WIB` dan `net_profit > 0`. Preview boleh untuk periode berjalan; eksekusi ditolak `PAYOUT_PERIOD_OPEN`.
- Periode payout **tidak boleh memuat transaksi hasil import** (`import_batch_id is not null`); histori hanya untuk laporan. Preview & execute sama-sama menolak dengan `HISTORICAL_PERIOD`.
- Satu periode hanya boleh punya satu payout (`UNIQUE(start_date, end_date)`).
- Persentase total harus tepat 100 (kolom `numeric(5,2)`; tidak ada toleransi di DB). Setiap persentase 0–100 dengan maksimal 2 desimal; UI memakai step 1%.
- Pembulatan: pool admin/investor/karyawan di-`floor` dari net profit; retained aktual menyerap seluruh sisa. Di dalam tiap pool, pembagian ke penerima memakai largest remainder (sisa 1 rupiah per fractional terbesar) agar Σ item = pool.
- Pool investor dibagi berdasarkan `default_profit_share` investor aktif.
- Pool karyawan dibagi berdasarkan `default_profit_share` karyawan aktif.
- Pool admin dibagi berdasarkan `default_profit_share` admin aktif; jika hanya 1 admin → 100%.
- Jika total bobot pool = 0 → bagi rata; jika tidak ada penerima → pool ke retained.
- `default_profit_share` adalah **bobot relatif**, bukan persentase laba total.
- Payout membuat satu transaksi `tipe='payout'` per penerima (`kategori=deviden|gaji`) dan memotong wallet sumber. Transaksi payout **tidak** dihitung sebagai opex operasional (agar laba tidak berkurang dua kali).
- Eksekusi payout **sinkron dan atomik**: `execute_payout` mengembalikan payout `status='completed'`. Nilai `processing`/`failed` disiapkan untuk fase 2 (payout async / retry manual); route `/api/payouts/[id]/status` tetap ada dan mengembalikan status final.
- Retained earnings tetap di wallet; dicatat sebagai bagian dari laba yang tidak didistribusikan.

### Alokasi (TypeScript, shared client/server)

```ts
// src/lib/money.ts
export type AllocationPart = { key: string; pct: number };

/**
 * Bagi net profit ke 4 kategori payout. Kategori non-retained di-floor,
 * retained menyerap seluruh sisa pembulatan — sama persis dengan execute_payout.
 */
export function allocateRupiah(total: number, parts: AllocationPart[]): Record<string, number> {
  if (!Number.isInteger(total) || total < 0) throw new Error("total harus integer >= 0");
  if (parts.some((p) => !Number.isFinite(p.pct) || p.pct < 0 || p.pct > 100)) {
    throw new Error("persentase harus 0–100");
  }
  const sumPct = parts.reduce((s, p) => s + p.pct, 0);
  if (Math.abs(sumPct - 100) > 0.01) throw new Error("total persentase harus 100");
  if (!parts.some((p) => p.key === "retained")) throw new Error("alokasi wajib punya key retained");

  const result: Record<string, number> = {};
  let allocated = 0;

  for (const p of parts) {
    if (p.key === "retained") continue;
    const amount = Math.floor((total * p.pct) / 100);
    result[p.key] = amount;
    allocated += amount;
  }

  result.retained = total - allocated;
  return result;
}

/** Bagi pool ke penerima berbobot; bobot 0 semua = bagi rata. */
export function distributePool(pool: number, recipients: { id: string; weight: number }[]): Record<string, number> {
  if (!Number.isInteger(pool) || pool < 0) throw new Error("pool harus integer >= 0");
  if (recipients.length === 0) return {};
  const totalWeight = recipients.reduce((s, r) => s + r.weight, 0);
  if (recipients.some((r) => r.weight < 0)) throw new Error("bobot tidak boleh negatif");
  const weights = totalWeight === 0
    ? recipients.map((r) => ({ ...r, weight: 1 }))
    : recipients;
  const effectiveWeight = totalWeight === 0 ? recipients.length : totalWeight;

  const raw = weights.map((r) => ({ id: r.id, exact: (pool * r.weight) / effectiveWeight }));
  const result: Record<string, number> = {};
  let allocated = 0;
  for (const r of raw) {
    const floor = Math.floor(r.exact);
    result[r.id] = floor;
    allocated += floor;
  }
  let remainder = pool - allocated;
  const order = [...raw].sort((a, b) => {
    const frac = (b.exact % 1) - (a.exact % 1);
    return frac !== 0 ? frac : a.id.localeCompare(b.id);
  });
  for (let i = 0; remainder > 0; i = (i + 1) % order.length, remainder--) {
    result[order[i]!.id] += 1;
  }
  return result;
}
```

### `execute_payout` SQL (inti)

```sql
create or replace function public.execute_payout(
  p_start date,
  p_end date,
  p_wallet_id uuid,
  p_allocations jsonb,          -- {"retained":20,"admin":40,"investor":30,"employee":10}
  p_idempotency_key text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.payout_history;
  v_wallet public.wallets;
  v_gross numeric(14,2);
  v_opex numeric(14,2);
  v_net numeric(14,2);
  v_retained numeric(14,2);
  v_admin_pool numeric(14,2);
  v_investor_pool numeric(14,2);
  v_employee_pool numeric(14,2);
  v_total_out numeric(14,2);
  v_payout public.payout_history;
  v_item record;
  v_tx public.transactions;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_start is null or p_end is null or p_wallet_id is null or p_allocations is null
     or p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'VALIDATION_ERROR:payload' using errcode='22023';
  end if;

  if p_end < p_start or p_end <> p_start + 6 or extract(isodow from p_start) <> 1 then
    raise exception 'VALIDATION_ERROR:periode' using errcode='22023';
  end if;
  if p_end >= (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'PAYOUT_PERIOD_OPEN' using errcode='P0001';
  end if;
  if exists (
    select 1 from public.transactions t
    where t.import_batch_id is not null
      and (t.tanggal at time zone 'Asia/Jakarta')::date between p_start and p_end
  ) then
    raise exception 'HISTORICAL_PERIOD' using errcode='22023';
  end if;
  if jsonb_typeof(p_allocations) <> 'object'
     or not (p_allocations ?& array['retained','admin','investor','employee'])
     or (select count(*) from jsonb_object_keys(p_allocations)) <> 4
     or jsonb_typeof(p_allocations->'retained') <> 'number'
     or jsonb_typeof(p_allocations->'admin') <> 'number'
     or jsonb_typeof(p_allocations->'investor') <> 'number'
     or jsonb_typeof(p_allocations->'employee') <> 'number' then
    raise exception 'INVALID_ALLOCATION' using errcode='22023';
  end if;
  if coalesce((p_allocations->>'retained')::numeric, -1)
     + coalesce((p_allocations->>'admin')::numeric, -1)
     + coalesce((p_allocations->>'investor')::numeric, -1)
     + coalesce((p_allocations->>'employee')::numeric, -1) <> 100
     or (p_allocations->>'retained')::numeric not between 0 and 100
     or (p_allocations->>'admin')::numeric not between 0 and 100
     or (p_allocations->>'investor')::numeric not between 0 and 100
     or (p_allocations->>'employee')::numeric not between 0 and 100 then
    raise exception 'INVALID_ALLOCATION' using errcode='22023';
  end if;

  -- Advisory lock per periode SEBELUM cek duplikat.
  perform pg_advisory_xact_lock(hashtext('payout:' || p_start || ':' || p_end));

  -- Cek retry setelah lock: dua request paralel dengan key sama harus sama-sama sukses.
  select * into v_existing from public.payout_history where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.start_date is distinct from p_start
       or v_existing.end_date is distinct from p_end
       or v_existing.wallet_id is distinct from p_wallet_id
       or v_existing.allocations is distinct from p_allocations then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
    end if;
    return to_jsonb(v_existing);
  end if;

  select * into v_existing from public.payout_history where start_date=p_start and end_date=p_end;
  if found then raise exception 'DUPLICATE_PAYOUT' using errcode='23505'; end if;

  select coalesce(sum(tc.margin),0) into v_gross
  from public.transactions t
  join public.transaction_costs tc on tc.transaction_id = t.id
  where t.tipe='income' and t.status='active' and t.reversal_of is null
    and t.import_batch_id is null
    and (t.tanggal at time zone 'Asia/Jakarta')::date between p_start and p_end;

  select coalesce(sum(t.nominal),0) into v_opex
  from public.transactions t
  where t.tipe='expense' and t.kategori='operasional' and t.status='active'
    and t.reversal_of is null and t.import_batch_id is null
    and (t.tanggal at time zone 'Asia/Jakarta')::date between p_start and p_end;

  v_net := v_gross - v_opex;
  if v_net <= 0 then raise exception 'PAYOUT_LOSS' using errcode='P0001'; end if;

  -- Floor dulu; seluruh sisa pembulatan & pool tanpa penerima masuk retained.
  v_admin_pool    := floor(v_net * (p_allocations->>'admin')::numeric / 100);
  v_investor_pool := floor(v_net * (p_allocations->>'investor')::numeric / 100);
  v_employee_pool := floor(v_net * (p_allocations->>'employee')::numeric / 100);

  -- Bangun item lebih dulu: pool tanpa penerima otomatis menjadi retained earnings.
  drop table if exists pg_temp._payout_items;
  create temp table _payout_items on commit drop as
    select * from public.build_payout_items(v_admin_pool, v_investor_pool, v_employee_pool);

  select coalesce(sum(amount), 0) into v_total_out from _payout_items;

  -- Koreksi pembulatan + pool tanpa penerima masuk retained.
  v_retained := v_net - v_total_out;

  select * into v_wallet from public.wallets where id = p_wallet_id and is_active = true for update;
  if not found then raise exception 'WALLET_INACTIVE' using errcode='P0002'; end if;
  if v_wallet.saldo < v_total_out then raise exception 'INSUFFICIENT_BALANCE' using errcode='P0001'; end if;

  insert into public.payout_history
    (start_date, end_date, gross_margin_total, operating_expense_total, net_profit_total,
     retained_earnings, total_distributed, wallet_id, status, idempotency_key, allocations,
     created_by, completed_at, notes)
  values
    (p_start, p_end, v_gross, v_opex, v_net, v_retained, v_total_out, p_wallet_id,
     'completed', p_idempotency_key, p_allocations, auth.uid(), now(),
     case when v_retained > 0 then 'Retained earnings = porsi retained + sisa pembulatan + pool tanpa penerima.' end)
  returning * into v_payout;

  update public.wallets set saldo = saldo - v_total_out where id = p_wallet_id;

  -- item per penerima: pool admin / investor / karyawan
  for v_item in
    select * from _payout_items
  loop
    insert into public.transactions
      (tipe, kategori, nominal, wallet_id, payout_id, user_id, keterangan, client_request_id)
    values
      ('payout',
       case when v_item.category = 'employee_commission' then 'gaji' else 'deviden' end,
       v_item.amount, p_wallet_id, v_payout.id, v_item.user_id,
       'Payout ' || p_start || ' s/d ' || p_end, gen_random_uuid())
    returning * into v_tx;

    insert into public.payout_items
      (payout_id, user_id, category, weight_pct, amount, transaction_id)
    values
      (v_payout.id, v_item.user_id, v_item.category, v_item.weight_pct, v_item.amount, v_tx.id);
  end loop;

  insert into public.audit_logs (table_name, record_id, action, new_values, actor_id)
  values ('payout_history', v_payout.id::text, 'payout', to_jsonb(v_payout), auth.uid());

  return to_jsonb(v_payout);
exception
  when unique_violation then
    select * into v_existing from public.payout_history where idempotency_key = p_idempotency_key;
    if found then
      if v_existing.start_date is distinct from p_start
         or v_existing.end_date is distinct from p_end
         or v_existing.wallet_id is distinct from p_wallet_id
         or v_existing.allocations is distinct from p_allocations then
        raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
      end if;
      return to_jsonb(v_existing);
    end if;
    raise exception 'DUPLICATE_PAYOUT' using errcode='23505';
end;
$$;
```

### 4.6.1 Helper `build_payout_items`

Helper internal (tidak di-grant ke client) yang membaca penerima aktif per role, membagi tiap pool dengan largest remainder, dan mengembalikan baris siap insert. Pool 0 atau tanpa penerima menghasilkan 0 baris → otomatis masuk retained.

```sql
create or replace function public.build_payout_items(
  p_admin_pool numeric,
  p_investor_pool numeric,
  p_employee_pool numeric
) returns table (
  user_id uuid,
  category public.payout_category,
  weight_pct numeric(5,2),
  amount numeric(14,2)
)
language sql stable security definer
set search_path = public, pg_temp
as $$
with pools(category, pool) as (
  values
    ('admin_dividend'::public.payout_category, p_admin_pool),
    ('investor_dividend'::public.payout_category, p_investor_pool),
    ('employee_commission'::public.payout_category, p_employee_pool)
),
recipients as (
  select u.id,
         case u.role
           when 'admin' then 'admin_dividend'
           when 'investor' then 'investor_dividend'
           else 'employee_commission'
         end::public.payout_category as category,
         u.default_profit_share
  from public.users u
  where u.is_active = true and u.role in ('admin', 'investor', 'karyawan')
),
weighted as (
  select p.category, p.pool, r.id as user_id, r.default_profit_share,
         sum(r.default_profit_share) over (partition by p.category) as total_raw
  from pools p
  join recipients r on r.category = p.category
  where p.pool > 0
),
normalized as (
  select category, pool, user_id,
         case when total_raw = 0 then 1 else default_profit_share end as weight
  from weighted
),
totals as (
  select category, pool, user_id, weight,
         sum(weight) over (partition by category) as total_weight
  from normalized
),
ranked as (
  select category, pool, user_id, weight, total_weight,
         (pool * weight / total_weight) as exact,
         floor(pool * weight / total_weight) as floor_amount,
         row_number() over (
           partition by category
           order by (pool * weight / total_weight) - floor(pool * weight / total_weight) desc,
                    user_id
         ) as rn,
         sum(floor(pool * weight / total_weight)) over (partition by category) as allocated
  from totals
),
final as (
  select user_id, category,
         round(weight / total_weight * 100, 2) as weight_pct,
         floor_amount + case when rn <= (pool - allocated) then 1 else 0 end as amount
  from ranked
)
select user_id, category, weight_pct, amount::numeric(14,2)
from final
where amount > 0;
$$;

revoke execute on function public.build_payout_items(numeric, numeric, numeric) from public, anon, authenticated;
```

**Catatan implementasi:**
- `weight_pct` = porsi penerima terhadap pool-nya (informatif, ditampilkan di receipt).
- Jika `total_raw = 0`, semua penerima aktif di pool tersebut mendapat bobot sama.
- `floor` + sisa 1 rupiah per ranking fractional terbesar menjamin `Σ amount = pool`.
- Fungsi ini murni baca; tidak menulis `payout_items`. Penulisan dilakukan `execute_payout`.
- Preview (`preview_payout`) memakai helper yang sama agar angka preview = eksekusi. Signature: `preview_payout(p_start date, p_end date, p_allocations jsonb default null)`; `null` berarti memakai `payout_settings`. Periode berjalan **boleh** dipreview (untuk screen 11); hanya `execute_payout` yang menolak `PAYOUT_PERIOD_OPEN`.
- `preview_payout` mengembalikan `gross_margin`, `operating_expense`, `net_profit`, `allocations` efektif, `pools` hasil alokasi awal (floor non-retained + retained penyerap sisa), `retained_actual` (= net − Σ amount item; termasuk pool tanpa penerima), `items[]` (`user_id`, `full_name`, `role`, `category`, `weight_pct`, `amount`), dan `warnings[]` (`POOL_NO_RECIPIENT`, `ROUNDING_RETAINED`). Nominal dalam integer rupiah.
- `previewPayoutAction` meneruskan `allocations` opsional dari wizard; jika diisi, angka preview memakai snapshot itu, bukan settings.

## 4.7 Void Transaksi

1. Admin buka detail transaksi → `Batalkan` → alasan ≥10 char.
2. RPC `void_transaction`:
   - Validasi admin, transaksi `status='active'`, bukan payout, bukan reversal, dan bukan transaksi hasil import (`import_batch_id is null`).
   - Lock baris transaksi asal `FOR UPDATE` + lock wallet terkait; unique index `reversal_of` menjadi backstop anti double-void.
   - Buat transaksi baru `reversal_of = original.id` dengan nominal, qty, product, dan unit_price sama; arah saldo berlawanan.
   - Untuk income: saldo wallet − nominal; copy `transaction_costs` dengan `margin` negatif (unit_cost tetap).
   - Untuk expense: saldo wallet + nominal.
   - Untuk transfer: tukar `wallet_id` ↔ `wallet_destination_id`; nominal sama.
   - Set original `status='void'`.
   - Insert audit log dengan alasan.
3. **Aturan agregat:** semua laporan finansial (dashboard, preview/execute payout, export) mengabaikan transaksi `status='void'` **dan** baris reversal (`reversal_of is not null`). Reversal hanya untuk mengembalikan saldo wallet + jejak audit; bukan pendapatan/biaya baru. Dengan begitu void menghasilkan efek net 0 tanpa double-count.
4. Di list transaksi, reversal tampil dengan badge "Pembatalan" dan tautan ke transaksi asal; nominal tidak dijumlahkan ke total omzet/laba.
5. Payout tidak bisa di-void langsung (butuh fitur reversal payout di fase 2).
6. Transaksi historis hasil import tidak bisa di-void karena tidak pernah memutasi saldo wallet; koreksi data historis dilakukan lewat `adjust_wallet_balance` dengan alasan, atau perbaikan sebelum go-live.

## 4.8 Manajemen Pengguna

- Invite hanya Admin; role + porsi disimpan di `public.users`.
- Update role/porsi langsung berlaku; transaksi historis tidak berubah.
- Nonaktifkan diri sendiri diblokir; admin terakhir tidak boleh diturunkan role-nya.
- Nonaktifkan user tidak menghapus data historis.
- `default_profit_share` hanya dipakai saat payout; bukan akses.
- Admin bisa mengubah porsi investor/karyawan kapan saja; payout berikutnya memakai nilai terbaru.
- Perubahan role, porsi, dan status aktif user dicatat di `audit_logs` (old/new + actor).

## 4.9 Dashboard Metrics

`get_dashboard_metrics(p_start, p_end)` mengembalikan JSON berbeda per role:

| Role | Data |
|---|---|
| **Admin** | grossMargin, operatingExpense, netProfit, totalAssets, transactionCount, series (7/30 hari), recentTransactions (5), payoutReady (bool), payoutPeriod |
| **Karyawan** | myTransactionCountToday, mySalesToday, myProductsSoldToday, mySeries7d (count), lastTransactions (5 miliknya) |
| **Investor** | grossProfit, netProfit, totalAssets (agregat), lastDividend, series, payoutHistoryMini (miliknya) |

**Aturan:** Karyawan tidak menerima field finansial dalam payload — bukan hanya disembunyikan di UI. Investor tidak menerima saldo per wallet. Semua agregat memakai `status='active' AND reversal_of IS NULL`; transaksi void & reversal tidak dihitung. Agregat laba/margin juga mengecualikan `import_batch_id IS NOT NULL` (histori hanya untuk omzet/list/export).

## 4.10 Business Rules (Ringkas)

| # | Rule | Sumber |
|---|---|---|
| 1 | Karyawan tidak boleh melihat harga beli, margin, profit, total aset, saldo wallet | PRD §3 |
| 2 | Karyawan hanya bisa input transaksi & melihat transaksi miliknya hari ini | PRD §3, §6 |
| 3 | Investor read-only: dashboard, total aset, laba rugi, deviden sendiri | PRD §3 |
| 4 | Penjualan otomatis menambah saldo wallet Cash | PRD §4B |
| 5 | Margin produk dihitung `harga_jual − harga_beli` real-time | PRD §4C |
| 6 | Wallet CRUD + transfer + penyesuaian hanya Admin | PRD §4D |
| 7 | Laba bersih = margin penjualan − beban operasional | PRD §4E |
| 8 | Alokasi payout: retained, admin, investor, karyawan (total 100%) | PRD §4E |
| 9 | Payout memotong wallet + membuat transaksi `payout` per penerima + menyimpan history | PRD §4E |
| 10 | Tidak ada delete transaksi; void dengan reversal | DESIGN Screen 06 |
| 11 | Produk & wallet dinonaktifkan, bukan dihapus | DESIGN Screen 07/08 |
| 12 | Semua nominal Rupiah integer, tanpa desimal | DESIGN Appendix C |
| 13 | Periode mingguan Senin–Minggu WIB | DESIGN Bagian 0 |
| 14 | Satu periode = satu payout | Tech spec |
| 15 | Retained earnings tidak memotong wallet | Tech spec |
| 16 | Semua mutasi wajib idempotent | Tech spec |
| 17 | Agregat finansial mengabaikan transaksi void & baris reversal | Tech spec |
| 18 | Payout hanya boleh dieksekusi setelah periode tertutup & net profit > 0 | Tech spec |
| 19 | Self-update user tidak boleh mengubah role/porsi/status/email | Tech spec |

## 4.11 Error Handling & Retry Strategy

### Global Error Middleware

- **Server Action:** `withAction` menangkap ZodError, AppError, PostgrestError, unknown → `ActionResult`.
- **Route Handler:** `withRoute` wrapper → JSON standar + `X-Request-ID`.
- **RSC page:** `error.tsx` per route group + `global-error.tsx`; `not-found.tsx`; `forbidden.tsx`.
- **PostgrestError mapping:** `src/lib/errors.ts` memetakan `code` + `message` ke `ErrorCode`.
- **Sentry:** semua error tak terduga dikirim dengan tag `action`, `route`, `role`, `requestId`.
- **Log:** JSON via pino, tanpa PII sensitif (email di-mask, nominal tidak di-log penuh).

### Retry Mechanism

| Operasi | Max retry | Backoff | Timeout |
|---|---|---|---|
| GET data (client fetch) | 3 | exponential 300ms → 900ms → 2.7s + jitter | 10s/attempt |
| Server Action mutation | 0 (user retry manual) | — | 30s |
| Payout polling (fase 2 / timeout) | 30 poll | fixed 2s | 60s total |
| PDF generation | 1 | 1s | 30s |
| Supabase health check | 2 | 500ms | 5s |

> Mutasi **tidak** di-retry otomatis dari client karena bisa menggandakan efek. Idempotency key membuat retry manual aman.

### Circuit Breaker

- Implementasi `src/lib/resilience.ts` (per-instance, best-effort di serverless):
  - Threshold: 5 kegagalan dalam 10 detik → open.
  - Open duration: 30 detik.
  - Half-open: 1 request percobaan; sukses → close, gagal → open lagi.
- Dipakai hanya untuk **read path** (dashboard/list). Mutasi langsung fail fast.
- Fallback: dashboard memakai cache terakhir (`revalidate 30s`) + banner "data terakhir"; list transaksi **tidak** memakai cache (akurasi finansial); payout tidak pernah fallback.

### Fallback per Fitur

| Fitur | Primary | Fallback | Degradasi |
|---|---|---|---|
| Dashboard | RPC `get_dashboard_metrics` | Cache 30s terakhir | Banner data terakhir |
| Transaksi list | Query RLS | — | Error + retry |
| Produk | Query RLS | Cache 60s | Katalog bisa stale |
| Wallet | Query RLS | Cache 30s | Banner data terakhir |
| Payout preview | RPC | — | Error + retry; tidak boleh pakai angka lama |
| Payout execute | RPC | — | Fail fast; polling status hanya jika request timeout/tidak diketahui |
| PDF | Generate on-demand | — | Toast error + retry |

### Idempotency

- Client membuat `crypto.randomUUID()` sekali per form session (bukan per klik).
- Dikirim sebagai `clientRequestId` / `Idempotency-Key`.
- Unique constraint di `transactions.client_request_id` dan `payout_history.idempotency_key`.
- RPC mengembalikan record existing dengan `duplicate: true` jika key sama dan payload sama.
- Jika key sama tapi payload berbeda → `IDEMPOTENCY_CONFLICT`; perbandingan dilakukan di RPC (bukan hanya di UI) agar retry paralel tetap aman.
- Key milik user lain tidak boleh mengembalikan data: query idempotency untuk `create_sale`/`create_expense` selalu difilter `user_id = auth.uid()`; key bentrok antar-user diperlakukan sebagai conflict.

## 4.12 Code Snippets — Periode WIB

```ts
// src/lib/period.ts
import { TZDate } from "@date-fns/tz";
import { addDays, formatISO, startOfWeek } from "date-fns";

export const WIB = "Asia/Jakarta";

export function todayWib(): TZDate {
  return TZDate.tz(WIB);
}

export function weekBounds(date: Date = todayWib()) {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = addDays(start, 6);
  return { start: formatISO(start, { representation: "date" }), end: formatISO(end, { representation: "date" }) };
}

export function isPeriodClosed(endDate: string): boolean {
  const today = formatISO(todayWib(), { representation: "date" });
  return endDate < today;
}

export function startOfTodayWib(): string {
  const now = todayWib();
  const start = new TZDate(
    now.getFullYear(), now.getMonth(), now.getDate(),
    0, 0, 0, 0, WIB,
  );
  return start.toISOString();
}
```

---

# BAGIAN 5 — Keamanan, Performa, CI/CD & Deployment

## 5.1 Keamanan

### Auth & Otorisasi Berlapis

| Layer | Kontrol |
|---|---|
| 1. Edge | `proxy.ts` refresh sesi + redirect route terlarang |
| 2. Layout | `(app)/layout.tsx` memanggil `requireRole("admin","karyawan","investor")` |
| 3. Server Action | `withAction` cek sesi + role sebelum parsing/validasi |
| 4. RPC | `current_user_role()` / `is_admin()` di dalam function |
| 5. RLS | Policy per tabel, deny-by-default |
| 6. Database privilege | `revoke insert/update/delete` untuk tabel finansial; cost table admin-only |

**Prinsip:** UI hiding bukan security. Karyawan yang memanggil PostgREST langsung tetap tidak bisa membaca `product_costs`, `transaction_costs`, `wallets`, atau transaksi orang lain.

### Kontrol Spesifik

- **Service role key** hanya di server (`server-only`), tidak pernah di bundle client atau `NEXT_PUBLIC_*`.
- **Session cookie** httpOnly, secure, sameSite=lax, path `/`; refresh di proxy.
- **CSRF:** Server Actions memakai origin check bawaan Next; route handler mutasi (jika ada) memvalidasi `Origin`/`Sec-Fetch-Site`.
- **XSS:** React auto-escape; tidak ada `dangerouslySetInnerHTML` untuk input user; CSP ketat.
- **SQL injection:** semua query lewat PostgREST parameterized atau RPC; tidak ada string SQL dari input.
- **Input validation:** Zod di client + server; CHECK constraint di DB sebagai lapisan akhir.
- **Rate limiting:** Supabase Auth built-in untuk login/reset; Vercel WAF rule untuk `/login` (max 20 req/menit/IP) dan Server Actions sensitif (payout, invite).
- **Password:** min 8 char, kombinasi huruf+angka; reset via Supabase; tidak pernah di-log.
- **Invite:** token sekali pakai; email harus cocok; user tanpa invite tidak bisa daftar.
- **Avatar upload:** max 2MB, MIME allowlist (`image/jpeg`, `image/png`, `image/webp`), validasi magic bytes, re-encode 512×512 WebP dengan `sharp`, bucket `avatars` public read (foto profil non-sensitif) + cache 1 jam. Storage write policy: user hanya bisa upload/update/hapus folder `{uid}/`; admin read all. `users.avatar_url` menyimpan public URL; `POST /api/avatar` dengan `remove=true` menghapus object dan mengosongkan kolom.
- **Audit:** `audit_logs` untuk create/void/payout/adjustment; `wallet_adjustments` immutable (no update/delete policy).
- **Least privilege:** RPC `SECURITY DEFINER` wajib `set search_path = public, pg_temp`; grant hanya `authenticated`; fungsi internal (`build_payout_items`) tidak di-grant ke client.
- **Deaktivasi user:** `current_user_role()` null → RLS & RPC menolak; sesi lama tidak bisa baca data.
- **Backup:** Supabase daily backup + PITR (Pro plan); retention 7 hari minimum.
- **Dependency:** Dependabot + `bun audit --audit-level=high` di CI; lockfile wajib commit.
- **Headers:** CSP, HSTS (Vercel), X-Frame-Options DENY, nosniff, Referrer-Policy.
- **Logging PII:** email di-mask (`t***@domain.com`); nominal tidak di-log per transaksi; hanya aggregate & ID.

### RLS Test Wajib

| Test | Ekspektasi |
|---|---|
| Karyawan select `product_costs` | 0 rows / permission denied |
| Karyawan select `transaction_costs` | 0 rows / permission denied |
| Karyawan select transaksi user lain | 0 rows |
| Karyawan select transaksi sendiri kemarin | 0 rows (hanya hari ini) |
| Karyawan select `wallets` | 0 rows / permission denied |
| Investor select `payout_items` orang lain | 0 rows |
| Investor select `payout_history` tanpa item sendiri | 0 rows |
| Admin select semua | semua rows |
| User nonaktif select apa pun | 0 rows / permission denied |
| Direct insert transaksi via PostgREST | permission denied |

## 5.2 Performa

### Target

| Metrik | Target | Catatan |
|---|---|---|
| LCP (p75, 4G) | < 2.5s | Dashboard mobile |
| INP | < 200ms | Form & navigasi |
| CLS | < 0.1 | Skeleton menjaga layout |
| TTFB | < 500ms | Region sin1 |
| API P95 | < 500ms | List & detail |
| Payout preview P95 | < 800ms | Agregat 1 minggu |
| Payout execute P95 | < 3s | Lock + insert |
| DB query P95 | < 100ms | Dengan index |
| JS initial bundle | < 180KB gzip | Dashboard route |
| Error rate | < 1% | 5xx < 0.1% |

### Strategi

- **RSC + Suspense** per section dashboard (hero, chart, list) — tidak blocking satu sama lain.
- **Server-side pagination** 25 row; tidak ada `select *` untuk list besar.
- **Index** sesuai 2.6; period filter memakai expression index WIB.
- **Agregat di SQL** (`get_dashboard_metrics`, `preview_payout`) — bukan loop di JS.
- **Chart lazy-load:** `next/dynamic(() => import("@/components/dashboard/trend-chart"), { ssr: false })`.
- **Lucide** tree-shaken per icon import; **date-fns** per function import.
- **Font:** `next/font/local` untuk Inter variable; `display: swap`; preload hanya weight 400/600/700.
- **Image:** `next/image` untuk avatar; width/height eksplisit; lazy by default.
- **Cache:** dashboard 30s, produk 60s, wallet 30s; revalidate per mutation.
- **Connection:** supabase-js via HTTPS (Supavisor), tidak ada koneksi Postgres langsung dari Vercel.
- **Payout:** agregasi memakai index + filter `status='active'`; jika volume >100k transaksi/bulan, tambah materialized view `daily_profit_summary` (fase 2).
- **Bundle analysis:** `ANALYZE=true bun run build` sebelum rilis besar.
- **Load test:** script k6 untuk 50 VU login + dashboard + preview payout; target P95 sesuai tabel.

## 5.3 CI/CD Pipeline

**Branch Strategy:** Trunk-based dengan short-lived feature branch (`feat/...`, `fix/...`), `main` protected. PR wajib lulus CI + 1 review.

| Stage | Trigger | Actions |
|---|---|---|
| **Build** | Push ke branch apa pun | `bun install --frozen-lockfile` → lint → typecheck → unit test → build |
| **Test** | PR ke `main` | Supabase start + db reset + pgTAP + integration + Playwright (chromium) |
| **Preview** | PR dibuka/update | Vercel preview deploy + smoke test |
| **Staging** | Merge ke `main` | Migrate staging (`supabase db push`) → deploy staging → smoke test |
| **Production** | Manual approval (GitHub Environment) | Backup check → migrate production → deploy production → smoke test + payout dry-run |

### GitHub Actions — `.github/workflows/ci.yml`

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.4
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run typecheck
      - run: bun run test:unit -- --coverage
      - run: bun run check-env
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_ROLE_KEY }}
          NEXT_PUBLIC_APP_URL: http://localhost:3000
          AUTH_REDIRECT_URL: http://localhost:3000/auth/confirm
      - run: bun run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_ROLE_KEY }}
          NEXT_PUBLIC_APP_URL: http://localhost:3000
          AUTH_REDIRECT_URL: http://localhost:3000/auth/confirm

  database:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: supabase/setup-cli@v1
        with:
          version: 3.0.0
      - run: supabase start
      - run: supabase db reset
      - run: supabase test db
      - run: bun install --frozen-lockfile
      - run: bun run test:integration
        env:
          TEST_SUPABASE_URL: http://127.0.0.1:54321
          TEST_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
          TEST_SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_ROLE_KEY }}

  e2e:
    runs-on: ubuntu-latest
    needs: [quality, database]
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.4
      - uses: supabase/setup-cli@v1
        with:
          version: 3.0.0
      - run: supabase start
      - run: supabase db reset
      - run: bun install --frozen-lockfile
      - run: bunx playwright install --with-deps chromium
      - run: bun run test:e2e
        env:
          PLAYWRIGHT_BASE_URL: http://127.0.0.1:3000
          NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_ROLE_KEY }}
          NEXT_PUBLIC_APP_URL: http://127.0.0.1:3000

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.4
      - run: bun install --frozen-lockfile
      - run: bun audit --audit-level=high
```

### Deployment Workflow — `.github/workflows/deploy.yml`

```yaml
name: deploy

on:
  push:
    branches: [main]

jobs:
  staging:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.4
      - uses: supabase/setup-cli@v1
        with:
          version: 3.0.0
      - run: bun install --frozen-lockfile
      - run: supabase link --project-ref "$STAGING_PROJECT_REF"
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          STAGING_PROJECT_REF: ${{ secrets.STAGING_PROJECT_REF }}
      - run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.STAGING_DB_PASSWORD }}
      - run: curl -fsS -X POST "$VERCEL_STAGING_DEPLOY_HOOK"
        env:
          VERCEL_STAGING_DEPLOY_HOOK: ${{ secrets.VERCEL_STAGING_DEPLOY_HOOK }}
      - run: bun run smoke:staging
        env:
          SMOKE_BASE_URL: ${{ secrets.STAGING_APP_URL }}
          SMOKE_ADMIN_EMAIL: ${{ secrets.SMOKE_ADMIN_EMAIL }}
          SMOKE_ADMIN_PASSWORD: ${{ secrets.SMOKE_ADMIN_PASSWORD }}

  production:
    runs-on: ubuntu-latest
    needs: staging
    environment: production   # manual approval
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.4
      - uses: supabase/setup-cli@v1
        with:
          version: 3.0.0
      - run: bun install --frozen-lockfile
      - run: supabase link --project-ref "$PROD_PROJECT_REF"
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          PROD_PROJECT_REF: ${{ secrets.PROD_PROJECT_REF }}
      - run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.PROD_DB_PASSWORD }}
      - run: curl -fsS -X POST "$VERCEL_PROD_DEPLOY_HOOK"
        env:
          VERCEL_PROD_DEPLOY_HOOK: ${{ secrets.VERCEL_PROD_DEPLOY_HOOK }}
      - run: bun run smoke:production
        env:
          SMOKE_BASE_URL: ${{ secrets.PRODUCTION_APP_URL }}
          SMOKE_ADMIN_EMAIL: ${{ secrets.SMOKE_ADMIN_EMAIL }}
          SMOKE_ADMIN_PASSWORD: ${{ secrets.SMOKE_ADMIN_PASSWORD }}
```

> Vercel Git integration menangani build & preview otomatis. Deploy hook dipakai untuk memicu build setelah migrasi selesai (urutan: DB dulu, app kedua).

### Rollback Strategy

| Komponen | Langkah | Verifikasi |
|---|---|---|
| **Code** | `vercel rollback <deployment-url>` atau revert commit + push | Health check + login + dashboard |
| **Database** | Restore PITR ke timestamp sebelum migrasi; atau forward-fix migration | `supabase db diff` clean + smoke test |
| **Env** | Rollback env di Vercel dashboard | Redeploy |
| **Payout salah** | Tidak ada rollback otomatis; buat reversal payout manual (fase 2) + audit | Cek saldo & payout_items |

**Aturan migrasi:** jangan pernah edit migration yang sudah diterapkan. Rollback database produksi hanya lewat PITR (bukan `drop table` manual).

## 5.4 Deployment

### Prasyarat

- 2 project Supabase: `peppycell-staging`, `peppycell-production` (region `ap-southeast-1`).
- 1 project Vercel dengan 3 environment: Preview, Staging, Production.
- Domain production + wildcard preview.
- Vercel region `sin1`.
- Supabase Auth: email provider aktif, SMTP production (Resend/Postmark), redirect URL `https://app.domain/auth/confirm`.
- RLS + migration dijalankan sebelum deploy app baru.

### Urutan Deploy Pertama

1. Buat project Supabase production + staging.
2. Aktifkan backup harian + PITR di project production **sebelum** migrasi pertama.
3. `supabase link` + `supabase db push` ke staging.
4. Seed admin pertama via script `bun run seed:admin`.
5. Set env Vercel (Bagian 7).
6. Deploy app ke staging → smoke test 3 role.
7. Migrate production → seed admin → deploy production.
8. Set alert Sentry + Vercel.

### Smoke Test Wajib (Production)

- Login admin, karyawan, investor.
- Karyawan catat penjualan → saldo Cash naik, transaksi muncul.
- Admin catat pengeluaran → saldo turun.
- Transfer antar wallet → dua saldo berubah.
- Preview payout periode lalu → angka cocok dengan query manual.
- Execute payout di staging dengan data demo → receipt + saldo + jurnal.
- Investor hanya melihat deviden sendiri (cek via akun investor).
- 403 saat karyawan buka `/wallets`.
- Dark mode + mobile 375px.

## 5.5 Development Setup

```bash
# 1. Prasyarat
node --version        # >= 24
bun --version         # 1.4.4
supabase --version    # 3.0.0

# 2. Install
bun install

# 3. Env
cp .env.example .env.local
# isi NEXT_PUBLIC_SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY

# 4. Supabase lokal
supabase start
supabase db reset

# 5. Generate types
bun run db:types

# 6. Dev server
bun run dev            # http://localhost:3000

# 7. Seed demo
bun run seed:demo

# 8. Test
bun run test:unit
bun run test:integration
bun run test:e2e

# 9. Lint & typecheck
bun run lint
bun run typecheck
```

**Script `package.json` (ringkas):**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run",
    "test:integration": "vitest run --config vitest.integration.ts",
    "test:e2e": "playwright test",
    "db:types": "supabase gen types typescript --local --schema public > src/types/database.ts",
    "db:push": "supabase db push",
    "check-env": "bun scripts/check-env.ts",
    "seed:admin": "bun scripts/seed-admin.ts",
    "seed:demo": "bun scripts/seed-demo.ts",
    "import:legacy": "bun scripts/import-legacy.ts",
    "smoke:staging": "bun scripts/smoke.ts --env=staging",
    "smoke:production": "bun scripts/smoke.ts --env=production"
  }
}
```

---

# BAGIAN 6 — Monitoring & Observability

## 6.1 Ringkasan

| Area | Tool | Tujuan |
|---|---|---|
| Error tracking | Sentry | Exception, stack trace, release health |
| Performance | Sentry Performance + Vercel Speed Insights | Trace RSC/action/RPC, web vitals |
| Analytics | Vercel Analytics | Page views, device, region |
| Infra logs | Vercel Logs (runtime) | Function logs, build logs |
| DB/Auth logs | Supabase Logs | Postgres slow query, Auth failures |
| Log aggregation | Axiom (opsional) | Pino JSON terpusat, retention 30 hari |
| Uptime | Vercel Monitoring + `/api/health` | Availability & latency |
| Business | Dashboard internal (fase 2) | Payout success, transaksi harian |

## 6.2 Logging

**Format:** JSON structured via pino.

```json
{
  "level": "info",
  "time": "2026-11-09T07:30:00.000Z",
  "requestId": "8f2a...",
  "userId": "uuid",
  "role": "admin",
  "action": "payout.execute",
  "route": "/profit-sharing/new",
  "durationMs": 1840,
  "status": "ok",
  "payoutId": "uuid",
  "period": "2026-11-03/2026-11-09"
}
```

| Level | Dipakai untuk |
|---|---|
| `debug` | Detail query (dev only) |
| `info` | Action sukses, login, payout preview |
| `warn` | Validasi gagal, saldo kurang, retry, circuit open |
| `error` | Exception tak terduga, RPC gagal, PDF gagal |
| `fatal` | Supabase tidak bisa dihubungi saat startup |

**Aturan:**
- Setiap request/action punya `requestId` (dari header `X-Request-ID` atau generated).
- Jangan log password, token, email penuh, nominal per penerima, atau isi cookie.
- Email di-mask: `t***@domain.com`.
- Retention: Vercel 7 hari (plan default), Axiom 30 hari (jika aktif).
- Log payout: `payoutId`, periode, total aggregate, durasi, status — bukan breakdown per orang.

## 6.3 Metrics

| Metric | Target | Warning | Critical |
|---|---|---|---|
| Request rate | baseline | — | — |
| Error rate (5xx) | < 0.1% | > 0.5% | > 2% |
| Action error rate | < 1% | > 2% | > 5% |
| Latency P50 | < 200ms | > 400ms | > 800ms |
| Latency P95 | < 500ms | > 1s | > 2s |
| Latency P99 | < 1s | > 2s | > 4s |
| Payout execute P95 | < 3s | > 5s | > 10s |
| DB query P95 | < 100ms | > 250ms | > 500ms |
| DB connections | < 70% pool | > 80% | > 95% |
| Supabase CPU | < 60% | > 75% | > 90% |
| Vercel function errors | < 1% | > 2% | > 5% |
| Login failure rate | < 5% | > 10% | > 25% |
| LCP p75 | < 2.5s | > 3s | > 4s |
| INP p75 | < 200ms | > 350ms | > 500ms |
| CLS p75 | < 0.1 | > 0.15 | > 0.25 |

**Business metrics (Sentry custom / Axiom):**
- Jumlah transaksi per jam (admin).
- Payout sukses/gagal per minggu.
- Saldo total aset (harian, aggregate).
- Jumlah karyawan aktif input hari ini.
- Rata-rata waktu input penjualan (client timing).

## 6.4 Distributed Tracing

- **Tool:** Sentry Performance (OpenTelemetry-compatible).
- **Trace propagation:** `sentry-trace` + `baggage` headers dari browser → Next server → Supabase RPC (custom span).
- **Sampling:** 100% error, 10% transaksi sukses, 100% payout execute/preview.
- **Span wajib:** `action.createSale`, `rpc.create_sale`, `rpc.preview_payout`, `rpc.execute_payout`, `pdf.generate`, `auth.login`.
- **Request ID:** `X-Request-ID` dibuat di proxy/handler, diteruskan ke log & Sentry tag.

## 6.5 Alerting

| Alert | Condition | Channel | Priority |
|---|---|---|---|
| Error rate spike | 5xx > 2% selama 5 menit | Slack #peppycell-alerts + email | Critical |
| Payout gagal | Setiap `payout_failed` / status failed | Slack + email admin | Critical |
| Health check fail | `/api/health` non-200 2× berturut | Slack + PagerDuty (opsional) | Critical |
| DB slow query | P95 > 500ms selama 10 menit | Slack | Warning |
| Auth failure spike | Login gagal > 25% selama 5 menit | Slack | Warning |
| Sentry new issue | Error group baru di production | Slack | Warning |
| Vercel deploy fail | Build/deploy gagal | Slack + email | Warning |
| Supabase CPU/storage | > 80% selama 15 menit | Email | Warning |
| Backup fail | Backup harian gagal | Email | Critical |

## 6.6 Error Tracking (Sentry)

- **Setup:** `@sentry/nextjs` di `instrumentation.ts` (server + edge) dan `instrumentation-client.ts`.
- **Release:** `SENTRY_RELEASE` = commit SHA; source maps di-upload saat deploy.
- **Alert rules:** new issue, regression, error spike, payout failure tag.
- **PII:** `sendDefaultPii: false`; scrub email/nominal; `beforeSend` filter.
- **Tags:** `role`, `route`, `action`, `payoutId`, `requestId`.
- **User context:** `{ id, role }` — tanpa email/nama.

## 6.7 Dashboard

**Vercel + Sentry (MVP):**

| Panel | Isi |
|---|---|
| Overview | Request rate, 5xx rate, P95 latency, error count |
| Web Vitals | LCP/INP/CLS per route |
| Actions | Top action by duration & error |
| Payout | Preview duration, execute duration, success/fail count |
| Auth | Login success/fail, reset request |
| DB | Slow queries, connection count, storage |
| Deployment | Build duration, deploy status, release |

**Grafana/Axiom (opsional fase 2):** panel bisnis (transaksi/jam, laba mingguan, total aset) + alert threshold.

## 6.8 SLO

| SLO | Target | Measurement |
|---|---|---|
| Availability app | 99.9% / bulan | `/api/health` + Vercel |
| Payout success | 100% (0 kegagalan tanpa audit) | `payout_history.status` |
| Login success | > 95% (bukan salah password) | Auth logs |
| Data freshness dashboard | ≤ 30 detik | Cache + revalidate |
| RPO | ≤ 5 menit (PITR) | Supabase backup |
| RTO | ≤ 1 jam | Runbook restore |

---

# BAGIAN 7 — Environment Variables

## 7.1 App Config

| Variable | Deskripsi | Contoh | Scope |
|---|---|---|---|
| `NODE_ENV` | Mode runtime | `production` | Server |
| `NEXT_PUBLIC_APP_URL` | Base URL aplikasi | `https://app.peppycell.id` | Client + server |
| `NEXT_PUBLIC_APP_NAME` | Nama app | `PeppyCell` | Client |
| `TZ` | Zona waktu proses | `Asia/Jakarta` | Server |
| `LOG_LEVEL` | Level pino | `info` | Server |
| `NEXT_PUBLIC_ENABLE_CSV_EXPORT` | Feature flag export | `true` | Client |

## 7.2 Supabase

| Variable | Deskripsi | Contoh | Scope |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase | `https://xxxx.supabase.co` | Client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (RLS) | `eyJ...` | Client + server |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (server only) | `eyJ...` | Server |
| `SUPABASE_DB_URL` | Koneksi migration (direct/session pooler, bukan transaction pooler 6543) | `postgresql://postgres.xxx:pass@...:5432/postgres` | CI/local |
| `SUPABASE_PROJECT_ID` | Project ref | `abcdefghijklm` | CI/local |
| `SUPABASE_ACCESS_TOKEN` | Token CLI (CI only) | `sbp_...` | CI |
| `SUPABASE_DB_PASSWORD` | Password DB (CI only) | `...` | CI |

## 7.3 Auth / Email

| Variable | Deskripsi | Contoh | Scope |
|---|---|---|---|
| `AUTH_REDIRECT_URL` | Redirect invite/recovery | `https://app.peppycell.id/auth/confirm` | Server |
| `RESEND_API_KEY` | SMTP/email provider (opsional) | `re_...` | Server |

> Supabase Auth production wajib memakai SMTP kustom; email default Supabase dibatasi untuk testing.

## 7.4 Monitoring

| Variable | Deskripsi | Contoh | Scope |
|---|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | DSN client | `https://xxx@o0.ingest.sentry.io/1` | Client |
| `SENTRY_DSN` | DSN server | `https://xxx@o0.ingest.sentry.io/1` | Server |
| `SENTRY_ORG` | Organisasi Sentry | `peppycell` | Build |
| `SENTRY_PROJECT` | Project Sentry | `web` | Build |
| `SENTRY_AUTH_TOKEN` | Upload source maps | `sntrys_...` | Build |
| `AXIOM_TOKEN` | Token Axiom (opsional) | `xaat-...` | Server |
| `AXIOM_DATASET` | Dataset Axiom | `peppycell-prod` | Server |

## 7.5 Testing / CI

| Variable | Deskripsi | Contoh | Scope |
|---|---|---|---|
| `TEST_SUPABASE_URL` | Supabase lokal CI | `http://127.0.0.1:54321` | CI |
| `TEST_SUPABASE_ANON_KEY` | Anon key lokal | `...` | CI |
| `TEST_SUPABASE_SERVICE_ROLE_KEY` | Service key lokal | `...` | CI |
| `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` | Akun seed E2E | `admin@peppycell.local` | CI |
| `TEST_KASIR_EMAIL` / `TEST_KASIR_PASSWORD` | Akun seed E2E | `kasir@peppycell.local` | CI |
| `TEST_INVESTOR_EMAIL` / `TEST_INVESTOR_PASSWORD` | Akun seed E2E | `investor1@peppycell.local` | CI |
| `PLAYWRIGHT_BASE_URL` | Base URL E2E | `http://127.0.0.1:3000` | CI |
| `SMOKE_BASE_URL` | Base URL smoke staging/production | `https://staging.peppycell.id` | CI |
| `STAGING_APP_URL` / `PRODUCTION_APP_URL` | URL environment untuk deploy smoke | `https://staging.peppycell.id` | CI |
| `SMOKE_ADMIN_EMAIL` / `SMOKE_ADMIN_PASSWORD` | Akun admin untuk smoke test | `admin@peppycell.id` | CI |

## 7.6 `.env.example`

```bash
# ── App ─────────────────────────────────────────────
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=PeppyCell
TZ=Asia/Jakarta
LOG_LEVEL=info
NEXT_PUBLIC_ENABLE_CSV_EXPORT=true

# ── Supabase ────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
SUPABASE_PROJECT_ID=local
# CI only:
# SUPABASE_ACCESS_TOKEN=
# SUPABASE_DB_PASSWORD=

# ── Auth ────────────────────────────────────────────
AUTH_REDIRECT_URL=http://localhost:3000/auth/confirm
# RESEND_API_KEY=

# ── Monitoring ──────────────────────────────────────
# NEXT_PUBLIC_SENTRY_DSN=
# SENTRY_DSN=
# SENTRY_ORG=
# SENTRY_PROJECT=
# SENTRY_AUTH_TOKEN=
# AXIOM_TOKEN=
# AXIOM_DATASET=

# ── Testing ─────────────────────────────────────────
TEST_SUPABASE_URL=http://127.0.0.1:54321
TEST_SUPABASE_ANON_KEY=your-anon-key
TEST_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
TEST_ADMIN_EMAIL=admin@peppycell.local
TEST_ADMIN_PASSWORD=Admin123!
TEST_KASIR_EMAIL=kasir@peppycell.local
TEST_KASIR_PASSWORD=Kasir123!
TEST_INVESTOR_EMAIL=investor1@peppycell.local
TEST_INVESTOR_PASSWORD=Investor123!
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000
```

> **Jangan commit `.env.local`.** `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_AUTH_TOKEN`, dan `SUPABASE_ACCESS_TOKEN` tidak boleh memakai prefix `NEXT_PUBLIC_`.
>
> `bun run check-env` memvalidasi variabel wajib (Zod) sebelum build/deploy: URL & anon key Supabase, service role, `NEXT_PUBLIC_APP_URL`, dan `AUTH_REDIRECT_URL`. CI menjalankannya sebelum `next build`; nilai yang hilang menggagalkan pipeline, bukan runtime.

---

# BAGIAN 8 — Testing Strategy

## 8.1 Test Pyramid

| Layer | Tool | Cakupan | Waktu | Frekuensi |
|---|---|---|---|---|
| Static | TypeScript 7, ESLint, `supabase db lint` | Tipe, lint, SQL function | < 30s | Setiap save/CI |
| Unit | Vitest 5 + Testing Library | Logika uang, periode, validasi, permission, komponen role-safe | < 60s | Setiap PR |
| Database integration | pgTAP + Supabase lokal | RLS, RPC, constraint, trigger, idempotency | < 3 menit | Setiap PR |
| App integration | Vitest + Supabase lokal | Server Action, Route Handler, response format | < 3 menit | Setiap PR |
| E2E | Playwright 1.65 | 7 critical flow, mobile + dark mode | < 8 menit | Setiap PR |
| Manual exploratory | Checklist QA | Visual, copywriting, edge case | 30 menit | Sebelum rilis |

**Prinsip:** angka finansial diuji di dua level — unit (algoritma) dan database (RPC). E2E tidak dipakai untuk memverifikasi rumus, hanya memastikan alur UI menghasilkan efek yang benar.

## 8.2 Unit Testing

**Framework:** Vitest 5.1.0 (`environment: jsdom` untuk komponen).
**Target:** 80% line, 70% branch; modul finansial 100% branch.

### Matriks Test Wajib

| Modul | Test case |
|---|---|
| `src/lib/money.ts` — `allocateRupiah` | Total 0; total 1; persentase 20/40/30/10; total tidak 100 → throw; tanpa key `retained` → throw; semua porsi 0 kecuali satu; hasil selalu = total; non-retained floor & retained menyerap sisa; deterministik |
| `src/lib/money.ts` — `distributePool` | Tanpa penerima → `{}`; satu penerima → 100%; bobot 0 semua → rata; bobot tidak 100 → proporsional; pool 0; pool 1 dengan 3 penerima; Σ hasil = pool; fractional sama → urut id (sama dengan SQL) |
| `src/lib/period.ts` | Senin 00:00 WIB; Minggu 23:59 WIB masih periode berjalan; Minggu 23:59 UTC = Senin WIB; `isPeriodClosed`; `startOfTodayWib`; DST tidak berlaku (WIB fixed +07) |
| `src/lib/validations/*` | Qty 1–99; nominal > 0; deskripsi 5–200; alasan void ≥ 10; alokasi sum 100; tanggal payout ≤ hari ini; password min 8 + huruf + angka |
| `src/lib/auth/permissions.ts` | Matrix route × role; karyawan tidak bisa akses wallet/users/settings admin; investor read-only |
| `src/lib/errors.ts` | Mapping Postgrest code → `ErrorCode`; pesan Bahasa Indonesia; `AppError.fromPostgrest` |
| `src/lib/idempotency.ts` | Hash payload stabil; key sama + payload beda → conflict; key sama + payload sama → duplicate |
| `src/lib/csv.ts` | Parse header, delimiter `;`/`,`, angka `1.000,50`, tanggal `DD/MM/YYYY`, baris kosong, BOM |
| Komponen `MoneyText` | Format `Rp1.234.567`; tanpa desimal; negatif; `role=karyawan` tidak menerima prop finansial |
| Komponen `RoleGate` | Render children hanya untuk role diizinkan; fallback 403 |
| Form `SaleForm` | Picker produk hanya aktif; qty stepper; submit mengirim `clientRequestId` sekali; error field tampil |
| Form `PayoutWizard` | Step validasi; preview berubah saat tanggal; tombol eksekusi disabled jika preview invalid/saldo kurang |

### Contoh Test — Alokasi

```ts
import { describe, expect, it } from "vitest";
import { allocateRupiah, distributePool } from "@/lib/money";

describe("allocateRupiah", () => {
  it("selalu menjumlah tepat sama dengan total", () => {
    const result = allocateRupiah(100_001, [
      { key: "retained", pct: 20 },
      { key: "admin", pct: 40 },
      { key: "investor", pct: 30 },
      { key: "employee", pct: 10 },
    ]);
    expect(Object.values(result).reduce((a, b) => a + b, 0)).toBe(100_001);
    expect(result.admin).toBe(40_000);
    expect(result.retained).toBe(20_001); // sisa pembulatan ke retained
  });

  it("menolak total persentase bukan 100", () => {
    expect(() => allocateRupiah(1000, [{ key: "a", pct: 99 }])).toThrow();
  });
});

describe("distributePool", () => {
  it("membagi rata saat semua bobot 0", () => {
    const result = distributePool(100, [
      { id: "a", weight: 0 },
      { id: "b", weight: 0 },
    ]);
    expect(result).toEqual({ a: 50, b: 50 });
  });
});
```

### `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/lib/**", "src/actions/**", "src/components/**"],
      exclude: ["src/components/ui/**", "src/types/**", "src/**/*.d.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
        "src/lib/money.ts": { branches: 100, lines: 100 },
        "src/lib/period.ts": { branches: 100, lines: 100 },
      },
    },
  },
});
```

## 8.3 Database Integration Testing (pgTAP)

**Runner:** `supabase test db` (pgTAP) terhadap Supabase lokal yang di-reset dari migration + `seed.sql`.
**Prinsip:** setiap policy dan RPC punya minimal satu test positif dan satu test negatif.

### Helper Test

```sql
create schema if not exists tests;

create or replace function tests.login_as(p_email text)
returns void
language plpgsql
as $$
declare v_id uuid;
begin
  select id into v_id from public.users where email = p_email;
  if v_id is null then raise exception 'test user not found: %', p_email; end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.logout()
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$ begin perform set_config('role', 'postgres', true); end; $$;
```

### Test RLS

```sql
begin;
set search_path = public, extensions;
select plan(6);

select tests.login_as('kasir@peppycell.local');

select is((select count(*) from public.product_costs), 0::bigint,
  'karyawan tidak bisa membaca harga beli');
select is((select count(*) from public.transaction_costs), 0::bigint,
  'karyawan tidak bisa membaca margin');
select is((select count(*) from public.wallets), 0::bigint,
  'karyawan tidak bisa membaca saldo wallet');
select is((select count(*) from public.transactions where user_id <> auth.uid()), 0::bigint,
  'karyawan tidak bisa membaca transaksi user lain');
select is((select count(*) from public.transactions
           where user_id = auth.uid()
             and (tanggal at time zone 'Asia/Jakarta')::date
                 < (now() at time zone 'Asia/Jakarta')::date), 0::bigint,
  'karyawan tidak bisa membaca transaksi sebelum hari ini');

select throws_ok(
  $$ insert into public.transactions (tipe, kategori, nominal, wallet_id, user_id)
     values ('income','penjualan',1000, gen_random_uuid(), auth.uid()) $$,
  '42501', null, 'karyawan tidak bisa insert langsung'
);

select * from finish();
rollback;
```

### Matriks Test RPC

| RPC | Test positif | Test negatif |
|---|---|---|
| `create_sale` | Saldo naik; `transaction_costs.margin` benar; return tanpa cost; duplikat `client_request_id` → `duplicate=true` | Produk nonaktif; cost hilang; qty 0/100; role investor; wallet default tidak ada |
| `create_expense` | Saldo turun; transaksi tercatat; karyawan dipaksa wallet default | Saldo kurang; wallet nonaktif; nominal 0; tanggal besok |
| `transfer_wallet` | Dua saldo berubah; jurnal transfer satu baris | Wallet sama; saldo kurang; wallet nonaktif; role karyawan |
| `adjust_wallet_balance` | `wallet_adjustments` berisi old/new/delta; audit ada | Delta 0; alasan < 10 char; saldo negatif; role non-admin |
| `void_transaction` | Original `status=void`; reversal aktif; saldo kembali; margin reversal negatif | Void dua kali; void payout; alasan kosong; role karyawan |
| `upsert_product` | Produk + cost atomik; update harga | Margin negatif; nama duplikat; harga 0; role karyawan |
| `create_wallet` | Wallet + saldo awal + adjustment; set default melepas default lama | Nama duplikat; saldo negatif; role karyawan |
| `update_wallet` | Metadata berubah; saldo tetap; default lama dilepas saat set default baru | Nama duplikat; wallet nonaktif dijadikan default; role karyawan |
| `toggle_wallet` | Nonaktif saat saldo 0; aktif kembali | Nonaktif saat saldo > 0; nonaktif wallet default; role karyawan |
| `update_payout_settings` | Tersimpan; sum 100 | Sum 99/101; role karyawan |
| `preview_payout` | Gross/opex/net sesuai fixture; breakdown = Σ pool; periode berjalan boleh dipreview | Periode terbalik; bukan 7 hari; periode memuat import; role non-admin |
| `execute_payout` | Payout + items + transaksi; saldo terpotong; retained benar; Σ items = total keluar; retry key sama → record sama | Duplikat periode; saldo kurang; net ≤ 0; alokasi ≠ 100; periode memuat transaksi import; eksekusi paralel key berbeda hanya satu sukses |
| `get_dashboard_metrics` | Bentuk payload per role | Karyawan tidak menerima field profit/aset; investor tidak menerima saldo per wallet |
| `get_payout_receipt` | Admin lihat semua item; investor hanya item sendiri | Investor akses payout orang lain → 0 rows |
| `get_investor_dividends` | Hanya item milik sendiri | Role admin/karyawan ditolak |

### Concurrency Test

```sql
-- dua sesi paralel memanggil execute_payout periode yang sama dengan idempotency key berbeda
-- sesi 1 sukses, sesi 2 gagal DUPLICATE_PAYOUT (unique + advisory lock)
select is(
  (select count(*) from public.payout_history
   where start_date = '2026-10-26' and end_date = '2026-11-01'),
  1::bigint,
  'hanya satu payout per periode'
);
```

## 8.4 App Integration Testing

**Framework:** Vitest + `@supabase/supabase-js` ke Supabase lokal.
**Cakupan:**

- Server Action: `withAction` auth+role → validasi Zod → RPC → `revalidateTag`; test error mapping dan bentuk `ActionResult`.
- Route Handler: status code, envelope `{ success, data, error, meta }`, header `X-Request-ID`, pagination.
- Auth guard: request tanpa sesi → 401/redirect; role salah → 403.
- Idempotency: dua request dengan key sama menghasilkan satu baris.
- CSV export: header, delimiter, encoding UTF-8 BOM.

**Mock strategy:**

| Dependency | Strategy |
|---|---|
| Supabase Auth | User seed nyata di Supabase lokal; login via password test |
| PostgREST/RPC | Nyata (bukan mock) — menguji RLS + SQL |
| Sentry | Mock `@sentry/nextjs` agar tidak mengirim event |
| `next/cache` | Mock `revalidateTag`/`revalidatePath` untuk assertion |
| Email/invite | Mock `supabaseAdmin.auth.admin.inviteUserByEmail` |
| Waktu | `vi.setSystemTime` untuk boundary WIB |

## 8.5 E2E Testing (Playwright)

**Target:** 7 critical flow, dijalankan pada viewport mobile (Pixel 7) light + desktop dark.

| # | Flow | Assertion kunci |
|---|---|---|
| 1 | Login 3 role + logout + akses route terlarang | Redirect benar; karyawan `/wallets` → 403; investor tidak melihat menu admin |
| 2 | Karyawan input penjualan | Success sheet; transaksi muncul di list; tidak ada teks harga beli/margin/saldo; dashboard hanya miliknya |
| 3 | Admin input pengeluaran + transfer + penyesuaian saldo | Saldo dua wallet berubah; mutasi tampil; adjustment punya alasan |
| 4 | Admin CRUD produk + margin | Margin = harga jual − harga beli; nonaktif produk hilang dari picker karyawan |
| 5 | Admin preview → execute payout → receipt | Angka preview = receipt; status completed; saldo terpotong; riwayat tampil; double submit tidak menggandakan |
| 6 | Investor melihat dashboard + deviden + detail payout | Hanya item miliknya; tidak ada tombol aksi; total aset tampil agregat |
| 7 | Admin void transaksi | Status void; reversal muncul; saldo kembali; alasan tercatat di audit |

**Aturan selektor:** prioritaskan `getByRole`, `getByLabel`, teks yang terlihat; `data-testid` hanya untuk nilai finansial (`data-testid="money-total"`) dan elemen yang tidak punya label unik.

### `playwright.config.ts`

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,          // flow wallet/payout berbagi state
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["github"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "mobile-light", use: { ...devices["Pixel 7"], colorScheme: "light" } },
    { name: "desktop-dark", use: { ...devices["Desktop Chrome"], colorScheme: "dark" } },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

### Test Data E2E

- `supabase db reset` sekali sebelum suite; seed test users + produk + wallet.
- Setiap test membuat transaksi dengan `clientRequestId` unik (`crypto.randomUUID()`).
- Test payout memakai periode fixture khusus (bukan periode berjalan) dan dijalankan serial.
- Setelah suite, tidak perlu cleanup karena database CI ephemeral.
- Jangan pernah menjalankan E2E terhadap production.

### Accessibility & Visual

- `@axe-core/playwright`: 0 critical violation pada Login, Dashboard, Transaksi, Produk, Bagi Hasil.
- Cek kontras di dark mode; target WCAG AA.
- Screenshot failure otomatis; visual diff opsional fase 2.
- Cek layout 375px, 768px, 1280px.

## 8.6 Struktur Folder Test

```
tests/
├── setup.ts                        # jest-dom, matchMedia, ResizeObserver
├── fixtures/
│   ├── users.ts
│   ├── products.ts
│   ├── wallets.ts
│   └── payout-period.ts
├── unit/
│   ├── money.test.ts
│   ├── period.test.ts
│   ├── validations.test.ts
│   ├── permissions.test.ts
│   ├── errors.test.ts
│   └── components/
│       ├── money-text.test.tsx
│       ├── role-gate.test.tsx
│       └── payout-wizard.test.tsx
├── integration/
│   ├── actions/
│   │   ├── create-sale.test.ts
│   │   ├── create-expense.test.ts
│   │   ├── payout.test.ts
│   │   └── void.test.ts
│   └── api/
│       ├── transactions.test.ts
│       ├── payouts.test.ts
│       └── export.test.ts
└── e2e/
    ├── auth-roles.spec.ts
    ├── sale-karyawan.spec.ts
    ├── wallet-admin.spec.ts
    ├── product-margin.spec.ts
    ├── payout-admin.spec.ts
    ├── investor-readonly.spec.ts
    └── void-transaction.spec.ts

supabase/tests/
├── 001_rls_users.test.sql
├── 002_rls_costs.test.sql
├── 003_rls_transactions.test.sql
├── 004_create_sale.test.sql
├── 005_expense_transfer_adjust.test.sql
├── 006_void.test.sql
├── 007_payout.test.sql
└── 008_dashboard_investor.test.sql
```

## 8.7 Coverage & Quality Gates

| Gate | Threshold | Blocking |
|---|---|---|
| TypeScript | 0 error | Ya |
| ESLint | 0 error, 0 warning baru | Ya |
| Unit line coverage | ≥ 80% | Ya |
| Unit branch coverage | ≥ 70% | Ya |
| Modul finansial | 100% branch (`money.ts`, `period.ts`) | Ya |
| pgTAP | 100% pass; setiap RPC punya test negatif | Ya |
| E2E | 100% pass di CI | Ya |
| Bundle dashboard | < 180KB gzip | Warning |
| Lighthouse mobile performance | ≥ 85 | Warning |
| `bun audit` | 0 high/critical | Ya |

## 8.8 Perintah Test

```bash
# Unit + komponen
bun run test:unit
bun run test:unit -- --coverage

# Database (butuh Supabase lokal aktif)
supabase start
supabase db reset
supabase test db

# Integrasi aplikasi
bun run test:integration

# E2E (butuh app + Supabase lokal)
bunx playwright install --with-deps chromium
bun run test:e2e
bun run test:e2e -- --project=mobile-light

# Semua gate lokal
bun run lint && bun run typecheck && bun run test:unit -- --coverage && supabase test db && bun run test:integration
```

---

# BAGIAN 9 — Data Migration & Seeding

## 9.1 Konteks Legacy

Sistem lama adalah pencatatan manual berbasis **CSV/Excel** (PRD §1). Tidak ada database legacy atau API yang bisa diakses langsung.

| Aspek | Kenyataan | Dampak |
|---|---|---|
| Sumber data | File CSV/XLSX export manual | Perlu parser toleran + validasi ketat |
| Kualitas data | Format tanggal/angka tidak konsisten, duplikat, typo nama produk | Wajib dry-run + laporan error |
| Margin historis | Harga beli mungkin tidak tercatat per transaksi | Snapshot cost memakai master produk saat import; jika tidak ada → 0 + flag di report |
| Payout historis | Tercatat di sheet terpisah | **Tidak diimpor** sebagai payout aktif; disimpan sebagai arsip eksternal |
| Downtime | Konter tetap buka | Cutover di luar jam sibuk, read-only 2–4 jam |
| Volume | < 20.000 transaksi historis | Import batch aman dalam satu transaksi |

## 9.2 Mapping Tabel

| Target | Sumber legacy | Strategi | Catatan |
|---|---|---|---|
| `products` | Sheet/master produk | Insert/update by `nama_produk` | Nama dinormalisasi (trim, title case) |
| `product_costs` | Kolom harga beli | Insert/update | Wajib ada; jika kosong → 0 + flag |
| `wallets` | Sheet daftar akun | Insert + saldo final saat freeze | Saldo dicatat di `wallet_adjustments` dengan alasan "Saldo awal migrasi"; **bukan** saldo awal periode historis |
| `transactions` (income) | Sheet penjualan | Insert batch + `transaction_costs` | `legacy_ref` unik; `unit_price` dari harga jual saat transaksi; **tidak** mengubah saldo wallet |
| `transactions` (expense) | Sheet pengeluaran | Insert batch | Kategori default `operasional`; **tidak** mengubah saldo wallet |
| `transactions` (transfer) | Sheet mutasi | Insert batch | Wajib punya wallet asal & tujuan; **tidak** mengubah saldo wallet |
| `users` | Daftar admin/karyawan/investor | **Manual invite** | Password tidak diimpor; user baru set via invite |
| `payout_history` | Sheet bagi hasil | **Tidak diimpor** | Arsip eksternal; payout pertama di sistem baru mulai periode setelah cutover |

**Aturan penting:** `wallets.saldo` diisi **saldo final saat freeze** (sudah memperhitungkan seluruh transaksi historis). Transaksi historis diimpor untuk pelaporan/audit saja dan **tidak** memutasi saldo wallet — jika dimutasi, saldo akan terhitung dua kali. Semua transaksi historis memakai `legacy_ref` dan `import_batch_id`. Tidak ada transaksi historis yang masuk ke periode payout baru; `payout_history` hanya dibuat setelah go-live. **Agregat laba/margin** (dashboard periode historis, laporan laba, preview/execute payout) mengecualikan `import_batch_id is not null`; transaksi import tetap muncul di list transaksi, omzet kotor, dan export.

## 9.3 Template CSV

### `products.csv`

```csv
nama_produk,operator,harga_jual,harga_beli,is_active
"Telkomsel 5GB",Telkomsel,55000,48000,true
"Indosat 10GB",Indosat,75000,67000,true
```

### `wallets.csv`

```csv
nama_wallet,tipe,saldo_final,is_default
Cash,cash,1250000,true
"Rekening BCA",bank,8750000,false
"Saldo OrderKuota",digital,450000,false
```

### `transactions.csv`

```csv
legacy_ref,tanggal,tipe,kategori,nominal,qty,unit_price,produk,wallet,wallet_tujuan,keterangan,user_email
LEG-2026-0001,2026-10-01 09:15,income,penjualan,55000,1,55000,Telkomsel 5GB,Cash,,,kasir@peppycell.local
LEG-2026-0002,2026-10-01 11:30,expense,operasional,25000,1,,,Cash,,Beli galon,admin@peppycell.local
LEG-2026-0003,2026-10-01 15:00,transfer,transfer,500000,1,,,Cash,Rekening BCA,Setor tunai,admin@peppycell.local
```

**Aturan format:**
- Tanggal: `YYYY-MM-DD HH:mm` (WIB) atau `DD/MM/YYYY HH:mm`.
- Nominal: angka tanpa `Rp`, boleh `1.000.000` atau `1000000`; parser menghapus pemisah ribuan.
- Nama produk/wallet harus cocok case-insensitive setelah normalisasi.
- `legacy_ref` wajib unik; baris duplikat dilewati dan dicatat di report.
- `user_email` harus sudah ada di `public.users`; jika tidak → baris ditolak (bukan auto-create).

## 9.4 Alur Migrasi

```
1. FREEZE
   Konter berhenti input di Excel; export final CSV/XLSX.
   Backup database target (jika sudah ada data uji).

2. DRY RUN
   bun run import:legacy --file=transactions.csv --type=transactions --dry-run
   → parse → validasi → cek duplikat → laporan (tanpa write)

3. REVIEW
   Admin memeriksa report: jumlah baris, error per baris, total nominal per tipe,
   produk/wallet yang tidak ditemukan, duplikat legacy_ref.

4. FIX
   Perbaiki CSV atau master produk/wallet; ulangi dry run sampai 0 error kritis.

5. COMMIT
   bun run import:legacy --file=transactions.csv --type=transactions --commit
   → satu transaksi DB per batch (max 500 baris)
   → import_batches.status = committed
   → transaksi + transaction_costs (tanpa mutasi saldo wallet)

6. RECONCILE
   Bandingkan count & sum per tipe dengan rekap Excel, lalu cocokkan
   saldo wallet dengan saldo final saat freeze. Selisih harus 0 atau dijelaskan.

7. CUTOVER
   Aktifkan aplikasi, invite user, training singkat, pantau 1–2 hari.
   Excel menjadi read-only.

8. ROLLBACK (jika gagal sebelum go-live)
   Tandai batch rolled_back → hapus baris dengan import_batch_id tersebut.
   Setelah go-live: tidak ada delete; gunakan void/reversal.
```

### Urutan Import

1. `products` + `product_costs`
2. `wallets` + saldo awal
3. `users` (manual invite, bukan import)
4. `transactions` income
5. `transactions` expense
6. `transactions` transfer
7. Rekonsiliasi
8. Verifikasi role & dashboard

## 9.5 Desain Script Import

```
scripts/import-legacy.ts
├── parseArgs()             # --file, --type, --dry-run|--commit, --batch-size
├── detectFormat()          # .csv → papaparse, .xlsx → exceljs
├── normalizeRow()          # trim, lower-case key, parse angka/tanggal
├── validateRow()           # Zod schema per tipe
├── resolveReferences()     # produk, wallet, user by nama/email
├── checkDuplicate()        # legacy_ref / kombinasi natural key
├── dryRunReport()          # JSON + tabel console
└── commitBatch()           # insert import_batches + rows dalam transaksi
```

**Prinsip script:**

- Tidak ada UI import di MVP; migrasi dijalankan admin dari mesin lokal/CI dengan service role.
- Berjalan dengan **service role** dari mesin admin/CI, bukan dari browser.
- Tidak pernah memanggil Server Action atau API publik.
- Setiap **commit** batch membuat satu baris `import_batches` dengan `report` berisi `{ inserted, skipped, errors[] }`. Dry-run hanya menulis report ke file, tidak menulis DB (status `dry_run` disediakan jika audit dry-run ingin disimpan).
- Idempotent: `legacy_ref` unik; menjalankan ulang file yang sama → 0 insert, semua skipped.
- `products` & `wallets` di-upsert berdasarkan natural key (`lower(nama_produk)`, `nama_wallet`); `wallet_adjustments` saldo final hanya dibuat jika wallet baru atau saldo berbeda **dan delta ≠ 0**, sehingga rerun tidak menggandakan adjustment. Wallet dengan saldo final 0 tidak membuat adjustment (melanggar CHECK delta ≠ 0).
- Gagal di tengah batch → rollback batch; batch sebelumnya tetap committed dan bisa dilanjutkan.
- Log ke stdout + file `import-report-<timestamp>.json`; tidak mengandung password.

### Zod Row Schema (ringkas)

```ts
const transactionRow = z.object({
  legacy_ref: z.string().min(3).max(50),
  tanggal: z.string().transform(parseLegacyDate),
  tipe: z.enum(["income", "expense", "transfer"]),
  kategori: z.string().min(3).max(30),
  nominal: z.string().transform(parseRupiah).pipe(z.number().int().positive()),
  qty: z.coerce.number().int().min(1).max(999).default(1),
  unit_price: z.string().transform(parseRupiah).pipe(z.number().int().nonnegative()).optional(),
  produk: z.string().optional(),
  wallet: z.string().min(1),
  wallet_tujuan: z.string().optional(),
  keterangan: z.string().max(200).optional(),
  user_email: z.string().email(),
}).superRefine((row, ctx) => {
  if (row.tipe === "income" && (!row.produk || row.unit_price == null)) {
    ctx.addIssue({ code: "custom", message: "income wajib punya produk & unit_price" });
  }
  if (row.tipe === "transfer" && !row.wallet_tujuan) {
    ctx.addIssue({ code: "custom", message: "transfer wajib punya wallet_tujuan" });
  }
});
```

## 9.6 Rekonsiliasi

```sql
-- 1. Jumlah & total per tipe
select tipe, count(*) as jumlah, sum(nominal) as total
from public.transactions
where import_batch_id = :batch_id
group by tipe
order by tipe;

-- 2. Total margin historis yang berhasil direkonstruksi
select count(*) filter (where tc.unit_cost = 0) as cost_unknown,
       sum(tc.margin) as total_margin
from public.transactions t
join public.transaction_costs tc on tc.transaction_id = t.id
where t.import_batch_id = :batch_id and t.tipe = 'income';

-- 3. Saldo wallet harus sama dengan saldo final di wallets.csv (bukan saldo awal + mutasi)
select w.nama_wallet, w.saldo, wa.new_balance as saldo_final_tercatat, wa.reason
from public.wallets w
left join lateral (
  select new_balance, reason
  from public.wallet_adjustments
  where wallet_id = w.id
  order by created_at desc
  limit 1
) wa on true
order by w.nama_wallet;

-- 4. Baris tanpa cost (harus 0 untuk income)
select count(*) from public.transactions t
left join public.transaction_costs tc on tc.transaction_id = t.id
where t.import_batch_id = :batch_id and t.tipe = 'income' and tc.transaction_id is null;
```

**Kriteria lulus:**
- Jumlah baris per tipe = jumlah baris valid di CSV.
- `sum(nominal)` per tipe = rekap Excel (toleransi 0).
- Saldo wallet = saldo final di `wallets.csv`; transaksi historis tidak memutasi saldo.
- Tidak ada income tanpa `transaction_costs`.
- `cost_unknown` = 0, atau setiap baris dengan `unit_cost=0` tercatat sebagai exception yang disetujui Admin.
- Tidak ada `legacy_ref` ganda.

## 9.7 Cutover & Rollback

### Checklist Cutover

- [ ] Dry run 0 error kritis.
- [ ] Backup/PITR aktif dan sudah dites restore ke staging.
- [ ] Master produk/wallet sudah final.
- [ ] User sudah di-invite dan bisa login.
- [ ] `payout_settings` sudah diisi (default 20/40/30/10).
- [ ] Rekonsiliasi lulus.
- [ ] Smoke test 3 role di staging.
- [ ] Pengumuman read-only window ke tim.
- [ ] Rollback plan disepakati.

### Rollback

| Skenario | Tindakan | Batas |
|---|---|---|
| Import gagal sebelum go-live | Tandai batch `rolled_back`; hapus `transactions` dengan `import_batch_id` tsb (cascade ke `transaction_costs`); reset saldo wallet dari backup | Aman karena belum ada transaksi baru |
| Data salah setelah go-live | **Jangan delete**; buat void/reversal + adjustment dengan alasan; catat di audit | Sesuai aturan bisnis |
| Migrasi merusak schema | Restore PITR ke timestamp sebelum migration; deploy versi app sebelumnya | RTO ≤ 1 jam |
| App error pasca-deploy | `vercel rollback`; DB forward-fix | Tanpa kehilangan data |

**Aturan:** setelah go-live, satu-satunya cara mengoreksi transaksi adalah void/reversal + adjustment. Tidak ada `DELETE` transaksi.

## 9.8 Seed Data

| Data | Purpose | Script | Idempotent |
|---|---|---|---|
| Admin pertama | Akses awal production | `bun run seed:admin` | Ya (`on conflict`) |
| Payout settings | Konfigurasi awal 20/40/30/10 | `seed:admin` | Ya |
| Wallet default Cash | Penjualan butuh wallet default | `seed:admin` | Ya |
| User demo (admin/karyawan/2 investor) | E2E & development | `seed:demo` | Ya |
| Produk + cost demo (10) | Testing katalog & margin | `seed:demo` | Ya |
| Wallet demo (3) | Testing transfer & aset | `seed:demo` | Ya |
| Transaksi demo 30 hari | Testing dashboard & payout | `seed:demo` | Ya |
| Payout demo 2 periode | Testing riwayat & receipt | `seed:demo` | Ya |

**Aturan seed:**

- `seed:demo` menolak berjalan jika `NODE_ENV=production` atau `ALLOW_DEMO_SEED != true`.
- Password demo hanya untuk lokal/CI; tidak pernah dipakai di production.
- Seed memakai UUID tetap agar test deterministik.
- `seed:admin` meminta email admin via env/argumen; tidak hardcode password production.
- Semua seed dibungkus transaksi dan aman dijalankan berulang.

### Akun Demo

| Role | Email | Password (lokal) |
|---|---|---|
| Admin | `admin@peppycell.local` | `Admin123!` |
| Karyawan | `kasir@peppycell.local` | `Kasir123!` |
| Investor 1 | `investor1@peppycell.local` | `Investor123!` |
| Investor 2 | `investor2@peppycell.local` | `Investor123!` |

## 9.9 Verifikasi Pasca-Migrasi

- [ ] Login 3 role berhasil; role salah tidak bisa akses.
- [ ] Dashboard admin: gross margin, opex, net profit, total aset cocok dengan rekap.
- [ ] Dashboard karyawan: hanya jumlah & nilai penjualan miliknya hari ini.
- [ ] Dashboard investor: total aset & laba agregat, tanpa saldo per wallet.
- [ ] Produk: harga jual tampil; harga beli & margin hanya admin.
- [ ] Wallet: saldo akhir = hasil rekonsiliasi.
- [ ] Transaksi: filter tanggal/tipe/wallet benar; pagination benar.
- [ ] Payout preview periode berjalan: net profit sesuai query manual.
- [ ] Payout eksekusi di staging: receipt, items, saldo, jurnal, audit cocok.
- [ ] Void: saldo kembali, reversal tercatat.
- [ ] Dark mode + mobile 375px tidak ada layout rusak.
- [ ] Export CSV: jumlah baris & total cocok.
- [ ] Tidak ada error 5xx di log 24 jam pertama.

---

# APPENDIX

## A. Screen → Route → Interface → Data Coverage

| # | Screen | Route | Action / API | RPC / Tabel |
|---|---|---|---|---|
| 01 | Login | `/login` | `loginAction`, `requestPasswordResetAction` | Supabase Auth |
| 02 | Dashboard | `/dashboard` | `GET /api/dashboard` | `get_dashboard_metrics` |
| 03 | Transaksi | `/transactions` | `GET /api/transactions` | `transactions` (RLS) |
| 04 | Input Penjualan | `/transactions/new?type=sale` | `createSaleAction` | `create_sale` |
| 05 | Input Pengeluaran | `/transactions/new?type=expense` | `createExpenseAction` | `create_expense` |
| 06 | Detail Transaksi | `/transactions/[id]` | `GET /api/transactions/[id]`, `voidTransactionAction` | `transactions`, `transaction_costs`, `void_transaction` |
| 07 | Produk | `/products` | `GET /api/products`, `create/update/toggleProductAction` | `products`, `product_costs`, `upsert_product` |
| 08 | Wallet & Aset | `/wallets` | `GET /api/wallets`, `create/update/toggleWalletAction` | `wallets`, `create_wallet`, `update_wallet` |
| 09 | Detail Wallet | `/wallets/[id]` | `GET /api/wallets/[id]`, `adjustBalanceAction` | `wallets`, `transactions`, `wallet_adjustments`, `adjust_wallet_balance` |
| 10 | Mutasi Aset | `/wallets/transfer` | `transferAction` | `transfer_wallet` |
| 11 | Bagi Hasil | `/profit-sharing` | Admin: `previewPayoutAction`, `updatePayoutSettingsAction`; Investor: — | `preview_payout`, `payout_history`, `payout_settings` |
| 12 | Wizard Bagi Hasil | `/profit-sharing/new` | `previewPayoutAction`, `executePayoutAction` | `preview_payout`, `execute_payout` |
| 13 | Riwayat Payout | `/profit-sharing/history` | `GET /api/payouts` | `payout_history`, `payout_items` (RLS) |
| 14 | Detail Payout | `/profit-sharing/history/[id]` | `GET /api/payouts/[id]`, `GET /api/payouts/[id]/pdf` | `get_payout_receipt` |
| 15 | Pengguna | `/users` | `GET /api/users`, `invite/update/toggle/resendInviteAction` | `users`, Supabase Admin API |
| 16 | Profil & Pengaturan | `/settings` | `updateProfile/Theme/Notification/changePasswordAction`, `POST /api/avatar` | `users` |
| 17 | 403 / 404 | `/403`, `not-found.tsx` | — | — |

**Verifikasi:** 17/17 screen DESIGN.md punya route; 12/12 komponen reusable dipakai di minimal satu screen; semua role matrix DESIGN.md dipetakan ke RLS + guard.

## B. PRD → Implementasi Traceability

| PRD | Requirement | Implementasi |
|---|---|---|
| §2 | Next.js App Router, Supabase, Tailwind, shadcn/ui, Vercel, dark mode | Bagian 1; `next-themes`; token DESIGN.md |
| §3 | Admin full access | RLS admin policy + `requireRole("admin")` |
| §3 | Karyawan input transaksi, lihat harga jual, tanpa modal/margin/aset | `product_costs`/`transaction_costs` admin-only; payload dashboard & API disaring |
| §3 | Investor read-only, dashboard, aset, laba, deviden sendiri | RLS investor + `get_dashboard_metrics` + `get_investor_dividends` |
| §4A | Dashboard admin/investor vs karyawan | `get_dashboard_metrics` output per role |
| §4B | Input penjualan otomatis ambil harga; saldo Cash naik | `create_sale` (snapshot + wallet default) |
| §4B | Input pengeluaran | `create_expense` |
| §4C | CRUD produk + margin real-time | `upsert_product`; `products` + `product_costs` |
| §4D | CRUD wallet, transfer, adjustment | `create_wallet`, `transfer_wallet`, `adjust_wallet_balance` |
| §4E | Laba bersih mingguan, alokasi dinamis, payout | `preview_payout`, `execute_payout`, `payout_settings`, `payout_items` |
| §5 | Struktur tabel users/wallets/products/transactions/payout_history | Bagian 2 + deviasi terdokumentasi |
| §6 | RLS semua tabel; products karyawan hanya nama & harga jual; wallets admin; transactions karyawan hari ini | Bagian 2.7 + pgTAP |
| §7 | Siap ekspansi modul servis | Modul terpisah, tidak ada coupling; out of scope MVP |

## C. Deviasi & Keputusan (Ringkas)

| # | Keputusan | Alasan | Dampak |
|---|---|---|---|
| 1 | `product_costs` & `transaction_costs` terpisah | RLS tidak bisa menyembunyikan kolom | Admin-only; karyawan tidak pernah menerima field cost |
| 2 | `payout_settings` singleton | Alokasi dinamis PRD §4E | Admin bisa ubah persentase kapan saja |
| 3 | `payout_items` per penerima | Receipt & riwayat investor | 1 payout → N item → N transaksi |
| 4 | Void = reversal, bukan delete | Audit & integritas saldo | Original `status=void`; reversal aktif |
| 5 | `wallet_adjustments` | PRD §4D balance adjustment | Audit immutable |
| 6 | `import_batches` + `legacy_ref` | Migrasi CSV/Excel | Idempotent & bisa rollback pre-go-live |
| 7 | Retained earnings tidak memotong wallet | Laba ditahan tetap di bisnis | Hanya pool admin/investor/karyawan yang keluar |
| 8 | Floor pool + largest remainder per pool | Pembulatan Rupiah | Σ item = pool; sisa & pool kosong ke retained |
| 9 | Karyawan hanya lihat transaksi hari ini miliknya | PRD §6 | RLS + filter paksa di API |
| 10 | Payout tidak bisa void langsung | Menghindari double reversal | Reversal payout fase 2 |

## D. Risiko & Mitigasi

| Risiko | Dampak | Probabilitas | Mitigasi |
|---|---|---|---|
| RLS salah konfigurasi → cost/margin bocor | Tinggi | Sedang | Tabel cost terpisah, revoke privilege, pgTAP wajib di CI, code review security |
| Double payout karena double click/retry | Tinggi | Sedang | Unique periode + advisory lock + idempotency key + tombol disabled |
| Saldo wallet drift | Tinggi | Sedang | Mutasi atomik, row lock, `wallet_adjustments`, rekonsiliasi harian |
| Timezone boundary salah | Sedang | Sedang | Helper WIB terpusat, test boundary, expression index |
| Pembulatan tidak pas | Sedang | Rendah | Largest remainder + test properti Σ = total |
| Service role key bocor | Kritis | Rendah | `server-only`, env terpisah, secret scanning, rotasi |
| Data legacy kotor | Sedang | Tinggi | Dry-run, validasi Zod, report, rekonsiliasi, rollback batch |
| Supabase/Vercel down | Tinggi | Rendah | Status page, retry read, circuit breaker, backup PITR |
| Next.js 16/React 19 breaking change | Sedang | Rendah | Versi pinned, staging, Dependabot manual review |
| Volume transaksi tumbuh | Sedang | Rendah | Index, pagination, materialized view fase 2, arsip tahunan |
| Karyawan share akun | Sedang | Sedang | Audit `user_id`, sesi per device, deaktivasi cepat, monitoring login |
| Payout salah hitung | Tinggi | Rendah | Preview = execute (helper sama), receipt, audit, approval manual |

## E. Definition of Done (MVP)

- [ ] Semua migration diterapkan di staging & production; `supabase db diff` bersih.
- [ ] 12 tabel + enum + index + trigger + RPC sesuai Bagian 2.
- [ ] RLS aktif di semua tabel; pgTAP 100% pass; tidak ada akses langsung ke cost/wallet oleh karyawan.
- [ ] 17 screen DESIGN.md diimplementasikan, responsive 375/768/1280, light + dark.
- [ ] 12 komponen reusable sesuai spec; tidak ada hardcoded warna di luar token.
- [ ] Auth invite/reset/deaktivasi berfungsi; 3 role bisa login.
- [ ] Penjualan, pengeluaran, transfer, adjustment, void berfungsi atomik + idempotent.
- [ ] Produk + margin admin-only; karyawan hanya melihat harga jual.
- [ ] Payout preview = execute; receipt PDF; riwayat admin/investor; retry aman.
- [ ] Dashboard role-aware; karyawan tidak menerima field finansial di payload.
- [ ] Audit log untuk void, adjustment, payout, perubahan sensitif.
- [ ] Unit ≥ 80% line / 70% branch; modul finansial 100% branch; E2E 7 flow pass.
- [ ] CI/CD: lint, typecheck, unit, pgTAP, integration, E2E, audit, build.
- [ ] Sentry + Vercel Analytics + health check + alert payout gagal aktif.
- [ ] Backup harian + PITR aktif; restore sudah dites di staging.
- [ ] Import legacy dry-run + commit + rekonsiliasi lulus.
- [ ] Smoke test 3 role di production lulus; rollback plan tertulis.
- [ ] Dokumentasi env, runbook payout, dan runbook restore tersedia.

## F. Fase 2 (Out of Scope)

- Reversal payout otomatis + approval berjenjang.
- Materialized view `daily_profit_summary` jika volume > 100k transaksi/bulan.
- Notifikasi WhatsApp/email payout.
- Integrasi H2H OrderKuota / supplier.
- Modul servis HP/PC (PRD §7).
- Multi-outlet & multi-cabang.
- Pajak & laporan keuangan formal.
- Mobile app native / PWA offline penuh.
- Realtime dashboard (saat ini polling 30s).
- Custom role & permission granular.

---

> **Status:** Draft final untuk review. Setelah disetujui, lanjut ke `create-issues` untuk breakdown task implementasi.


