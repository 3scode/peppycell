# PeppyCell

Mini ERP untuk konter pulsa & kuota: catat penjualan, kelola aset, dan bagi hasil laba mingguan secara aman per role.

Aplikasi web mobile-first berbahasa Indonesia dengan mode terang/gelap. Dibangun dengan Next.js 16 App Router, React 19, Tailwind CSS 4, dan Supabase (Postgres/Auth/RLS) sebagai target produksi.

> **Status saat ini:** seluruh data operasional (produk & riwayat harga, transaksi, wallet, payout, pengguna, dashboard) dibaca/ditulis langsung ke **Supabase** (Postgres + RLS + RPC). Tidak ada fallback data demo/in-memory.

---

## Quick Start (Supabase)

Prasyarat: **Bun 1.4+** (Node 20+ juga bisa untuk `npm`/`pnpm`, tetapi lockfile memakai Bun) dan project Supabase.

```bash
cp .env.example .env.local   # isi URL, anon key, dan service role key
bun install
bun run dev
```

Buka <http://localhost:3000>. Aplikasi **wajib** terhubung ke Supabase: autentikasi, produk, transaksi, wallet, payout, dan dashboard dibaca/ditulis langsung ke database. Tidak ada data demo in-memory.

Buat akun admin pertama:

```bash
bun run seed:admin -- --email=admin@peppycell.id --password=Admin123! --name="Admin PeppyCell"
```

---

## Perintah

| Perintah | Fungsi |
|---|---|
| `bun run dev` | Development server (Turbopack) |
| `bun run build` | Build produksi |
| `bun run start` | Jalankan hasil build (`next start`) |
| `bun run lint` | ESLint seluruh project |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run check-env` | Validasi environment sebelum deploy |
| `bun run seed:admin` | Buat/perbarui akun Admin di Supabase |
| `bun run smoke:staging` | Smoke test endpoint staging |
| `bun run smoke:production` | Smoke test endpoint production |

Seed & smoke membutuhkan environment Supabase yang valid (lihat di bawah).

---

## Environment

Salin contoh:

```bash
cp .env.example .env.local
```

### Wajib Supabase

Isi variabel berikut (tanpa ini aplikasi tidak bisa login):

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # server-only, untuk seed & admin API
TZ=Asia/Jakarta
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Jalankan `bun run check-env` untuk memastikan konfigurasi valid.

> **Penting:** saat env Supabase terisi, autentikasi dan seluruh data operasional memakai Supabase (tabel + RPC). Migration `202611120001`–`004` menambahkan riwayat harga produk, batch penjualan, serta RPC edit/hapus yang belum ada.

---

## Setup Supabase (Database & Auth)

### 1. Migration

Dengan Supabase CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Atau jalankan file SQL berikut secara berurutan lewat SQL Editor:

```
supabase/migrations/202611070001_init_extensions.sql
supabase/migrations/202611070002_enums.sql
supabase/migrations/202611070003_core_tables.sql
supabase/migrations/202611070004_indexes.sql
supabase/migrations/202611070005_rls.sql
supabase/migrations/202611070006_functions.sql
supabase/migrations/202611070007_seed_reference.sql
supabase/migrations/202611070008_storage_avatars.sql
```

Lalu opsional:

```bash
supabase db reset   # lokal, butuh Docker
# atau jalankan supabase/seed.sql untuk katalog contoh
```

### 2. Akun & Seed

```bash
export NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
bun run seed:admin -- --email=admin@peppycell.id --password=Admin123! --name="Admin PeppyCell"
```

`seed:admin` membuat akun Auth + profil `users` + `payout_settings`. Tidak ada seed data dummy; produk, wallet, dan transaksi diisi dari aplikasi.

> **Catatan koneksi DB:** host `db.<project-ref>.supabase.co` hanya punya record IPv6. Jika jaringan IPv4-only, pakai pooler:
>
> ```
> postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
> ```
>
> Project PeppyCell berada di region `ap-south-1`.

### 3. Storage Avatar

Migration `008` membuat bucket publik `avatars` (maks 2MB, JPG/PNG/WebP) beserta policy per-user. Upload diproses di server dengan `sharp`: crop persegi 512×512, konversi WebP.

---

## Deploy & Rollback Runbook

Belum dieksekusi karena project Supabase/Vercel dan Docker belum tersedia. Ikuti urutan ini saat kredensial siap.

### Staging

1. Buat project `peppycell-staging` (region `ap-southeast-1`), aktifkan backup harian.
2. `supabase link --project-ref <staging-ref>` lalu `supabase db push`.
3. Set environment Vercel Preview/Staging: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `AUTH_REDIRECT_URL`, `TZ=Asia/Jakarta`.
4. Jalankan `bun run check-env` dengan env staging.
5. `bun run seed:admin -- --email=... --password=... --name="Admin PeppyCell"`.
6. Deploy ke staging, lalu `SMOKE_BASE_URL=https://<staging> bun run smoke:staging`.
7. Uji manual 3 role: login, penjualan karyawan, pengeluaran admin, transfer, preview/execute payout, investor hanya deviden sendiri, karyawan 403 di `/wallets`, dark mode 375px.

