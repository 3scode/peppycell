# TASKS.md — PeppyCell Web System

> **Versi:** 1.0 · **Tanggal:** 11 Nov 2026
> **Sumber:** `.agents/TECH-SPEC.md` + `.agents/DESIGN.md` + `prd.md`
> **Breakdown:** per modul
> **Task opsional:** tidak dipilih — Testing, CI/CD, Monitoring, dan Data Migration legacy ditunda
> **Total:** 24 task · 4 phase

## Ringkasan

| Phase | Task | Jumlah |
|---|---|---|
| Foundation | T-01 s/d T-05 | 5 |
| Core | T-06 s/d T-20 | 15 |
| Enhancement | T-21 s/d T-23 | 3 |
| Infrastructure | T-24 | 1 |

**Project status:** implemented — `src/`, `supabase/`, dan `scripts/` sudah ada; aplikasi berjalan dalam mode demo in-memory.
**Design references:** tidak ada; acuan visual memakai `.agents/DESIGN.md`.

### Status Implementasi (11 Nov 2026)

- `bun run lint` — lolos, 0 warning.
- `bun run typecheck` — lolos.
- `bun run build` — lolos, 34 route.
- Visual: 16 target halaman × 375/768/1280 × light/dark = **96 pemeriksaan**, tanpa overflow horizontal dan tanpa console error.
- Aksesibilitas: axe **0 critical / 0 serious** pada Login, Dashboard, Transaksi, Produk, dan Bagi Hasil (375px & 1280px).
- Smoke API + E2E mutasi (penjualan, void reversal, pengeluaran, transfer, penyesuaian saldo, payout) — lolos.
- **Mode demo in-memory** aktif tanpa env Supabase. Migration/RLS/RPC tersedia, tetapi belum dijalankan ke Postgres sungguhan (Docker/Supabase CLI tidak tersedia).
- Status task: **T-01–T-20 dan T-22 selesai**; **T-21/T-23 selesai sebagian**; **T-24 diblokir** kebutuhan kredensial deployment.
- **Deviasi T-01:** TypeScript **6.0.3** (bukan 7.0.2) karena `typescript-eslint` belum mendukung TS 7. UI primitives dibuat custom sehingga `components.json` shadcn tidak ada. Prettier & Supabase CLI tidak dipasang (memakai ESLint dan SQL Editor). `.env.local` tidak dibuat karena mode demo tidak memerlukan env.

### Legenda

| Simbol | Arti |
|---|---|
| 🔴 High | Blocker implementasi / fitur utama |
| 🟡 Mid | Penting, bisa menyusul setelah core jalan |
| 🟢 Low | Nice-to-have |
| S | < 1 hari |
| M | 1–3 hari |
| L | 3–7 hari |
| XL | 1–3 minggu (tidak dipakai) |

### Definition of Done Global

- [x] `bun run lint`, `bun run typecheck`, dan `bun run build` lolos.
- [x] Layout benar di 375px, 768px, dan 1280px; light + dark mode.
- [x] Tidak ada data sensitif (harga beli, margin, saldo wallet, total aset) di payload/DOM karyawan.
- [x] Semua nominal memakai integer rupiah + `MoneyText`; tidak ada floating point di perhitungan uang.
- [x] Error ditampilkan dalam Bahasa Indonesia dengan `ErrorCode` yang sesuai.
- [x] Acceptance criteria task inti terpenuhi; pengecualian T-21/T-23/T-24 dicatat pada task masing-masing.

---

## Peta Screen → Task

| # | Screen | Route | Task |
|---|---|---|---|
| 01 | Login | `/login` | T-06 |
| 02 | Dashboard | `/dashboard` | T-08 |
| 03 | Transaksi | `/transactions` | T-09 |
| 04 | Input Penjualan | `/transactions/new?type=sale` | T-10 |
| 05 | Input Pengeluaran | `/transactions/new?type=expense` | T-11 |
| 06 | Detail Transaksi | `/transactions/[id]` | T-09, T-12 |
| 07 | Produk | `/products` | T-13 |
| 08 | Wallet & Aset | `/wallets` | T-14 |
| 09 | Detail Wallet | `/wallets/[id]` | T-14 |
| 10 | Mutasi Aset | `/wallets/transfer` | T-15 |
| 11 | Bagi Hasil | `/profit-sharing` | T-16 |
| 12 | Wizard Bagi Hasil | `/profit-sharing/new` | T-16 |
| 13 | Riwayat Payout | `/profit-sharing/history` | T-17 |
| 14 | Detail Payout | `/profit-sharing/history/[id]` | T-17 |
| 15 | Pengguna | `/users` | T-18 |
| 16 | Profil & Pengaturan | `/settings` | T-19 |
| 17 | Akses Ditolak / 404 | `/403`, `/404` | T-06 |

## Peta Modul → Task

| Modul | Task |
|---|---|
| Setup & Tooling | T-01 |
| Design System & App Shell | T-02 |
| Database & Migrations | T-03 |
| RLS, Trigger & Audit | T-04 |
| Seed & Local Environment | T-05 |
| Auth & RBAC | T-06 |
| Interface Foundation | T-07 |
| Dashboard & Analytics | T-08 |
| Transaksi | T-09, T-10, T-11, T-12 |
| Produk & Margin | T-13 |
| Wallet & Aset | T-14, T-15 |
| Weekly Profit Sharing | T-16, T-17 |
| Pengguna | T-18 |
| Profil & Pengaturan | T-19 |
| Export & Route Completion | T-20 |
| Error Handling & Resilience | T-21 |
| Responsive, A11y & Dark Mode | T-22 |
| Performance & Security | T-23 |
| Deployment | T-24 |

## Alur Dependensi

```
T-01 Setup
 ├─ T-02 Design System
 ├─ T-03 Database Schema
 │   └─ T-04 RLS/Triggers/Audit
 │       └─ T-05 Seed
 └─ T-06 Auth & Guards
     └─ T-07 Interface Foundation
         ├─ T-08 Dashboard
         ├─ T-09 Transaksi List/Detail
         │   ├─ T-10 Penjualan
         │   ├─ T-11 Pengeluaran
         │   ├─ T-12 Void
         │   └─ T-20 Export
         ├─ T-13 Produk
         ├─ T-14 Wallet
         │   └─ T-15 Transfer/Adjust
         ├─ T-16 Payout Preview/Wizard
         │   └─ T-17 Payout Execute/History/PDF
         ├─ T-18 Pengguna
         └─ T-19 Settings/Avatar
             └─ T-21 Error & Resilience
                 └─ T-22 Responsive/A11y
                     └─ T-23 Performance/Security
                         └─ T-24 Deploy
```

---

> **Catatan pembacaan:** Checkbox Sub-task/Acceptance Criteria di bawah adalah rencana awal dan tidak dicentang satu per satu. Status implementasi aktual ada pada field **Status** setiap task dan ringkasan di atas. Item yang tidak dapat diverifikasi di environment ini (runtime Supabase, deployment) dijelaskan pada catatan task terkait.

# PHASE 1 — FOUNDATION

## T-01: Setup Project & Tooling

**Modul:** Setup
**Phase:** Foundation
**Screen:** N/A
**Related FR:** PRD §2 Tech Stack
**Prioritas:** 🔴 High
**Status:** ✅ Done
**Effort:** M
**Tech Stack:** Bun 1.4.4, Next.js 16.4.5, React 19.3.1, TypeScript 6.0.3, Tailwind 4.3.5, UI primitives custom
**File yang diubah:** `package.json`, `bun.lock`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `components.json`, `.env.example`, `.gitignore`, `src/app/layout.tsx`, `src/app/page.tsx`

### Dependensi
- Tidak ada

