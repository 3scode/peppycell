# Progress Dashboard — PeppyCell Web System

> Terakhir diperbarui: 11 Nov 2026

## Status Ringkas

| Tahap | Status | Output | Catatan |
|---|---|---|---|
| PRD | ✅ Done | `prd.md` | Mini ERP konter pulsa |
| Create Design | ✅ Done | `.agents/DESIGN.md` | 17 screen, 12 reusable components, light + dark |
| Design System | ✅ Done | DESIGN.md Bagian 1 | Indigo/teal, 4px grid, WCAG AA |
| Screen Map | ✅ Done | DESIGN.md Bagian 2 | 17 screen, 5 user flow, mobile-first |
| Per-Screen Design | ✅ Done | DESIGN.md Bagian 3 | Termasuk state, skeleton, a11y, responsive |
| Component Specs | ✅ Done | DESIGN.md Bagian 4 | 12 component reusable |
| Google Stitch Prompt | ⏭️ Skipped | — | Dipilih "Tidak perlu" oleh user |
| Tech Spec | ✅ Done | `.agents/TECH-SPEC.md` | 9 bagian + appendix; review konsistensi lolos |
| Task Breakdown | ✅ Done | `.agents/TASKS.md` | 24 task; status akhir 21 done, 2 partial, 1 blocked |
| Implementasi | ✅ Done (core) | `src/`, `supabase/`, `scripts/` | Seluruh modul produk berjalan; detail batasan di bawah |
| Verifikasi | ✅ Done | — | lint, typecheck, build, visual, axe, smoke API, E2E mutasi |

## Implementasi

- **34 route** Next.js App Router: 17 screen produk + auth/error/API/icon.
- **Modul:** dashboard role-adaptive, transaksi (list/detail/penjualan/pengeluaran/void), produk & margin, wallet/aset, transfer & penyesuaian saldo, bagi hasil (settings/preview/wizard/eksekusi/history/PDF), pengguna, profil & pengaturan, avatar, export CSV.
- **Role safety berlapis:** navigasi per role, guard `proxy.ts`, `requireRole`, validasi Server Action, filter repository, dan sanitasi payload API. Karyawan tidak menerima margin/harga beli/saldo/aset; investor hanya menerima deviden miliknya.
- **Payout:** Senin–Minggu, periode tertutup, pool non-retained di-floor, largest remainder per pool, retained menyerap sisa & pool tanpa penerima, retained tidak memotong wallet.
- **Void:** jurnal reversal (`reversalOf`), bukan delete. Transaksi historis import dikecualikan dari agregat dan tidak bisa di-void.
- **Mode demo:** tanpa env Supabase, aplikasi memakai repository in-memory (`src/lib/demo/*`) dengan 4 user, 10 produk, 3 wallet, ±140 transaksi, dan 2 payout historis. Data reset saat server restart.
- **Supabase:** migration `001`–`008`, RLS, RPC, trigger, seed SQL, dan klien browser/server/admin sudah tersedia untuk target produksi.

## Verifikasi Akhir

Dijalankan pada production build lokal (port 3100):

```bash
bun run typecheck   # lolos
bun run lint        # lolos, 0 warning
bun run build       # lolos, 34 route
```

- **Visual:** 16 target halaman × 375/768/1280 × light/dark = **96 pemeriksaan**. Semua status < 400, tanpa overflow horizontal, tanpa console error. Ditemukan dan diperbaiki: overflow tabel payout detail di 768px dan tombol menu akun tanpa nama aksesibel.
- **Aksesibilitas:** axe pada Login, Dashboard, Transaksi, Produk, Bagi Hasil (375px & 1280px) = **0 critical, 0 serious**.
- **API smoke:** `/api/health` 200 (`mode=demo`, 4 user/10 produk/3 wallet/141 transaksi); `/api/me` tanpa sesi 401; karyawan 403 di `/api/wallets` dan `/api/users`; investor 403 di `/api/transactions`; produk karyawan tanpa `hargaBeli`; dashboard karyawan hanya metrik pribadi; PDF 200 `application/pdf` ±5KB; CSV 200 `text/csv` ±17KB.
- **Filter investor:** investor 1 hanya menerima item `u-investor-1`, investor 2 hanya `u-investor-2`; akses payout milik investor lain ditolak.
- **E2E mutasi:** penjualan dibuat lalu di-void menghasilkan reversal; pengeluaran, transfer wallet, penyesuaian saldo, dan payout berhasil. Payout uji periode 19–25 Okt 2026: net 377.000, retained 75.400, dibagikan 301.600, Σ item = 301.600.
- **Bundle dashboard:** ±276KB JS transfer total; ±171KB non-framework. Target <180KB total belum dipenuhi.