### Production

1. Aktifkan backup harian + PITR **sebelum** migration pertama.
2. Ulangi `supabase db push`, set env production, lalu deploy.
3. Seed admin production.
4. Verifikasi `/api/health` → 200 dan `db` terhubung.
5. Set domain production + redirect URL Supabase Auth.
6. Jalankan `SMOKE_BASE_URL=https://<production> bun run smoke:production`.

### Rollback

- **Aplikasi:** promote deployment Vercel sebelumnya.
- **Database:** restore dari PITR/backup; jangan drop table manual.
- **Migration gagal sebagian:** perbaiki dengan migration baru (fix-forward); jangan mengubah file migration yang sudah diterapkan.
- **Payout salah:** payout tidak dibatalkan; catat penyesuaian saldo beraudit dan investigasi lewat `audit_logs`.

---

## Role & Keamanan Data

| Kapabilitas | Admin | Karyawan | Investor |
|---|---|---|---|
| Dashboard laba & aset | ✅ | ❌ (hanya transaksi sendiri hari ini) | ✅ agregat |
| Transaksi | ✅ semua | ✅ miliknya hari ini | ❌ |
| Harga beli / margin | ✅ | ❌ | ❌ |
| Wallet & saldo | ✅ | ❌ | ❌ |
| Transfer / adjustment | ✅ | ❌ | ❌ |
| Void transaksi | ✅ | ❌ | ❌ |
| Bagi hasil / payout | ✅ | ❌ | ❌ |
| Riwayat & bukti deviden | ✅ semua | ❌ | ✅ miliknya |
| Pengguna | ✅ | ❌ | ❌ |
| Pengaturan profil | ✅ | ✅ | ✅ |

Pengamanan diterapkan berlapis:

1. **UI** menyembunyikan menu dan nominal sensitif.
2. **Server** menolak aksi/route dengan role salah (`FORBIDDEN`).
3. **Payload API** karyawan tidak memuat margin, laba, aset, atau saldo wallet.
4. **Database** (target produksi) memisahkan `product_costs` / `transaction_costs` dengan RLS Admin-only dan mencabut write langsung dari `authenticated`; mutasi hanya lewat RPC `security definer`.

---

## Aturan Bisnis Kunci

- **Uang selalu integer rupiah.** Pembulatan memakai `floor` + largest remainder.
- **Payout mingguan** Senin–Minggu, hanya periode tertutup.
- Pool non-retained di-floor; sisa pembulatan dan pool tanpa penerima diserap **retained earnings**.
- Retained **tidak** mengurangi saldo wallet; hanya total yang benar-benar dibagikan yang memotong wallet.
- **Void** membuat jurnal reversal (`reversalOf`), bukan menghapus transaksi.
- Transaksi **historis hasil import** dikecualikan dari agregat laba/margin dan tidak bisa di-void; periode yang memuatnya ditolak untuk payout.
- Payout tidak dapat dibatalkan; koreksi dilakukan lewat penyesuaian saldo beraudit.

---

## Route API

Semua response memakai envelope:

```json
{ "success": true, "data": {}, "error": null, "meta": null }
```

Header `X-Request-ID` selalu dikembalikan. Error memakai `{ success: false, data: null, error: { code, message, details }, meta: null }`.

| Method | Path | Akses |
|---|---|---|
| GET | `/api/health` | Publik |
| GET | `/api/me` | Semua role |
| GET | `/api/dashboard?start=&end=` | Semua role (payload berbeda) |
| GET | `/api/transactions` | Admin, Karyawan |
| GET | `/api/transactions/[id]` | Admin, Karyawan (miliknya) |
| GET | `/api/products` | Admin, Karyawan |
| GET | `/api/wallets` | Admin |
| GET | `/api/wallets/[id]` | Admin |
| GET | `/api/payouts` | Admin, Investor |
| GET | `/api/payouts/[id]` | Admin, Investor (miliknya) |
| GET | `/api/payouts/[id]/status` | Admin |
| GET | `/api/payouts/[id]/pdf` | Admin, Investor (miliknya) |
| GET | `/api/users` | Admin |
| GET | `/api/export/transactions` | Admin (CSV) |
| POST/DELETE | `/api/avatar` | Semua role |

Mutasi form memakai **Server Actions** di `src/actions/*` (auth + role + Zod + revalidate), bukan token API di client.