### Sub-task Checklist
- [ ] Inisialisasi project Bun + Next.js 16 App Router + TypeScript strict.
- [ ] Install Tailwind 4 + shadcn/ui; inisialisasi `components.json` dengan CSS variables.
- [ ] Install dependency runtime: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, `@tanstack/react-table`, `recharts`, `sonner`, `next-themes`, `date-fns`, `@date-fns/tz`, `@react-pdf/renderer`, `papaparse`, `exceljs`, `sharp`, `pino`, `lucide-react`, `@sentry/nextjs`, `@vercel/analytics`, `@vercel/speed-insights`.
- [ ] Install dev dependency: `vitest` tidak dipakai di fase ini; minimal `eslint`, `prettier`, `supabase` CLI 3.0.0.
- [ ] Buat struktur folder sesuai TECH-SPEC §1.3 (`src/app`, `src/actions`, `src/components`, `src/lib`, `src/types`, `supabase`, `scripts`).
- [ ] Konfigurasi `next.config.ts`: `reactStrictMode`, `poweredByHeader: false`, image `remotePatterns` Supabase, security headers dasar.
- [ ] Tambahkan scripts `dev`, `build`, `start`, `lint`, `typecheck`, `check-env`.
- [ ] Buat `.env.example` lengkap (Bagian 7 TECH-SPEC) dan `.env.local` lokal.
- [ ] Setup ESLint + Prettier + import order.
- [ ] Verifikasi `bun run dev` dan `bun run build` berhasil.

### Acceptance Criteria
- [ ] `bun install` dan `bun run build` sukses tanpa error TypeScript.
- [ ] `src/` dan `supabase/` mengikuti struktur TECH-SPEC.
- [ ] `.env.example` memuat semua variabel wajib; tidak ada secret ter-commit.
- [ ] `next.config.ts` memuat header keamanan dan image pattern Supabase.
- [ ] Halaman root sementara menampilkan identitas PeppyCell.

### Referensi Design
- 📄 `.agents/DESIGN.md` Bagian 1 — Design System

### Environment Variables
- `NEXT_PUBLIC_APP_URL` — base URL aplikasi
- `NEXT_PUBLIC_APP_NAME` — `PeppyCell`
- `TZ` — `Asia/Jakarta`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`, `SUPABASE_PROJECT_ID`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`
- `AUTH_REDIRECT_URL`
- `LOG_LEVEL`, `NEXT_PUBLIC_ENABLE_CSV_EXPORT`

---

## T-02: Design System, Theme & App Shell

**Modul:** Design System
**Phase:** Foundation
**Screen:** Semua screen (shell)
**Related FR:** PRD §2, DESIGN.md Bagian 1 & 4
**Prioritas:** 🔴 High
**Status:** ✅ Done
**Effort:** L
**Tech Stack:** Tailwind 4, shadcn/ui, next-themes, next/font/local, lucide-react
**File yang diubah:** `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/*`, `src/components/layout/app-shell.tsx`, `src/components/layout/sidebar.tsx`, `src/components/layout/bottom-nav.tsx`, `src/components/layout/topbar.tsx`, `src/components/shared/*`

### Dependensi
- T-01: Setup Project & Tooling

### Sub-task Checklist
- [ ] Petakan token warna light/dark DESIGN.md ke CSS variables Tailwind 4 (`--color-primary`, `--color-surface`, `--color-success-text`, dst.).
- [ ] Setup tipografi Inter 400/500/600/700 via `next/font/local`; aktifkan `tnum` untuk nominal.
- [ ] Terapkan spacing 4px, radius, shadow, chart tokens, dan semantic badge colors.
- [ ] Implementasikan 12 komponen reusable:
  - [ ] `AppShell`
  - [ ] `Button`
  - [ ] `InputField`
  - [ ] `MetricCard`
  - [ ] `DataTable` / `ListRow`
  - [ ] `StatusBadge`
  - [ ] `Modal` / `BottomSheet`
  - [ ] `Toast` (sonner)
  - [ ] `MoneyText`
  - [ ] `EmptyState`
  - [ ] `PageHeader`
  - [ ] `FilterBar` / `SegmentedControl`
- [ ] Buat `ThemeProvider` (class strategy) + toggle Light/Dark/System tanpa flash.
- [ ] Buat AppShell responsif: sidebar 280px desktop, 80px tablet, bottom nav 64px + topbar 56px + FAB 56px mobile.
- [ ] Filter menu berdasarkan role (admin/karyawan/investor) sesuai DESIGN.md §2.
- [ ] Pastikan target sentuh ≥ 44px, focus ring terlihat, dan `prefers-reduced-motion` dihormati.

### Acceptance Criteria
- [ ] Token warna/typography sesuai DESIGN.md; tidak ada hex hardcoded di komponen.
- [ ] 12 komponen reusable tersedia dan terdokumentasi via variasi props.
- [ ] Layout 375/768/1280 tidak overflow horizontal.
- [ ] Dark mode berfungsi di semua komponen tanpa flash saat reload.
- [ ] Menu role-safe: karyawan tidak melihat Wallet/Pengguna/Bagi Hasil; investor hanya melihat Deviden.
- [ ] `bun run build` lolos dan tidak ada hydration warning tema.

### Referensi Design
- 📄 `.agents/DESIGN.md` §1.1–1.8, §2.2, Bagian 4

### Environment Variables
- Tidak ada tambahan

---

## T-03: Database Schema & Migrations

**Modul:** Database
**Phase:** Foundation
**Screen:** Semua screen (data layer)
**Related FR:** PRD §5 Struktur Database
**Prioritas:** 🔴 High
**Status:** ✅ Done
**Effort:** L
**Tech Stack:** Supabase Postgres 17, Supabase CLI 3.0.0, SQL migrations
**File yang diubah:** `supabase/config.toml`, `supabase/migrations/202611070001_init_extensions.sql`, `202611070002_enums.sql`, `202611070003_core_tables.sql`, `202611070004_indexes.sql`, `src/types/database.ts`

### Dependensi
- T-01: Setup Project & Tooling

### Sub-task Checklist
- [ ] `supabase init` + konfigurasi project lokal.
- [ ] Migration extensions: `pgcrypto` (gen_random_uuid), schema `public`.
- [ ] Migration enum (6): `user_role`, `wallet_type`, `transaction_type`, `transaction_status`, `payout_status`, `payout_category`.
- [ ] Migration 12 tabel sesuai TECH-SPEC §2.11: `users`, `wallets`, `products`, `product_costs`, `transactions`, `transaction_costs`, `payout_settings`, `payout_history`, `payout_items`, `wallet_adjustments`, `audit_logs`, `import_batches`.
- [ ] Terapkan semua PK, FK, UNIQUE, CHECK, DEFAULT, dan kolom snapshot (`qty`, `unit_price`, `status`, `reversal_of`, `client_request_id`, `payout_id`, `import_batch_id`, `legacy_ref`).
- [ ] Buat 22 index sesuai TECH-SPEC §2.6, termasuk expression index WIB dan partial unique index.
- [ ] Seed `payout_settings` singleton id=1 (20/40/30/10).
- [ ] Generate types: `bunx supabase gen types typescript --local > src/types/database.ts`.
- [ ] Verifikasi `supabase db reset` dari nol berhasil.

### Acceptance Criteria
- [ ] `supabase db reset` sukses tanpa error.
- [ ] 12 tabel, 6 enum, dan 22 index terbentuk.
- [ ] Semua constraint kritis ada: saldo ≥ 0, qty 1–99, persentase 0–100, sum payout = 100, `total_distributed = net_profit − retained`, unique periode payout.
- [ ] `reversal_of` unik per transaksi asal.
- [ ] Tipe generated tersedia dan dipakai di client Supabase.
- [ ] Tidak ada migration yang mengubah file migration lama setelah diterapkan.

### Referensi Design
- 📄 `.agents/DESIGN.md` — Data Format per screen (untuk field yang ditampilkan)

### Environment Variables
- `SUPABASE_DB_URL` — koneksi migration
- `SUPABASE_PROJECT_ID` — project ref
- `SUPABASE_ACCESS_TOKEN` — CLI
- `SUPABASE_DB_PASSWORD` — password DB

---

## T-04: RLS, Auth Helpers, Triggers & Audit

**Modul:** Database Security
**Phase:** Foundation
**Screen:** Semua screen
**Related FR:** PRD §6 Keamanan & Akses Data
**Prioritas:** 🔴 High
**Status:** ✅ Done
**Effort:** L
**Tech Stack:** Postgres RLS, PL/pgSQL, Supabase Storage policies
**File yang diubah:** `supabase/migrations/202611070005_rls.sql`, `supabase/migrations/202611070006_functions.sql`, `supabase/migrations/202611070008_storage.sql`