## Tech Stack Aktual

| Layer | Pilihan |
|---|---|
| Framework | Next.js 16.4.5 (App Router, RSC, Server Actions, `proxy.ts`) |
| UI Runtime | React 19.3.1 + TypeScript **6.0.3** |
| Styling | Tailwind CSS 4.3.5 + UI primitives custom berbasis token DESIGN.md |
| Database | Supabase PostgreSQL 17 (migration siap; runtime belum diuji) |
| Auth | Supabase Auth saat env terisi; cookie demo saat mode demo |
| Security | RLS deny-by-default + RPC `SECURITY DEFINER` + tabel cost terpisah |
| Hosting | Vercel region `sin1` (belum dideploy) |
| Package manager | Bun 1.4.4 |

## Keputusan & Deviasi

- **TypeScript 6.0.3**, bukan 7.0.2 di TECH-SPEC: `typescript-eslint` hard-throw untuk TS 7.0. Typecheck tetap strict.
- **UI primitives custom**, bukan instalasi Radix/shadcn penuh. `components.json` tidak dibuat; komponen mengikuti token dan pola DESIGN.md.
- **Prettier & Supabase CLI tidak dipasang**; lint memakai ESLint dan migration dijalankan lewat SQL Editor/CLI saat tersedia.
- **`.env.local` tidak dibuat** karena mode demo tidak membutuhkan env; `.env.example` tetap lengkap.
- **Font Inter tidak diunduh**; stack memakai `system-ui` sebagai fallback.
- **Data operasional masih demo in-memory.** Saat env Supabase terisi, autentikasi memakai Supabase Auth, tetapi CRUD transaksi/wallet/payout belum memakai tabel Supabase.
- **Payout & void** mengikuti aturan TECH-SPEC; tidak ada pembatalan payout, koreksi lewat penyesuaian saldo beraudit.
- **Avatar** diproses client-side (crop 256×256 WebP) lalu server-side `sharp` (512×512 WebP); demo menyimpan data URL, Supabase menyimpan di bucket `avatars`.
- **Tidak ada commit Git.** Repository sudah diinisialisasi, seluruh file masih uncommitted.

## Batasan & Risiko

- **Migrasi/RLS/RPC belum dijalankan ke Postgres sungguhan** karena Docker dan Supabase CLI tidak tersedia. Migration `006_functions.sql` paling berisiko dan perlu diuji dengan `supabase db reset`.
- **Adaptor data Supabase belum ada**; aplikasi belum siap menyimpan data produksi.
- **T-21 partial:** error boundary, envelope error, `X-Request-ID`, dan pesan Bahasa Indonesia ada; retry/circuit breaker, pino JSON logger, dan Sentry belum diimplementasikan karena monitoring ditunda.
- **T-23 partial:** security headers, lazy chart, pagination server, Zod, service-role server-only, index, dan RLS review ada; CSP nonce, rate limit, cache tag, dan target bundle <180KB belum dipenuhi.
- **T-24 blocked:** deployment staging/production membutuhkan project Supabase, akun Vercel, Docker, dan Supabase CLI. Prosedur ada di `README.md`.
- **Mode demo:** data hilang saat restart dan password disimpan plaintext di memori. Jangan dipakai untuk data nyata.
- **Testing otomatis, CI/CD, Monitoring, dan migrasi data legacy** tidak dipilih dalam scope.

## Next Action

1. Sediakan Docker + Supabase CLI, lalu jalankan `supabase db reset` dan perbaiki migration bila perlu.
2. Implementasikan adaptor data Supabase (transaksi, wallet, payout) dan ganti repository demo per modul.
3. Isi kredensial staging/production, lalu eksekusi T-24 mengikuti runbook `README.md` (seed admin, smoke 3 role, backup/PITR, rollback).
4. Jika monitoring diaktifkan: tambahkan pino logger, retry/circuit breaker, Sentry instrumentation, CSP nonce, dan rate limit login/avatar.