---

## Struktur Project

```
src/
├─ app/
│  ├─ (auth)/login/
│  ├─ (app)/dashboard|transactions|products|wallets|profit-sharing|users|settings/
│  ├─ api/...
│  ├─ 403/ · error.tsx · global-error.tsx · not-found.tsx
│  └─ globals.css · layout.tsx
├─ actions/              # Server Actions per modul
├─ components/
│  ├─ ui/                # primitives: button, input, modal, table, badge, dll.
│  ├─ layout/            # sidebar, topbar, bottom nav, theme toggle
│  ├─ dashboard/ · transactions/ · payouts/ · wallets/ · users/ · settings/
│  └─ providers/
├─ lib/
│  ├─ supabase/          # browser/server/admin client
│  ├─ validations/       # Zod schemas
│  ├─ pdf/               # bukti payout React-PDF
│  ├─ auth/session.ts    # guard + cookie sesi
│  └─ money.ts · period.ts · errors.ts · api.ts
├─ types/domain.ts
└─ proxy.ts              # guard route + refresh sesi
supabase/
├─ migrations/           # 001–008 + 20261112 (Supabase data layer)
├─ seed.sql
└─ config.toml
scripts/                 # check-env, seed-admin, smoke
```

---

## Verifikasi

Sudah dijalankan pada environment ini:

```bash
bun run typecheck   # lolos
bun run lint        # lolos, 0 warning
bun run build       # lolos, 34 route
```

Smoke test manual (production build di port 3100):

- `/api/health` → 200, `mode=supabase`, counts sesuai isi database
- `/api/me` tanpa sesi → 401 `UNAUTHORIZED`
- `/api/wallets` sebagai karyawan → 403 `FORBIDDEN`
- `/api/products` sebagai karyawan → 200 tanpa `hargaBeli`
- `/api/dashboard` sebagai karyawan → hanya metrik pribadi (tanpa laba/aset)
- `/api/payouts/[id]/pdf` → `application/pdf`, ±5KB
- `/api/export/transactions` → CSV UTF-8 ±17KB
- Investor hanya menerima item payout miliknya

Verifikasi browser (Chromium headless, production build):

- **Visual:** 16 target halaman × 375/768/1280 × light/dark = 96 pemeriksaan; tanpa overflow horizontal dan tanpa console error.
- **Aksesibilitas:** axe pada Login, Dashboard, Transaksi, Produk, Bagi Hasil (375px & 1280px) → 0 critical, 0 serious.
- **E2E mutasi:** penjualan → void menghasilkan reversal; pengeluaran, transfer, penyesuaian saldo, dan payout berhasil. Payout uji 19–25 Okt 2026: net 377.000, retained 75.400, dibagikan 301.600, Σ item = 301.600.
- **Bundle dashboard:** ±276KB JS transfer total (±171KB non-framework). Target <180KB total belum dipenuhi.

Untuk staging/production:

```bash
SMOKE_BASE_URL=https://app.example.com bun run smoke:staging
```

---

## Batasan Saat Ini

- **TypeScript 6.0.3**, bukan 7.0.2 seperti di TECH-SPEC, karena `typescript-eslint` belum mendukung TS 7. Build & typecheck tetap strict.
- **Font Inter** tidak diunduh; stack font memakai `system-ui` sebagai fallback.
- **T-21 partial:** error boundary, envelope error, `X-Request-ID`, dan pesan Bahasa Indonesia tersedia; retry GET, circuit breaker, pino JSON logger, dan Sentry belum diimplementasikan karena monitoring ditunda.
- **T-23 partial:** security headers dasar, lazy chart, pagination server, validasi Zod, service-role server-only, index, dan RLS review tersedia; CSP nonce, rate limit login/avatar, cache tag, dan target bundle <180KB belum dipenuhi.
- **T-24 blocked:** deployment staging/production belum dieksekusi; butuh project Supabase, akun Vercel, Docker, dan Supabase CLI. Runbook tersedia di atas.
- **Sentry/Axiom/Vercel Analytics** belum dikonfigurasi; dependency tersedia untuk fase monitoring berikutnya.
- **Notifikasi** hanya banner in-app; email/push belum aktif.
- **Testing otomatis, CI/CD, dan migrasi data legacy** tidak dipilih dalam scope task.
- **Belum ada commit Git.** Repository sudah diinisialisasi, seluruh file masih uncommitted.

---

## Dokumen Terkait

- `.agents/DESIGN.md` — design system & 17 screen spec
- `.agents/TECH-SPEC.md` — arsitektur, skema, RPC, route
- `.agents/TASKS.md` — breakdown 24 task
- `.agents/PROGRESS.md` — catatan progres implementasi