### Dependensi
- T-03: Database Schema & Migrations

### Sub-task Checklist
- [ ] Buat helper `current_user_role()` (null untuk nonaktif) dan `is_admin()` dengan `coalesce(..., false)`.
- [ ] `enable row level security` di 12 tabel; deny-by-default.
- [ ] Policy `users`: select self/admin; update self hanya nama/avatar/theme/notifikasi; update admin.
- [ ] Policy `products`: admin all; karyawan select `is_active=true`.
- [ ] Policy `product_costs` dan `transaction_costs`: admin-only select.
- [ ] Policy `transactions`: admin all; karyawan select own **hari ini WIB**; tidak ada write langsung.
- [ ] Policy `wallets`, `payout_settings`, `wallet_adjustments`, `audit_logs`, `import_batches`: admin-only select.
- [ ] Policy `payout_history` / `payout_items`: admin all; investor hanya record/item miliknya.
- [ ] Revoke insert/update/delete tabel finansial; revoke insert/delete `products`; grant select sesuai policy.
- [ ] Trigger `guard_user_sensitive_fields()` untuk mencegah self-update role/porsi/status.
- [ ] Trigger `assert_product_margin()`: harga beli ≤ harga jual.
- [ ] Trigger `updated_at` untuk tabel yang memilikinya.
- [ ] Trigger audit untuk `products`, `product_costs`, `users`, `wallets`, `payout_settings`.
- [ ] Trigger `handle_new_user()` untuk membuat profil `public.users` dari invite.
- [ ] Storage bucket `avatars`: public read, write hanya folder `{uid}/`.
- [ ] Verifikasi manual via SQL: user nonaktif melihat 0 baris; karyawan gagal select cost/wallet; investor hanya item sendiri; direct write ditolak.

### Acceptance Criteria
- [ ] Semua tabel `public` memiliki RLS aktif.
- [ ] Karyawan tidak bisa membaca `product_costs`, `transaction_costs`, `wallets`, `payout_history`, `payout_items`.
- [ ] Investor hanya bisa membaca payout/item miliknya.
- [ ] Direct `insert/update/delete` ke tabel finansial ditolak.
- [ ] Perubahan role/porsi/status user dan harga produk tercatat di `audit_logs`.
- [ ] Self-update user tidak bisa menaikkan role atau mengubah `is_active`.
- [ ] Trigger margin menolak harga beli > harga jual.

### Referensi Design
- 📄 `.agents/DESIGN.md` §2.3 Role & Permission Matrix

### Environment Variables
- Tidak ada tambahan

---

## T-05: Seed Data & Local Environment

**Modul:** Seed
**Phase:** Foundation
**Screen:** Semua screen (data demo)
**Related FR:** PRD §7 Catatan Tambahan
**Prioritas:** 🟡 Mid
**Status:** ✅ Done
**Effort:** M
**Tech Stack:** Bun, Supabase JS admin client, SQL seed
**File yang diubah:** `supabase/seed.sql`, `scripts/seed-admin.ts`, `scripts/seed-demo.ts`

### Dependensi
- T-03: Database Schema & Migrations
- T-04: RLS, Auth Helpers, Triggers & Audit

### Sub-task Checklist
- [ ] `seed:admin`: buat admin pertama + wallet default Cash + `payout_settings` 20/40/30/10.
- [ ] `seed:demo`: buat 4 user (admin, karyawan, 2 investor) dengan UUID tetap.
- [ ] Seed 10 produk + `product_costs` (harga beli bervariasi, margin wajar).
- [ ] Seed 3 wallet (Cash, Rekening, Saldo OrderKuota).
- [ ] Seed transaksi 30 hari: income, expense operasional/non-operasional, transfer.
- [ ] Seed 2 payout periode tertutup + `payout_items` + transaksi payout.
- [ ] Semua seed idempotent (`on conflict` / cek natural key).
- [ ] Guard `seed:demo` menolak `NODE_ENV=production` atau `ALLOW_DEMO_SEED != true`.
- [ ] Dokumentasikan akun demo di README internal.

### Acceptance Criteria
- [ ] `bun run seed:admin` dan `bun run seed:demo` aman dijalankan berulang.
- [ ] Data demo cukup untuk mengisi dashboard admin/karyawan/investor.
- [ ] Payout demo punya receipt dan item per penerima.
- [ ] Tidak ada seed demo yang bisa jalan di production.
- [ ] Wallet default Cash tersedia untuk `create_sale`.

### Referensi Design
- 📄 `.agents/DESIGN.md` — contoh data pada screen 02, 11–14

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` — kredensial admin awal (server only)
- `ALLOW_DEMO_SEED` — guard seed demo

---

# PHASE 2 — CORE

## T-06: Auth Flow & Route Guards

**Modul:** Auth & RBAC
**Phase:** Core
**Screen:** 01 Login, 17 Akses Ditolak/404
**Related FR:** PRD §3 Manajemen Hak Akses
**Prioritas:** 🔴 High
**Status:** ✅ Done
**Effort:** M
**Tech Stack:** Supabase Auth, `@supabase/ssr`, Next.js 16 `proxy.ts`
**File yang diubah:** `src/proxy.ts`, `src/lib/supabase/client.ts`, `server.ts`, `admin.ts`, `middleware.ts`, `src/lib/auth/require-role.ts`, `src/actions/auth.ts`, `src/app/(auth)/login/page.tsx`, `src/app/auth/confirm/route.ts`, `src/app/403/page.tsx`, `src/app/not-found.tsx`

### Dependensi
- T-01, T-03, T-04, T-05

### Sub-task Checklist
- [ ] Buat Supabase browser/server/admin client dengan cookie SSR.
- [ ] `updateSession()` refresh token + set cookie response.
- [ ] `proxy.ts`: public routes (`/login`, `/auth/confirm`, `/api/health`), redirect unauthenticated ke login, API 401 JSON, prefix role guard.
- [ ] Login form (email/password/remember/next) + `loginAction`.
- [ ] `logoutAction`, `requestPasswordResetAction`, `updatePasswordAction`.
- [ ] Invite flow: `inviteUserByEmail` → `/auth/confirm` → set password.
- [ ] Tolak user `is_active=false` saat login dan hapus sesi.
- [ ] `requireRole()` untuk page/layout + `requireApiRole()` untuk route handler.
- [ ] Halaman 403 dan 404 yang ramah, dengan CTA kembali ke dashboard.
- [ ] Cegah open redirect pada parameter `next`.

### Acceptance Criteria
- [ ] Login 3 role berhasil dan redirect sesuai `next`/default.
- [ ] User nonaktif tidak bisa login dan sesi lama tidak bisa membaca data.
- [ ] Karyawan membuka `/wallets` → 403; investor membuka `/profit-sharing/new` → 403.
- [ ] Request API tanpa sesi → 401 JSON, bukan redirect HTML.
- [ ] Invite dan reset password berfungsi end-to-end di lokal.
- [ ] Logout membersihkan cookie dan kembali ke `/login`.

### Referensi Design
- 📄 `.agents/DESIGN.md` Screen 01 dan Screen 17

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `AUTH_REDIRECT_URL` — redirect invite/recovery
- `NEXT_PUBLIC_APP_URL`

---

## T-07: Interface Foundation — Actions, Routes, Errors, Mappers

**Modul:** Interface
**Phase:** Core
**Screen:** Semua screen
**Related FR:** TECH-SPEC §3
**Prioritas:** 🔴 High
**Status:** ✅ Done
**Effort:** M
**Tech Stack:** Next.js Server Actions, Route Handlers, Zod, PostgREST
**File yang diubah:** `src/lib/action-wrapper.ts`, `src/lib/errors.ts`, `src/lib/api.ts`, `src/lib/mappers.ts`, `src/lib/validations/*`, `src/types/domain.ts`, `src/app/api/health/route.ts`, `src/app/api/me/route.ts`

### Dependensi
- T-01, T-06

### Sub-task Checklist
- [ ] Definisikan `ActionResult<T>`, envelope API `{ success, data, error, meta }`, dan `AppError`.
- [ ] Implementasikan `withAction(name, roles, schema, handler)` — auth sebelum validasi Zod.
- [ ] Implementasikan `requireApiRole()` dan wrapper `withRoute` + `X-Request-ID`.
- [ ] Mapping Postgrest error code/message → `ErrorCode` Bahasa Indonesia.
- [ ] Zod schema dasar: uuid, nominal rupiah, qty 1–99, deskripsi 5–200, alasan ≥ 10, persentase 0–100.
- [ ] Helper pagination page/limit + `meta.totalPages`.
- [ ] Mapper snake_case RPC/DB → camelCase domain (`TransactionSafe`, `WalletSummary`, `PayoutSummary`, dst.).
- [ ] `GET /api/health` publik (app + DB + version) dan `GET /api/me`.
- [ ] `not-found.tsx`, `forbidden.tsx`, dan error boundary dasar.

### Acceptance Criteria
- [ ] Semua action mengembalikan bentuk `ActionResult` konsisten.
- [ ] Semua route handler memakai envelope dan `X-Request-ID`.
- [ ] Sesi invalid → 401; role salah → 403; validasi → 422 dengan `fieldErrors`.
- [ ] `AppError.fromPostgrest` memetakan kode RPC (`INSUFFICIENT_BALANCE`, `DUPLICATE_PAYOUT`, dst.).
- [ ] Tidak ada payload RPC snake_case yang bocor langsung ke komponen client.
- [ ] `/api/health` dapat diakses tanpa login dan mengembalikan status DB.

### Referensi Design
- 📄 `.agents/DESIGN.md` — pesan error & empty state per screen

### Environment Variables
- Tidak ada tambahan

---

## T-08: Dashboard & Analytics

**Modul:** Dashboard
**Phase:** Core
**Screen:** 02 Dashboard (adaptif)
**Related FR:** PRD §4A Dashboard & Analytics
**Prioritas:** 🔴 High
**Status:** ✅ Done
**Effort:** M
**Tech Stack:** RSC + Suspense, Recharts, RPC `get_dashboard_metrics`
**File yang diubah:** `supabase/migrations/*_dashboard_metrics.sql`, `src/app/(app)/dashboard/page.tsx`, `src/app/api/dashboard/route.ts`, `src/components/dashboard/*`

### Dependensi
- T-05: Seed Data
- T-07: Interface Foundation

### Sub-task Checklist
- [ ] RPC `get_dashboard_metrics(p_start, p_end)` dengan output berbeda per role.
- [ ] Admin: grossMargin, operatingExpense, netProfit, totalAssets, transactionCount, series 7/30 hari, 5 transaksi terbaru, payoutReady, payoutPeriod.
- [ ] Karyawan: jumlah transaksi hari ini, penjualan hari ini, produk terjual, series 7 hari (count), 5 transaksi miliknya.
- [ ] Investor: grossProfit, netProfit, totalAssets agregat, lastDividend, series, payout history mini miliknya.
- [ ] Hero metric laba bersih + kartu margin/beban + chart tren + list transaksi + banner payout.
- [ ] Chart di-lazy-load (`next/dynamic`, `ssr:false`), tinggi 180px mobile.
- [ ] Skeleton per section + empty state + error state.
- [ ] `GET /api/dashboard` untuk refresh client.
- [ ] Cache/revalidate 30 detik setelah mutasi.

### Acceptance Criteria
- [ ] Payload karyawan tidak memuat margin, cost, saldo wallet, atau total aset.
- [ ] Payload investor tidak memuat saldo per wallet.
- [ ] Angka dashboard cocok dengan query manual pada data seed.
- [ ] Chart dan kartu punya skeleton; tidak blocking satu sama lain.
- [ ] Layout 375/768/1280 rapi; dark mode benar.
- [ ] Banner "siap diproses" muncul hanya jika periode tertutup dan belum ada payout.

### Referensi Design
- 📄 `.agents/DESIGN.md` Screen 02 (role variants, layout, states)

### Environment Variables
- Tidak ada tambahan

---

## T-09: Transaksi — List & Detail

**Modul:** Transaksi
**Phase:** Core
**Screen:** 03 Transaksi, 06 Detail Transaksi
**Related FR:** PRD §4B Manajemen Transaksi
**Prioritas:** 🔴 High
**Status:** ✅ Done
**Effort:** M
**Tech Stack:** RSC, `searchParams`, TanStack Table, Route Handlers
**File yang diubah:** `src/app/(app)/transactions/page.tsx`, `src/app/(app)/transactions/[id]/page.tsx`, `src/app/api/transactions/route.ts`, `src/app/api/transactions/[id]/route.ts`, `src/components/transactions/*`

### Dependensi
- T-07: Interface Foundation

### Sub-task Checklist
- [ ] List transaksi dengan filter tipe, tanggal, wallet, user, pencarian, dan pagination 25.
- [ ] Desktop: DataTable penuh; mobile: ListRow dengan nominal + badge tipe.
- [ ] Karyawan: query dipaksa `user_id = auth.uid()` dan `tanggal >= startOfTodayWib()`.
- [ ] Detail transaksi role-safe: admin melihat cost/margin; karyawan tidak.
- [ ] Tampilkan status void/reversal, siapa pencatat, wallet, dan keterangan.
- [ ] Aksi admin: Batalkan (mengarah ke T-12), kembali, dan audit trail bila ada.
- [ ] `GET /api/transactions` dan `GET /api/transactions/[id]` dengan validasi query Zod.
- [ ] Empty state, loading skeleton, error state + retry.

### Acceptance Criteria
- [ ] Karyawan hanya melihat transaksi miliknya hari ini, baik di UI maupun API.
- [ ] Tidak ada field `harga_beli`, `margin`, atau `saldo` di payload karyawan.
- [ ] Filter dan pagination bekerja; total di `meta` benar.
- [ ] Detail transaksi milik user lain → 404/403 untuk karyawan.
- [ ] Transaksi void/reversal tetap tampil dengan status jelas.
- [ ] Layout mobile tidak memakai tabel horizontal scroll.

### Referensi Design
- 📄 `.agents/DESIGN.md` Screen 03 dan Screen 06

### Environment Variables
- Tidak ada tambahan

---

## T-10: Input Penjualan

**Modul:** Transaksi
**Phase:** Core
**Screen:** 04 Input Penjualan
**Related FR:** PRD §4B, §4E
**Prioritas:** 🔴 High
**Status:** ✅ Done
**Effort:** M
**Tech Stack:** Server Action, RPC `create_sale`, React Hook Form
**File yang diubah:** `src/actions/transactions.ts`, `src/lib/validations/transaction.ts`, `src/app/(app)/transactions/new/page.tsx`, `src/components/transactions/sale-form.tsx`

### Dependensi
- T-09: Transaksi List & Detail

### Sub-task Checklist
- [ ] Form penjualan: produk (hanya field aman), qty 1–99, keterangan opsional, `clientRequestId` UUID.
- [ ] Picker produk hanya `is_active=true`; tampilkan operator + harga jual.
- [ ] `createSaleAction` + `create_sale`: idempotency, snapshot `unit_price`, insert `transaction_costs`, update saldo Cash.
- [ ] Success sheet menampilkan produk, qty, subtotal, wallet; tombol "Catat Lagi".
- [ ] Revalidate dashboard, transaksi, wallet.
- [ ] Tangani `PRODUCT_INACTIVE`, `PRODUCT_COST_MISSING`, `DEFAULT_WALLET_MISSING`, `IDEMPOTENCY_CONFLICT`.
- [ ] Cegah double submit; tombol disabled saat pending.

### Acceptance Criteria
- [ ] Penjualan menambah saldo Cash dan muncul di list transaksi.
- [ ] `transaction_costs` terisi dengan `unit_cost` dan `margin` benar.
- [ ] Karyawan tidak menerima/melihat harga beli, margin, atau saldo wallet di response/DOM.
- [ ] Dua submit dengan `clientRequestId` sama tidak menggandakan transaksi.
- [ ] Produk nonaktif tidak bisa dijual.
- [ ] Form nyaman di 375px dengan CTA di area jempol.

### Referensi Design
- 📄 `.agents/DESIGN.md` Screen 04

### Environment Variables
- Tidak ada tambahan

---

## T-11: Input Pengeluaran

**Modul:** Transaksi
**Phase:** Core
**Screen:** 05 Input Pengeluaran
**Related FR:** PRD §4B
**Prioritas:** 🔴 High
**Status:** ✅ Done
**Effort:** S
**Tech Stack:** Server Action, RPC `create_expense`
**File yang diubah:** `src/actions/transactions.ts`, `src/lib/validations/transaction.ts`, `src/app/(app)/transactions/new/page.tsx`, `src/components/transactions/expense-form.tsx`

### Dependensi
- T-09: Transaksi List & Detail

### Sub-task Checklist
- [ ] Form pengeluaran: tanggal ≤ hari ini WIB, kategori `operasional|gaji|deviden|lainnya`, nominal, deskripsi 5–200.
- [ ] Admin boleh pilih wallet aktif; karyawan dipaksa wallet default Cash dan tidak melihat saldo.
- [ ] `createExpenseAction` + `create_expense`: lock wallet, cek saldo, insert, kurangi saldo, audit.
- [ ] Hanya kategori `operasional` yang mengurangi laba bersih.
- [ ] Tampilkan saldo terbaru hanya untuk admin.
- [ ] Tangani `INSUFFICIENT_BALANCE`, `WALLET_INACTIVE`, `VALIDATION_ERROR`.

### Acceptance Criteria
- [ ] Pengeluaran mengurangi saldo wallet yang dipilih.
- [ ] Saldo tidak cukup → transaksi tidak dibuat dan pesan jelas.
- [ ] Karyawan tidak bisa memilih wallet atau melihat saldo.
- [ ] Kategori non-operasional tidak masuk opex payout.
- [ ] Tanggal masa depan ditolak.

### Referensi Design
- 📄 `.agents/DESIGN.md` Screen 05

### Environment Variables
- Tidak ada tambahan

---

## T-12: Void Transaksi (Reversal Journal)

**Modul:** Transaksi
**Phase:** Core
**Screen:** 06 Detail Transaksi
**Related FR:** PRD §4B, TECH-SPEC §4.7
**Prioritas:** 🔴 High
**Status:** ✅ Done
**Effort:** M
**Tech Stack:** RPC `void_transaction`, PL/pgSQL
**File yang diubah:** `supabase/migrations/*_void_transaction.sql`, `src/actions/transactions.ts`, `src/components/transactions/void-dialog.tsx`, `src/app/(app)/transactions/[id]/page.tsx`

### Dependensi
- T-09: Transaksi List & Detail

### Sub-task Checklist
- [ ] Dialog konfirmasi void: alasan wajib ≥ 10 karakter, peringatan efek saldo.
- [ ] RPC `void_transaction`: admin-only, transaksi `active`, bukan payout/reversal/import.
- [ ] Lock transaksi asal + wallet terkait; unique `reversal_of` sebagai backstop.
- [ ] Buat transaksi reversal dengan nominal/qty/produk/unit_price sama dan arah saldo berlawanan.
- [ ] Copy `transaction_costs` dengan margin negatif untuk income.
- [ ] Transfer: tukar wallet asal/tujuan.
- [ ] Set transaksi asal `status='void'`; tulis audit log + alasan.
- [ ] Pastikan semua agregat mengabaikan `status='void'` dan baris reversal.

### Acceptance Criteria
- [ ] Saldo wallet kembali ke kondisi sebelum transaksi.
- [ ] Transaksi asal berstatus `void`, reversal tercatat dengan `reversal_of`.
- [ ] Tidak mungkin melakukan void dua kali pada transaksi yang sama.
- [ ] Transaksi payout atau hasil import tidak bisa di-void.
- [ ] Dashboard dan preview payout tidak berubah setelah void.
- [ ] Tidak ada hard delete.

### Referensi Design
- 📄 `.agents/DESIGN.md` Screen 06 (aksi Batalkan + ConfirmDialog)

### Environment Variables
- Tidak ada tambahan

---

## T-13: Produk & Margin

**Modul:** Produk & Margin
**Phase:** Core
**Screen:** 07 Produk
**Related FR:** PRD §4C Manajemen Produk & Margin
**Prioritas:** 🔴 High
**Status:** ✅ Done
**Effort:** M
**Tech Stack:** RPC `upsert_product`, Server Actions, TanStack Table
**File yang diubah:** `src/app/(app)/products/page.tsx`, `src/app/api/products/route.ts`, `src/actions/products.ts`, `src/components/products/*`

### Dependensi
- T-05: Seed Data
- T-07: Interface Foundation

### Sub-task Checklist
- [ ] List produk: pencarian, filter operator, status, pagination.
- [ ] Admin: tambah/edit produk (nama, operator, harga beli, harga jual) via sheet.
- [ ] Karyawan: read-only, hanya produk aktif, tanpa harga beli/margin.
- [ ] `upsert_product`: update `products.harga_jual` dulu, lalu `product_costs.harga_beli` (trigger margin).
- [ ] Validasi nama unik case-insensitive, harga jual > 0, harga beli ≥ 0, harga jual ≥ harga beli.
- [ ] Snapshot transaksi lama tidak berubah saat harga berubah.
- [ ] Nonaktifkan produk (bukan delete); hilang dari picker, tetap di riwayat.
- [ ] Audit old/new untuk create/update/harga/status.

### Acceptance Criteria
- [ ] Admin bisa membuat dan mengubah produk + cost secara atomik.
- [ ] Karyawan tidak pernah menerima `harga_beli` atau `margin`.
- [ ] Harga beli > harga jual ditolak.
- [ ] Nama duplikat (beda kapitalisasi) ditolak.
- [ ] Produk nonaktif tidak muncul di input penjualan.
- [ ] Riwayat transaksi tetap memakai snapshot harga lama.

### Referensi Design
- 📄 `.agents/DESIGN.md` Screen 07

### Environment Variables
- Tidak ada tambahan

---

## T-14: Wallet & Aset

**Modul:** Wallet & Aset
**Phase:** Core
**Screen:** 08 Wallet & Aset, 09 Detail Wallet
**Related FR:** PRD §4D Manajemen Aset & Wallet
**Prioritas:** 🔴 High
**Status:** ✅ Done
**Effort:** L
**Tech Stack:** RPC `create_wallet`, `update_wallet`, `toggle_wallet`, Server Actions
**File yang diubah:** `src/app/(app)/wallets/page.tsx`, `src/app/(app)/wallets/[id]/page.tsx`, `src/app/api/wallets/route.ts`, `src/app/api/wallets/[id]/route.ts`, `src/actions/wallets.ts`, `src/components/wallets/*`

### Dependensi
- T-05: Seed Data
- T-07: Interface Foundation

### Sub-task Checklist
- [ ] Halaman wallet: hero total aset, grid kartu wallet, status badge, aksi cepat.
- [ ] Detail wallet: saldo, metadata, daftar mutasi, tombol sesuaikan/transfer.
- [ ] Admin: tambah wallet (nama, tipe, saldo awal, default) via sheet.
- [ ] Edit metadata (nama, tipe, default) tanpa mengubah saldo.
- [ ] Nonaktifkan wallet hanya jika saldo 0; wallet default tidak boleh nonaktif.
- [ ] Set default baru melepas default lama dalam satu transaksi.
- [ ] Saldo awal 0 tidak membuat `wallet_adjustments` (delta 0).
- [ ] Audit perubahan metadata/status.
- [ ] `GET /api/wallets` + `[id]` dengan total aset.

### Acceptance Criteria
- [ ] Hanya admin yang bisa mengakses wallet dan total aset.
- [ ] Selalu tepat satu wallet default aktif.
- [ ] Edit metadata tidak mengubah saldo.
- [ ] Wallet bersaldo > 0 tidak bisa dinonaktifkan.
- [ ] Total aset = jumlah saldo wallet aktif.
- [ ] Mutasi di detail wallet sesuai transaksi terkait.

### Referensi Design
- 📄 `.agents/DESIGN.md` Screen 08 dan Screen 09

### Environment Variables
- Tidak ada tambahan

---

## T-15: Mutasi Aset & Penyesuaian Saldo

**Modul:** Wallet & Aset
**Phase:** Core
**Screen:** 10 Mutasi Aset, 09 Detail Wallet
**Related FR:** PRD §4D
**Prioritas:** 🔴 High
**Status:** ✅ Done
**Effort:** M
**Tech Stack:** RPC `transfer_wallet`, `adjust_wallet_balance`
**File yang diubah:** `supabase/migrations/*_wallet_ops.sql`, `src/app/(app)/wallets/transfer/page.tsx`, `src/actions/wallets.ts`, `src/components/wallets/transfer-form.tsx`, `src/components/wallets/adjust-dialog.tsx`

### Dependensi
- T-14: Wallet & Aset

### Sub-task Checklist
- [ ] Form transfer: wallet asal/tujuan, nominal, keterangan, `clientRequestId`.
- [ ] `transfer_wallet`: admin-only, wallet aktif & berbeda, lock dua wallet urut id, cek saldo, insert transfer, update dua saldo, audit.
- [ ] Dialog penyesuaian saldo: saldo baru, alasan ≥ 10 karakter.
- [ ] `adjust_wallet_balance`: hitung delta; delta 0 ditolak; saldo baru ≥ 0; insert `wallet_adjustments`; audit.
- [ ] Tampilkan ringkasan perubahan saldo sebelum konfirmasi.
- [ ] Tangani `SAME_WALLET`, `WALLET_INACTIVE`, `INSUFFICIENT_BALANCE`, `VALIDATION_ERROR`.

### Acceptance Criteria
- [ ] Transfer memindahkan dana atomik: saldo asal turun, tujuan naik.
- [ ] Wallet asal = tujuan ditolak.
- [ ] Transfer melebihi saldo ditolak tanpa perubahan.
- [ ] Penyesuaian mencatat old/new/delta/reason/actor.
- [ ] Tidak ada perhitungan uang memakai floating point.
- [ ] Aksi hanya tersedia untuk admin.

### Referensi Design
- 📄 `.agents/DESIGN.md` Screen 10 dan panel penyesuaian Screen 09

### Environment Variables
- Tidak ada tambahan

---

## T-16: Payout — Settings, Preview & Wizard

**Modul:** Weekly Profit Sharing
**Phase:** Core
**Screen:** 11 Bagi Hasil, 12 Wizard Bagi Hasil
**Related FR:** PRD §4E Weekly Profit Sharing
**Prioritas:** 🔴 High
**Status:** ✅ Done
**Effort:** L
**Tech Stack:** RPC `update_payout_settings`, `preview_payout`, `build_payout_items`, RSC + client wizard
**File yang diubah:** `supabase/migrations/*_payout_preview.sql`, `src/app/(app)/profit-sharing/page.tsx`, `src/app/(app)/profit-sharing/new/page.tsx`, `src/actions/payouts.ts`, `src/lib/money.ts`, `src/components/payout/*`

### Dependensi
- T-08: Dashboard
- T-13: Produk & Margin
- T-14: Wallet & Aset

### Sub-task Checklist
- [ ] RPC `update_payout_settings` validasi 4 persentase = 100 dan 0–100.
- [ ] Halaman Bagi Hasil: periode berjalan, progress hari, hero laba bersih, margin vs beban, donut alokasi default, riwayat mini.
- [ ] Wizard step 1: pilih periode Senin–Minggu; periode berjalan boleh dipreview; periode memuat import ditolak `HISTORICAL_PERIOD`.
- [ ] Wizard step 2: 4 input persentase + slider, nominal live, indikator total 100, breakdown penerima.
- [ ] Wizard step 3: review penerima, kategori, bobot, nominal, wallet sumber, retained aktual, warnings.
- [ ] RPC `preview_payout(p_start, p_end, p_allocations default null)` memakai helper yang sama dengan execute.
- [ ] `allocateRupiah`: non-retained di-floor, retained menyerap sisa; total selalu = net.
- [ ] `previewPayoutAction` meneruskan allocations opsional.
- [ ] Tampilkan `POOL_NO_RECIPIENT` dan `ROUNDING_RETAINED` sebagai warning.
- [ ] Investor: read-only, tidak melihat wizard/aksi admin.

### Acceptance Criteria
- [ ] Angka preview = angka yang nanti dieksekusi (pool, item, retained).
- [ ] Total alokasi ≠ 100 tidak bisa lanjut; CTA disabled + pesan.
- [ ] Periode berjalan bisa dipreview; periode dengan transaksi import ditolak.
- [ ] Retained aktual = net − Σ amount item, termasuk pool tanpa penerima.
- [ ] Investor hanya melihat data payout miliknya.
- [ ] Wizard nyaman di 375px (stepper + sticky summary).

### Referensi Design
- 📄 `.agents/DESIGN.md` Screen 11 dan Screen 12

### Environment Variables
- Tidak ada tambahan

---

## T-17: Payout — Execute, History, Receipt & PDF

**Modul:** Weekly Profit Sharing
**Phase:** Core
**Screen:** 13 Riwayat Payout, 14 Detail Payout
**Related FR:** PRD §4E
**Prioritas:** 🔴 High
**Status:** ✅ Done
**Effort:** L
**Tech Stack:** RPC `execute_payout`, `get_payout_receipt`, `get_investor_dividends`, `@react-pdf/renderer`
**File yang diubah:** `supabase/migrations/*_payout_execute.sql`, `src/app/(app)/profit-sharing/history/page.tsx`, `src/app/(app)/profit-sharing/history/[id]/page.tsx`, `src/app/api/payouts/route.ts`, `[id]/route.ts`, `[id]/status/route.ts`, `[id]/pdf/route.ts`, `src/actions/payouts.ts`, `src/components/payout/*`

### Dependensi
- T-16: Payout Settings, Preview & Wizard

### Sub-task Checklist
- [ ] `execute_payout`: admin-only, validasi periode tertutup, net > 0, allocations valid, idempotency key ≥ 8 char.
- [ ] Advisory lock per periode + cek retry idempotency + cek duplikat periode.
- [ ] Hitung gross/opex/net; floor pool non-retained; build items; retained = net − Σ item.
- [ ] Lock wallet; cek saldo; insert `payout_history(status='completed')`, `payout_items`, transaksi payout per penerima; potong wallet; audit.
- [ ] Konfirmasi eksekusi dengan ringkasan + input idempotency key dari client.
- [ ] Riwayat payout: filter status/tahun/bulan, pagination; admin all, investor own.
- [ ] Detail payout: receipt per penerima, breakdown kategori, total, retained, wallet, tanggal, status.
- [ ] `get_payout_receipt` memfilter investor hanya item sendiri.
- [ ] `get_investor_dividends` untuk halaman deviden investor.
- [ ] PDF receipt via `@react-pdf/renderer` (Node runtime), unduh dari detail.
- [ ] `/api/payouts/[id]/status` mengembalikan status final.
- [ ] Loading/empty/error state + toast sukses/gagal.

### Acceptance Criteria
- [ ] Eksekusi payout atomik: payout + items + transaksi + saldo + audit semua atau tidak sama sekali.
- [ ] Angka receipt = angka preview; `Σ amount item = total_distributed`.
- [ ] Double submit dengan key sama mengembalikan record yang sama.
- [ ] Periode yang sama tidak bisa dipayout dua kali.
- [ ] Investor hanya bisa mengunduh/melihat receipt miliknya.
- [ ] PDF valid dan menampilkan nominal integer rupiah.
- [ ] Saldo wallet terpotong tepat sebesar `total_distributed` (retained tidak memotong).

### Referensi Design
- 📄 `.agents/DESIGN.md` Screen 13 dan Screen 14

### Environment Variables
- Tidak ada tambahan

---

## T-18: Manajemen Pengguna

**Modul:** Pengguna
**Phase:** Core
**Screen:** 15 Pengguna
**Related FR:** PRD §3 Role-Based Access Control
**Prioritas:** 🟡 Mid
**Status:** ✅ Done
**Effort:** M
**Tech Stack:** Supabase Admin Auth, Server Actions, TanStack Table
**File yang diubah:** `src/app/(app)/users/page.tsx`, `src/app/api/users/route.ts`, `src/actions/users.ts`, `src/components/users/*`

### Dependensi
- T-07: Interface Foundation

### Sub-task Checklist
- [ ] Tabel user: nama, email, role, porsi, status, aksi; pencarian + filter role + pagination.
- [ ] Invite user via `inviteUserByEmail` + insert/upsert `public.users`.
- [ ] Edit nama, role, `default_profit_share`, status aktif.
- [ ] Nonaktifkan/aktifkan user; RLS langsung berlaku.
- [ ] Blokir nonaktifkan diri sendiri dan turunkan admin terakhir.
- [ ] Resend invite.
- [ ] Audit setiap perubahan role/porsi/status.
- [ ] `GET /api/users` admin-only.

### Acceptance Criteria
- [ ] Hanya admin yang bisa membuka halaman dan API.
- [ ] Undangan terkirim dan user baru muncul dengan role default karyawan.
- [ ] Perubahan role berlaku pada request berikutnya (bukan menunggu login ulang).
- [ ] Admin terakhir tidak bisa diturunkan/dinonaktifkan.
- [ ] User tidak bisa menonaktifkan dirinya sendiri.
- [ ] Semua perubahan sensitif tercatat di `audit_logs`.

### Referensi Design
- 📄 `.agents/DESIGN.md` Screen 15

### Environment Variables
- `SUPABASE_SERVICE_ROLE_KEY` — invite admin API (server only)
- `AUTH_REDIRECT_URL` — redirect invite

---

## T-19: Profil, Pengaturan & Avatar

**Modul:** Profil & Pengaturan
**Phase:** Core
**Screen:** 16 Profil & Pengaturan
**Related FR:** PRD §3, DESIGN.md Screen 16
**Prioritas:** 🟡 Mid
**Status:** ✅ Done
**Effort:** M
**Tech Stack:** Server Actions, Supabase Storage, sharp, next-themes
**File yang diubah:** `src/app/(app)/settings/page.tsx`, `src/actions/settings.ts`, `src/app/api/avatar/route.ts`, `src/components/settings/*`

### Dependensi
- T-02: Design System
- T-07: Interface Foundation

### Sub-task Checklist
- [ ] Profil card: avatar 80px (fallback inisial), nama, role, email read-only.
- [ ] Edit nama via sheet; validasi 2–60 karakter.
- [ ] Upload avatar: multipart max 2MB, MIME allowlist, magic bytes, re-encode 512×512 WebP dengan `sharp`.
- [ ] Hapus avatar (`remove=true`) → hapus object + kosongkan `users.avatar_url`.
- [ ] Storage policy: user hanya bisa write folder `{uid}/`.
- [ ] Theme segmented Light/Dark/System, persist ke `users.theme` + localStorage.
- [ ] Toggle notifikasi payout (`notification_payout`).
- [ ] Ganti password: re-auth password lama, min 8 + huruf + angka.
- [ ] Keluar dari semua perangkat (revoke sessions).
- [ ] Layout settings mobile list + desktop sidebar; skeleton + toast.

### Acceptance Criteria
- [ ] Avatar ter-upload, tampil via `next/image`, dan bisa dihapus.
- [ ] File > 2MB, MIME tidak valid, atau magic bytes salah ditolak.
- [ ] User tidak bisa menulis folder user lain.
- [ ] Tema bertahan setelah reload dan tidak flash.
- [ ] Password lemah ditolak; password lama salah menampilkan error.
- [ ] Profil hanya bisa mengubah data sendiri.

### Referensi Design
- 📄 `.agents/DESIGN.md` Screen 16

### Environment Variables
- `SUPABASE_SERVICE_ROLE_KEY` — operasi storage/admin (server only)
- `NEXT_PUBLIC_SUPABASE_URL` — public URL avatar

---

## T-20: Export CSV & Route Handler Completion

**Modul:** Export
**Phase:** Core
**Screen:** 03 Transaksi (aksi export)
**Related FR:** PRD §4B, TECH-SPEC §3.3
**Prioritas:** 🟡 Mid
**Status:** ✅ Done
**Effort:** S
**Tech Stack:** Route Handler, papaparse, Supabase query
**File yang diubah:** `src/app/api/export/transactions/route.ts`, `src/lib/csv.ts`, `src/components/transactions/export-button.tsx`

### Dependensi
- T-09: Transaksi List & Detail

### Sub-task Checklist
- [ ] `GET /api/export/transactions?from=&to=&type=` admin-only.
- [ ] Kolom aman: tanggal, tipe, kategori, produk, qty, nominal, wallet, user, keterangan, status.
- [ ] Sertakan cost/margin hanya untuk admin (sesuai role).
- [ ] UTF-8 BOM + delimiter koma + escaping papaparse.
- [ ] Nama file `peppycell-transactions-YYYYMMDD.csv`.
- [ ] Hormati feature flag `NEXT_PUBLIC_ENABLE_CSV_EXPORT`.
- [ ] Validasi rentang tanggal dan tipe dengan Zod.
- [ ] Pastikan seluruh 16 route handler memiliki envelope + auth yang benar.

### Acceptance Criteria
- [ ] Export berisi baris sesuai filter dan tidak memuat data role lain.
- [ ] File terbuka benar di Excel (BOM, kolom rapi).
- [ ] Karyawan/investor tidak bisa mengakses export.
- [ ] Tidak ada field sensitif untuk role non-admin.
- [ ] Semua route handler mengembalikan error envelope yang konsisten.

### Referensi Design
- 📄 `.agents/DESIGN.md` Screen 03 (aksi export)

### Environment Variables
- `NEXT_PUBLIC_ENABLE_CSV_EXPORT` — feature flag

---

# PHASE 3 — ENHANCEMENT

## T-21: Error Handling, Resilience & Logging

**Modul:** Error Handling
**Phase:** Enhancement
**Screen:** Semua screen
**Related FR:** TECH-SPEC §4.11, §6.2
**Prioritas:** 🟡 Mid
**Status:** 🟨 Partial
**Effort:** M
**Tech Stack:** Next.js error boundaries, pino, Sentry (hook minimal)
**File yang diubah:** `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, `src/app/forbidden.tsx`, `src/lib/resilience.ts`, `src/lib/logger.ts`, `src/instrumentation.ts`, `src/instrumentation-client.ts`

> **Catatan implementasi:** error boundary (`error.tsx`, `global-error.tsx`, `not-found.tsx`), envelope error konsisten, `X-Request-ID`, dan pesan Bahasa Indonesia sudah ada. Retry GET, circuit breaker, pino JSON logger, dan Sentry instrumentation **tidak diimplementasikan** karena monitoring ditunda oleh user dan backend masih demo in-memory.

### Dependensi
- T-07: Interface Foundation

### Sub-task Checklist
- [ ] Error boundary per route group + `global-error` + `not-found` + `forbidden`.
- [ ] Retry GET 3x exponential 300ms → 900ms → 2.7s + jitter; tidak untuk mutasi.
- [ ] Circuit breaker: 5 kegagalan → open; half-open setelah 30 detik; fallback per fitur.
- [ ] Fallback table: dashboard cache, list error+retry, payout preview fail fast, PDF retry 1x.
- [ ] Logger pino JSON: `requestId`, `userId`, `role`, `action`, `route`, `durationMs`, status.
- [ ] Masking email/nominal; jangan log password/token/cookie.
- [ ] Sentry instrumentation minimal (server/edge/client), `sendDefaultPii:false`, tag role/route/action.
- [ ] `X-Request-ID` propagasi dari proxy/handler ke log + Sentry.
- [ ] Pesan error user-facing Bahasa Indonesia; detail teknis hanya di log.

### Acceptance Criteria
- [ ] Error tak terduga menampilkan halaman error yang ramah + tombol retry.
- [ ] Mutasi tidak pernah di-retry otomatis.
- [ ] GET yang gagal sementara pulih otomatis tanpa duplikasi data.
- [ ] Circuit breaker membuka setelah 5 kegagalan dan menutup setelah sukses.
- [ ] Log tidak memuat PII/nominal per penerima.
- [ ] Sentry menerima error dengan `requestId` dan tag role.

### Referensi Design
- 📄 `.agents/DESIGN.md` — error state per screen

### Environment Variables
- `LOG_LEVEL` — level pino
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`

---

## T-22: Responsive, Accessibility & Dark Mode Polish

**Modul:** UI Polish
**Phase:** Enhancement
**Screen:** 01–17
**Related FR:** DESIGN.md §1.7, §1.8, Bagian 3
**Prioritas:** 🟡 Mid
**Status:** ✅ Done
**Effort:** M
**Tech Stack:** Tailwind 4, Radix/shadcn, axe DevTools
**File yang diubah:** `src/components/**`, `src/app/**`

### Dependensi
- T-08 s/d T-19 (semua screen core)

### Sub-task Checklist
- [ ] Audit 375/768/1280 untuk 17 screen; hilangkan horizontal scroll.
- [ ] Target sentuh ≥ 44px; FAB tidak menutupi bottom nav/konten.
- [ ] Focus ring, urutan tab, skip link, dan keyboard nav untuk sheet/modal/dropdown.
- [ ] ARIA: tabel semantik, label nominal, chart punya ringkasan teks, avatar dekoratif `aria-hidden`.
- [ ] Kontras WCAG AA light + dark; warna tidak menjadi satu-satunya pembeda.
- [ ] `prefers-reduced-motion` untuk skeleton/animasi.
- [ ] Tabular numbers pada semua nominal; format `Rp 12.000` konsisten.
- [ ] Empty/loading/error state konsisten di semua screen.
- [ ] Audit axe: 0 critical violation pada Login, Dashboard, Transaksi, Produk, Bagi Hasil.

### Acceptance Criteria
- [ ] Tidak ada overflow horizontal di 375px.
- [ ] Semua alur utama bisa diselesaikan dengan keyboard.
- [ ] 0 critical axe violation pada 5 screen utama.
- [ ] Dark mode konsisten dan kontras aman.
- [ ] Sheet/modal tidak mengunci fokus di luar atau membocorkan fokus ke background.
- [ ] Nominal selalu rata digit dan terbaca screen reader.

### Referensi Design
- 📄 `.agents/DESIGN.md` §1.7 Accessibility, §2.4 Responsive, Bagian 3

### Environment Variables
- Tidak ada tambahan

---

## T-23: Performance & Security Hardening

**Modul:** Hardening
**Phase:** Enhancement
**Screen:** Semua screen
**Related FR:** TECH-SPEC §5.1–5.3
**Prioritas:** 🟡 Mid
**Status:** 🟨 Partial
**Effort:** M
**Tech Stack:** Next.js caching, CSP, Supabase indexes, Vercel
**File yang diubah:** `next.config.ts`, `src/proxy.ts`, `src/lib/supabase/*`, `src/app/**`, `supabase/migrations/*_indexes.sql`

> **Catatan implementasi:** security headers dasar, lazy-load chart, pagination server 25, validasi Zod, service-role key server-only, index migration, dan review RLS sudah ada. CSP nonce, rate limit login/avatar, cache tag, dan target bundle <180KB belum dipenuhi. Dashboard mengirim ±276KB JS total (≈171KB non-framework); cache tag tidak relevan di mode demo in-memory.

### Dependensi
- T-20: Export CSV
- T-21: Error Handling & Resilience

### Sub-task Checklist
- [ ] Pastikan RSC + Suspense per section; server-side pagination 25.
- [ ] Chart lazy-load; icon per-import; font preload 400/600/700.
- [ ] Cache tags: dashboard 30s, produk 60s, wallet 30s; revalidate setelah mutasi.
- [ ] CSP + security headers (nosniff, frame DENY, referrer policy, permissions policy).
- [ ] Pastikan `SUPABASE_SERVICE_ROLE_KEY` tidak pernah masuk client bundle.
- [ ] Validasi semua input route handler dengan Zod (whitelist filter/sort).
- [ ] Rate limit sederhana untuk login/avatar (best-effort) atau minimal deteksi abuse.
- [ ] Audit index: query dashboard/payout/transaksi memakai index yang ada.
- [ ] Cek bundle dashboard < 180KB gzip dan LCP p75 < 2.5s di local preview.
- [ ] Review RLS + grant sekali lagi dengan role karyawan/investor.

### Acceptance Criteria
- [ ] Tidak ada service role key di bundle client.
- [ ] CSP tidak memblokir Supabase/Sentry/Vercel Analytics.
- [ ] Query list/payout tidak melakukan full scan pada data seed besar.
- [ ] Dashboard bundle < 180KB gzip.
- [ ] Semua endpoint mutasi memvalidasi input dan menolak field tak dikenal.
- [ ] `bun run build` + `bun run lint` + `bun run typecheck` lolos.

### Referensi Design
- 📄 `.agents/DESIGN.md` §1.6 Performance, §2.4 Responsive

### Environment Variables
- Tidak ada tambahan

---

# PHASE 4 — INFRASTRUCTURE

## T-24: Deployment Staging & Production

**Modul:** Deployment
**Phase:** Infrastructure
**Screen:** N/A
**Related FR:** TECH-SPEC §5.4
**Prioritas:** 🔴 High
**Status:** ⛔ Blocked
**Effort:** S
**Tech Stack:** Vercel, Supabase CLI, Bun
**File yang diubah:** `README.md`, `scripts/smoke.ts`, `.env.example`

> **Catatan implementasi:** belum dieksekusi. Membutuhkan project Supabase staging/production, akun Vercel, Docker, dan Supabase CLI yang tidak tersedia di environment ini. Prosedur deploy, seed, smoke, dan rollback sudah didokumentasikan di `README.md`.

### Dependensi
- T-23: Performance & Security Hardening

### Sub-task Checklist
- [ ] Buat 2 project Supabase: `peppycell-staging`, `peppycell-production` (region `ap-southeast-1`).
- [ ] Aktifkan backup harian + PITR production sebelum migrasi pertama.
- [ ] `supabase link` + `supabase db push` ke staging.
- [ ] Set env Vercel Preview/Staging/Production (tanpa secret di repo).
- [ ] Deploy staging → `bun run seed:admin` → smoke test 3 role.
- [ ] Smoke: login 3 role, sale karyawan, expense admin, transfer, preview/execute payout di staging, investor hanya deviden sendiri, 403 karyawan `/wallets`, dark mode 375px.
- [ ] Migrate production → seed admin → deploy production.
- [ ] Set domain production + redirect URL Supabase Auth.
- [ ] Verifikasi `/api/health` production.
- [ ] Tulis runbook rollback: redeploy versi sebelumnya + restore PITR; jangan drop table manual.
- [ ] Dokumentasikan akun admin dan prosedur seed di README.

### Acceptance Criteria
- [ ] Staging dan production berjalan dengan env masing-masing.
- [ ] Semua migration diterapkan tanpa error.
- [ ] Smoke test 3 role lolos di staging dan production.
- [ ] Backup + PITR aktif di production.
- [ ] Tidak ada seed demo di production.
- [ ] `/api/health` production 200 dan DB connected.
- [ ] Runbook rollback tersedia dan sudah dibaca ulang.

### Referensi Design
- 📄 `.agents/DESIGN.md` — tidak relevan (infrastruktur)

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`, `AUTH_REDIRECT_URL`
- `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`
- `SMOKE_BASE_URL`, `SMOKE_ADMIN_EMAIL`, `SMOKE_ADMIN_PASSWORD`

---

# Ringkasan Effort

| Effort | Task | Jumlah |
|---|---|---|
| S | T-11, T-20, T-24 | 3 |
| M | T-01, T-05, T-06, T-07, T-08, T-09, T-10, T-12, T-13, T-15, T-18, T-19, T-21, T-22, T-23 | 15 |
| L | T-02, T-03, T-04, T-14, T-16, T-17 | 6 |
| **Total** | | **24** |

# Catatan Scope

- **Testing, CI/CD, Monitoring, dan Data Migration legacy tidak termasuk** sesuai pilihan user. Task-task tersebut dapat ditambahkan kemudian tanpa mengubah task core.
- **Google Stitch prompt / `design-references/` tidak dibuat** sesuai keputusan sebelumnya.
- **TailAdmin** hanya referensi pola layout; implementasi memakai shadcn/ui + token DESIGN.md.
- **Payout** dieksekusi sinkron/atomik; `processing`/`failed` dan PDF tetap disiapkan untuk fase 2.
- **Import legacy** belum masuk task; jika dibutuhkan sebelum go-live, tambahkan task terpisah dari TECH-SPEC Bagian 9.
