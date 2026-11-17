# DESIGN.md — PeppyCell Web System

> **Versi:** 1.0 · **Tanggal:** 07 Nov 2026 · **Status:** Ready for review
> **Sumber:** [`prd.md`](../prd.md) · **Skill:** create-design
> **Platform:** Web (mobile-first) · **Mode:** Light + Dark · **Style:** Modern & Clean

---

## 0. Ringkasan Produk

PeppyCell adalah **mini ERP untuk konter pulsa & kuota** yang menggantikan pencatatan manual CSV/Excel. Fokusnya bukan cuma mencatat jual-beli, tapi mengubah angka operasional harian menjadi **laporan laba** dan **pembagian hasil mingguan** yang bisa dieksekusi satu klik.

| Aspek | Keputusan |
|---|---|
| Target pengguna | Admin/Pemilik (Trisno), Karyawan/Kasir, Investor |
| Platform | Web app responsif — mobile-first, desktop-enhanced |
| Mode | Light + Dark (wajib, mengikuti PRD/TailAdmin) |
| Tech constraint | Next.js + Supabase + Tailwind CSS + shadcn/ui + TailAdmin layout |
| Zona waktu | Asia/Jakarta (WIB), periode mingguan Senin 00:00 – Minggu 23:59 |
| Bahasa UI | Bahasa Indonesia, nada netral-profesional (bukan "lo/gue") |

### Unique Value Proposition (UVP)

> **Dashboard konter pulsa pertama yang profit-first & role-safe:** karyawan input transaksi tanpa pernah melihat modal/margin, dan laba mingguan otomatis terbagi ke gaji, deviden investor, dan kas ditahan — satu klik payout.

UVP ini diterjemahkan ke tiga keputusan desain:

1. **Role-safe by design** — data sensitif *tidak dirender*, bukan sekadar di-disable. Karyawan tidak akan menemukan kolom modal, margin, saldo wallet, atau total aset di DOM.
2. **Profit-first hierarchy** — angka laba bersih selalu jadi hero metric, bukan omzet.
3. **One-click payout** — wizard bagi hasil 3 langkah dengan preview rupiah per penerima sebelum eksekusi.

### Prinsip Desain

| # | Prinsip | Implementasi |
|---|---|---|
| 1 | **Mobile-first, thumb-first** | Aksi utama di 1/3 bawah layar; bottom nav + FAB "Catat"; target sentuh ≥ 44px |
| 2 | **Role-safe** | Menu, kolom, dan card difilter per role; akses langsung ke route terlarang → 403 |
| 3 | **Money clarity** | Semua nominal pakai tabular numbers, format `Rp 12.000`, warna hanya untuk makna (masuk/keluar/laba) |
| 4 | **Progressive disclosure** | Detail transaksi & form pendek pakai sheet/drawer; halaman penuh hanya untuk alur kompleks |
| 5 | **One primary action** | Tiap screen punya tepat 1 CTA utama; aksi destruktif selalu secondary + konfirmasi |
| 6 | **Calm & trustworthy** | Kanvas netral, aksen indigo/teal, tanpa dekorasi berlebih — investor harus merasa ini "buku keuangan", bukan game |

---

# BAGIAN 1 — Design System

### Design Style

- **Style:** Modern & Clean
- **Platform:** Web, mobile-first (breakpoint utama 768px & 1024px)
- **Mode:** Light + Dark (token paralel, kontras WCAG AA)
- **Unique Value Proposition:** Profit-first & role-safe weekly profit sharing

## 1.1 Color Palette

### Light Mode

| Token | Hex | Usage | Kontras |
|---|---|---|---|
| `--color-primary` | `#4F46E5` | Brand, CTA utama, link aktif, series chart 1 | 6.6:1 vs putih ✅ |
| `--color-primary-hover` | `#4338CA` | Hover/pressed CTA primer | 8.3:1 vs putih ✅ |
| `--color-primary-soft` | `#EEF2FF` | Background selected nav, badge netral-brand, focus halo | — |
| `--color-secondary` | `#0F766E` | Aksen "uang masuk", series chart 2, highlight sekunder | 5.4:1 vs putih ✅ |
| `--color-surface` | `#FFFFFF` | Background card, sheet, modal, tabel | — |
| `--color-background` | `#F7F8FC` | Background halaman | — |
| `--color-text-primary` | `#101828` | Judul, body utama, angka | 16.9:1 vs putih ✅ |
| `--color-text-secondary` | `#667085` | Label, helper text, metadata | 5.3:1 vs putih ✅ |
| `--color-error` | `#D92D20` | Error, nominal keluar, aksi destruktif | 5.0:1 vs putih ✅ |
| `--color-success` | `#12B76A` | Fill badge sukses, indikator positif (bukan teks kecil) | 2.3:1 — fill only ⚠️ |
| `--color-success-text` | `#027A48` | Teks sukses / nominal masuk | 5.2:1 vs putih ✅ |
| `--color-warning` | `#F79009` | Fill badge warning, status "Diproses" | 2.1:1 — fill only ⚠️ |
| `--color-warning-text` | `#B54708` | Teks warning | 4.8:1 vs putih ✅ |
| `--color-border` | `#EAECF0` | Divider, border card/input | — |

### Dark Mode

| Token | Hex | Usage | Kontras |
|---|---|---|---|
| `--color-primary-dark` | `#818CF8` | Brand, CTA, link aktif (teks di atas primary: `#0C111D`) | 8.1:1 vs bg ✅ |
| `--color-primary-hover-dark` | `#A5B4FC` | Hover/pressed CTA | 9.9:1 vs bg ✅ |
| `--color-primary-soft-dark` | `#1E1B4B` | Selected nav, badge brand | — |
| `--color-secondary-dark` | `#2DD4BF` | Aksen uang masuk, series chart 2 | 10.0:1 vs bg ✅ |
| `--color-surface-dark` | `#161B26` | Card, sheet, modal, tabel | — |
| `--color-surface-elevated-dark` | `#1F2633` | Dropdown, tooltip, hover row | — |
| `--color-background-dark` | `#0C111D` | Background halaman | — |
| `--color-text-primary-dark` | `#F5F7FA` | Judul, body, angka | 16.2:1 vs bg ✅ |
| `--color-text-secondary-dark` | `#98A2B3` | Label, helper, metadata | 5.9:1 vs surface ✅ |
| `--color-error-dark` | `#F97066` | Error, nominal keluar | 5.9:1 vs surface ✅ |
| `--color-success-dark` | `#32D583` | Teks/nominal sukses (aman untuk teks di dark) | 9.1:1 vs surface ✅ |
| `--color-warning-dark` | `#FDB022` | Teks warning, status Diproses | 9.8:1 vs surface ✅ |
| `--color-border-dark` | `#2A3441` | Divider, border card/input | — |

### Semantic Badge Colors

| Makna | Light bg / text | Dark bg / text | Icon |
|---|---|---|---|
| Pemasukan / income | `#ECFDF3` / `#027A48` | `rgba(50,213,131,.12)` / `#32D583` | `ArrowDownLeft` |
| Pengeluaran / expense | `#FEF3F2` / `#B42318` | `rgba(249,112,102,.12)` / `#F97066` | `ArrowUpRight` |
| Transfer / mutasi | `#EEF2FF` / `#4338CA` | `rgba(129,140,248,.14)` / `#A5B4FC` | `ArrowLeftRight` |
| Payout / bagi hasil | `#F4F3FF` / `#5925DC` | `rgba(164,138,255,.14)` / `#C3B5FD` | `HandCoins` |
| Netral / nonaktif | `#F2F4F7` / `#475467` | `rgba(152,162,179,.12)` / `#98A2B3` | `Minus` |

> **Aturan warna nominal:** masuk = `success-text`, keluar = `error`, transfer = `text-primary` (netral, karena bukan laba/rugi), payout = `text-secondary` pada list admin (bukan beban operasional baru).
> Warna tidak pernah jadi satu-satunya pembeda — selalu ada ikon + label teks (WCAG 1.4.1).

## 1.2 Typography

**Font Family:** `Inter` (400/500/600/700), fallback `system-ui, -apple-system, sans-serif`.
Aktifkan `font-feature-settings: "tnum" 1, "cv11" 1` pada semua elemen nominal agar digit rata.

| Token | Value | Usage |
|---|---|---|
| `--font-h1` | 24px / 32px / 700, tracking −0.02em (mobile 22/30) | Judul halaman, hero dashboard |
| `--font-h2` | 20px / 28px / 600, tracking −0.01em | Judul section, judul sheet |
| `--font-h3` | 16px / 24px / 600 | Judul card, nama produk, header tabel |
| `--font-body` | 14px / 22px / 400 | Body, isi tabel, deskripsi |
| `--font-caption` | 12px / 18px / 500 | Label form, helper, metadata, badge |
| `--font-button` | 14px / 20px / 600 | Semua tombol & tab |
| `--font-money-lg` | 28px / 36px / 700, tabular-nums (mobile 26/34) | Hero laba bersih, total aset, saldo wallet |

**Aturan:** maksimal 3 level tipografi per layar. Angka nominal selalu `font-variant-numeric: tabular-nums`. Jangan gunakan font weight < 400 untuk teks 12px.

## 1.3 Spacing (4px Grid)

| Token | Value | Usage umum |
|---|---|---|
| `--space-xs` | 4px | Gap icon–teks, padding badge |
| `--space-sm` | 8px | Gap antar elemen form, padding chip |
| `--space-md` | 16px | Padding card mobile, gutter grid mobile |
| `--space-lg` | 24px | Padding card desktop, section gap |
| `--space-xl` | 32px | Jarak antar section besar |
| `--space-2xl` | 48px | Hero padding desktop, empty state |

**Layout metrics:** content max-width 1280px · sidebar 280px (tablet 80px) · topbar 64px · bottom nav 64px + `env(safe-area-inset-bottom)` · grid 12 kolom, gutter 16px mobile / 24px desktop.

## 1.4 Border Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 8px | Input, button, badge besar |
| `--radius-md` | 12px | Card, list row, chart container |
| `--radius-lg` | 16px | Modal, bottom sheet, hero card |
| `--radius-full` | 999px | Chip, avatar, FAB, toggle |

## 1.5 Elevation / Shadow

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(16,24,40,.05)` | `0 1px 2px rgba(0,0,0,.40)` | Card diam, sticky header |
| `--shadow-md` | `0 4px 12px -2px rgba(16,24,40,.08)` | `0 4px 12px -2px rgba(0,0,0,.50)` | Dropdown, popover, hover card |
| `--shadow-lg` | `0 20px 40px -12px rgba(16,24,40,.18)` | `0 20px 40px -12px rgba(0,0,0,.65)` | Modal, bottom sheet, FAB |

> Di dark mode, elevation utama dibangun lewat **border `#2A3441` + surface lebih terang**, shadow hanya penguat. Jangan pakai shadow besar di dark mode.

## 1.6 Icon Style

- **Set:** Lucide Icons (outline), stroke `1.75px`, round cap/join.
- **Ukuran:** 16px inline, **20px default**, 24px nav, 28–32px empty state.
- **Warna:** mengikuti `currentColor`; icon status memakai semantic color.
- **Ikon domain:** Cash → `Banknote`, Rekening → `Landmark`, Saldo OrderKuota → `Smartphone`, Bagi hasil → `HandCoins`, Laba → `TrendingUp`, Modal → `Lock`.
- **Ilustrasi empty/error:** line-art 2 tone (primary-soft + border), gaya geometris, tanpa karakter wajah detailed. Ukuran 160×120 mobile, 200×150 desktop.

## 1.7 Skeleton Loading Style

| Tipe | Visual | Animasi | Dipakai untuk |
|---|---|---|---|
| **Pulse** (default) | Blok `#F2F4F7` (dark `#1F2633`), radius mengikuti elemen | Opacity 1 → .55 → 1, 1500ms, ease-in-out loop | Teks, tabel, list row |
| **Shimmer** | Gradient `#F2F4F7 → #E4E7EC → #F2F4F7`, 200% width | Translate X −100% → 100%, 1600ms linear loop | Card metric, chart, hero |
| **Static** (reduced motion) | Blok `#F2F4F7` tanpa animasi | — | Saat `prefers-reduced-motion: reduce` |

Aturan: skeleton harus **meniru layout final** (tinggi & jumlah baris sama), maksimal 8 row, tidak menampilkan spinner di tengah konten yang sudah punya placeholder.

## 1.8 Chart Tokens

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--chart-1` | `#4F46E5` | `#818CF8` | Series utama (penjualan/laba) |
| `--chart-2` | `#0F766E` | `#2DD4BF` | Series pembanding (periode lalu) |
| `--chart-grid` | `#EAECF0` | `#2A3441` | Grid horizontal |
| `--chart-axis` | `#98A2B3` | `#667085` | Label sumbu |
| `--chart-area` | `rgba(79,70,229,.12)` | `rgba(129,140,248,.16)` | Gradient area |
| `--chart-positive` | `#12B76A` | `#32D583` | Bar positif / deviden |
| `--chart-negative` | `#D92D20` | `#F97066` | Bar negatif / beban |

Library: Recharts (kompatibel shadcn/ui charts). Tooltip memakai `surface` + `shadow-md` + border. Chart wajib punya **toggle tabel** untuk aksesibilitas.

## 1.9 Motion Tokens

| Token | Value | Usage |
|---|---|---|
| `--motion-fast` | 120ms | Hover, press, color change |
| `--motion-base` | 200ms | Dropdown, toast, tab switch |
| `--motion-slow` | 300ms | Sheet/modal, page transition |
| `--ease-standard` | `cubic-bezier(.2,.8,.2,1)` | Default |
| `--ease-exit` | `cubic-bezier(.4,0,1,1)` | Menutup elemen |

> Semua animasi wajib dibungkus `@media (prefers-reduced-motion: no-preference)`; fallback reduced motion = fade 0ms/instan.

---

# BAGIAN 2 — Screen Map & User Flow

## 2.1 Information Architecture / Sitemap

```
[L0] Login (/login)
└── [L1] Dashboard (/dashboard) — adaptif per role
    ├── [L1] Transaksi (/transactions)
    │   ├── [L2] Input Penjualan (/transactions/new?type=sale)
    │   ├── [L2] Input Pengeluaran (/transactions/new?type=expense)
    │   └── [L2] Detail Transaksi (/transactions/[id])
    ├── [L1] Produk (/products) — Admin full, Karyawan read-only katalog
    ├── [L1] Wallet & Aset (/wallets) — Admin
    │   ├── [L2] Detail Wallet (/wallets/[id])
    │   └── [L2] Mutasi Aset (/wallets/transfer)
    ├── [L1] Bagi Hasil (/profit-sharing) — Admin full, Investor read-only
    │   ├── [L2] Wizard Bagi Hasil (/profit-sharing/new) — Admin
    │   ├── [L2] Riwayat Payout (/profit-sharing/history)
    │   └── [L3] Detail Payout (/profit-sharing/history/[id])
    ├── [L1] Pengguna (/users) — Admin
    └── [L1] Profil & Pengaturan (/settings)
[L0] Akses Ditolak / 404 (/403, /404)
```

**Navigasi Depth:** maksimal 4 level (`Dashboard → Bagi Hasil → Riwayat → Detail`).
**Breadcrumb:** hanya desktop (>1024px), format `Bagi Hasil / Riwayat Payout / 03–09 Nov 2026`. Mobile memakai tombol back + judul halaman.
**Nesting Rules:** maksimal 2 level konten sebelum memakai tab/section. Form pendek selalu sheet/drawer, bukan halaman baru — kecuali wizard bagi hasil (3 langkah) dan form transaksi (butuh fokus penuh di mobile).

## 2.2 Screen Inventory

| # | Screen | Route | Module | Depth | Access |
|---|---|---|---|---|---|
| 01 | Login | `/login` | Auth | L0 | Public |
| 02 | Dashboard (adaptif) | `/dashboard` | Analytics | L1 | Admin, Karyawan, Investor |
| 03 | Transaksi | `/transactions` | Transaksi | L1 | Admin (all), Karyawan (own today) |
| 04 | Input Penjualan | `/transactions/new?type=sale` | Transaksi | L2 | Admin, Karyawan |
| 05 | Input Pengeluaran | `/transactions/new?type=expense` | Transaksi | L2 | Admin, Karyawan |
| 06 | Detail Transaksi | `/transactions/[id]` | Transaksi | L2 | Admin, Karyawan (own) |
| 07 | Produk | `/products` | Master Data | L1 | Admin (full), Karyawan (read-only) |
| 08 | Wallet & Aset | `/wallets` | Aset | L1 | Admin |
| 09 | Detail Wallet | `/wallets/[id]` | Aset | L2 | Admin |
| 10 | Mutasi Aset | `/wallets/transfer` | Aset | L2 | Admin |
| 11 | Bagi Hasil | `/profit-sharing` | Profit Sharing | L1 | Admin (full), Investor (read-only) |
| 12 | Wizard Bagi Hasil | `/profit-sharing/new` | Profit Sharing | L2 | Admin |
| 13 | Riwayat Payout | `/profit-sharing/history` | Profit Sharing | L2 | Admin (all), Investor (own dividends) |
| 14 | Detail Payout | `/profit-sharing/history/[id]` | Profit Sharing | L3 | Admin, Investor (own) |
| 15 | Pengguna | `/users` | Admin | L1 | Admin |
| 16 | Profil & Pengaturan | `/settings` | Settings | L1 | Semua role |
| 17 | Akses Ditolak / 404 | `/403`, `/404` | System | L0 | Semua role |

## 2.3 Navigasi per Role

| Role | Desktop sidebar | Mobile bottom nav (4 item) | FAB |
|---|---|---|---|
| **Admin** | Dashboard, Transaksi, Produk, Wallet & Aset, Bagi Hasil, Pengguna, Pengaturan | Beranda, Transaksi, **Bagi Hasil**, Lainnya | `+ Catat` (penjualan) |
| **Karyawan** | Dashboard, Transaksi, Katalog Produk, Profil | Beranda, Transaksi, Katalog, Profil | `+ Catat` (penjualan) |
| **Investor** | Dashboard, Deviden, Profil | Beranda, Deviden, Profil | — |

- **"Lainnya" (Admin)** membuka bottom sheet berisi Produk, Wallet & Aset, Pengguna, Pengaturan.
- Tablet (768–1024px): sidebar 80px icon-only + tooltip; konten full width.
- Mobile: topbar 56px (menu/avatar + judul) + bottom nav 64px. FAB 56px, offset 16px di atas bottom nav.
- Badge notifikasi di topbar untuk Admin: payout periode siap diproses (titik merah, bukan angka).

## 2.4 User Flow Diagram

```
                         ┌──────────────┐
                         │  01 Login    │
                         └──────┬───────┘
                                │ role redirect
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
      ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
      │ 02 Dashboard │  │ 02 Dashboard │  │ 02 Dashboard │
      │    Admin     │  │   Karyawan   │  │   Investor   │
      └──┬───┬───┬───┘  └──────┬───────┘  └──────┬───────┘
         │   │   │             │                 │
         │   │   └──→ 11 Bagi Hasil ──→ 12 Wizard ──→ 14 Detail Payout
         │   │                  │
         │   └──→ 08 Wallet ──→ 09 Detail Wallet ──→ 10 Mutasi
         │
         ├──→ 03 Transaksi ──→ 04 Penjualan / 05 Pengeluaran ──→ 06 Detail
         ├──→ 07 Produk
         └──→ 15 Pengguna
                                └──→ 13 Riwayat Payout (deviden saya)
```

**Legend:** `→` primary navigation · `⇢` alternative path · `←` back navigation.

## 2.5 Main Flows

### Flow 1 — Karyawan mencatat penjualan (target < 20 detik)

1. **Dashboard Karyawan** → tap FAB `+ Catat`.
2. **Input Penjualan** → cari & pilih produk (hanya nama + harga jual terlihat).
3. Atur qty (default 1) → subtotal terhitung otomatis; wallet "Cash" terkunci.
4. Tap `Simpan Penjualan` → validasi inline (produk wajib, qty ≥ 1).
5. **Success sheet** → ringkasan transaksi + tombol `Catat Lagi` / `Selesai`.
6. Kembali ke dashboard; counter "Transaksi saya hari ini" bertambah, toast sukses muncul.

### Flow 2 — Admin memproses bagi hasil mingguan

1. **Dashboard Admin** → banner "Periode 03–09 Nov siap diproses" → tap.
2. **Bagi Hasil** → review Total Margin, Total Beban, Laba Bersih; tap `Hitung & Proses`.
3. **Wizard step 1** → verifikasi periode (Senin–Minggu) & angka; lanjut.
4. **Wizard step 2** → atur 4 persentase: Kas Ditahan, Deviden Admin, Deviden Investor, Gaji Karyawan. Total harus 100%; preview rupiah per penerima live.
5. **Wizard step 3** → pilih wallet sumber (default Cash), review ringkasan per penerima, centang konfirmasi.
6. Tap `Eksekusi Payout` → modal konfirmasi terakhir → proses (loading).
7. **Success** → receipt ringkasan; saldo wallet terpotong; expense `payout` tercatat; status periode = Selesai.
8. Admin dapat membuka **Detail Payout** untuk cetak/PDF atau audit.

### Flow 3 — Investor mengecek deviden

1. **Login** → redirect ke Dashboard Investor (read-only).
2. Lihat hero Laba Bersih + tren + Total Aset (agregat, tanpa rincian wallet).
3. Tap card **Deviden Saya** → Riwayat Payout (hanya penerimaan miliknya).
4. Buka **Detail Payout** → lihat breakdown deviden + periode; tap `Unduh PDF`.

### Flow 4 — Admin mutasi saldo antar wallet

1. **Wallet & Aset** → tap `Mutasi`.
2. Pilih wallet asal & tujuan, isi nominal + keterangan.
3. Sistem menampilkan preview saldo setelah mutasi; validasi saldo cukup & wallet berbeda.
4. Konfirmasi → success sheet + kedua saldo diperbarui; transaksi `transfer` tercatat di kedua wallet.

### Flow 5 — Setup awal (Admin, sekali pakai)

1. Login pertama → dashboard kosong dengan checklist onboarding.
2. Tambah produk (minimal 1) → tambah wallet bila perlu → undang karyawan/investor.
3. Checklist hilang otomatis saat ketiga langkah selesai.

## 2.6 Responsive Behavior (Global)

| Breakpoint | Layout | Navigasi | Perubahan utama |
|---|---|---|---|
| **Mobile (< 768px)** | 1 kolom, card stack, padding 16px | Bottom nav + FAB, topbar 56px | Tabel → list row; form 1 kolom; chart tinggi 180px; hero metric 26px |
| **Tablet (768–1024px)** | 2 kolom untuk card stat, grid 8 kolom | Sidebar 80px icon-only | Tabel ringkas (kolom sekunder disembunyikan); sheet jadi modal tengah |
| **Desktop (> 1024px)** | Sidebar 280px + konten max 1280px, grid 12 kolom | Sidebar + topbar | Tabel penuh, hover states, breadcrumb, form 2 kolom untuk field pendek |

---

# BAGIAN 3 — Per-Screen Design

> Semua warna, tipografi, spacing, radius, dan shadow di bawah mengacu ke Bagian 1.
> Format uang: `Rp 12.000` (tanpa desimal, pemisah ribuan titik). Angka negatif: `−Rp 25.000`.
> Layout ASCII memakai konteks **Admin** kecuali diberi label role lain; perbedaan Karyawan/Investor dijelaskan di tabel role variant masing-masing screen.

---

## Screen 01: Login

**Purpose:** Autentikasi email/password via Supabase Auth dan redirect otomatis sesuai role.
**UVP Highlight:** Kesan pertama "control room keuangan" — bersih, tenang, dan menegaskan bahwa akses tiap orang berbeda (role-safe).
**Route:** `/login` · **Access:** Public (redirect ke `/dashboard` jika sudah login)

### Layout Structure

```
MOBILE (<768px)                    DESKTOP (>1024px)
┌─────────────────────────┐        ┌───────────────────────────────────────────┐
│  ◉ PeppyCell      ☾/☀   │        │  ┌─────────────────┐  ┌────────────────┐  │
│                         │        │  │ BRAND PANEL 44% │  │ FORM 56%       │  │
│  Masuk ke control room  │        │  │ ◉ PeppyCell     │  │ Masuk          │  │
│  keuangan konter Anda.  │        │  │ "Laba mingguan  │  │ Email          │  │
│                         │        │  │  rapi, modal    │  │ [__________]   │  │
│  Email                  │        │  │  tetap aman."   │  │ Password    👁 │  │
│  [___________________]  │        │  │                 │  │ [__________]   │  │
│  Password          👁   │        │  │ ✓ Role-safe     │  │ □ Ingat saya   │  │
│  [___________________]  │        │  │ ✓ Payout 1 klik │  │ [   Masuk    ] │  │
│  □ Ingat saya   Lupa?   │        │  │ ✓ Dark mode     │  │                │  │
│  [      Masuk      ]    │        │  │                 │  │ 🔒 Supabase    │  │
│                         │        │  └─────────────────┘  └────────────────┘  │
│  🔒 Diamankan Supabase  │        └───────────────────────────────────────────┘
└─────────────────────────┘
```

### Components Used

| Component | Position | Description |
|---|---|---|
| Logo + wordmark | Atas | Identitas, link ke halaman login |
| Theme toggle | Kanan atas | Switch light/dark/system |
| InputField (email) | Form | `type=email`, autocomplete `email` |
| InputField (password) | Form | Toggle visibility, autocomplete `current-password` |
| Checkbox "Ingat saya" | Form | Sesi persist 30 hari |
| Button primary | Form | Submit; full width mobile |
| Alert banner | Atas form | Error kredensial / sesi expired |
| Trust footer | Bawah | "Diamankan Supabase Auth" |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default** | Form kosong, CTA enabled saat kedua field terisi | Halaman dibuka |
| **Empty** | Placeholder email & password; helper "Gunakan email kantor" | Field kosong |
| **Loading** | Button spinner + teks "Memproses…", field disabled, form opacity 70% | Submit |
| **Error** | Alert merah di atas form, border field error, shake halus 1× | Kredensial salah / 429 / offline |
| **Success** | Tombol berubah centang hijau 400ms lalu redirect + skeleton dashboard | Login valid |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Brand panel | Tidak ada (statis) | — | — |
| Form | Tidak ada (statis) | — | — |
| Submit button | Inline spinner 16px + label | 20×20px | Spin 800ms linear |
| Halaman tujuan | Skeleton dashboard | Full viewport | Shimmer |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | N/A — halaman statis, tidak memuat data |
| **Ukuran** | — |
| **Title** | — |
| **Description** | — |
| **CTA** | — |
| **Link** | "Lupa password?" → dialog reset via email Supabase |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **Kredensial salah** | Alert `#FEF3F2`: "Email atau password tidak sesuai." | Fokus kembali ke field password |
| **Network offline** | Banner abu: "Anda offline. Periksa koneksi lalu coba lagi." | CTA disabled sampai online |
| **429 Too Many Attempts** | Alert warning: "Terlalu banyak percobaan. Coba lagi dalam 60 detik." + countdown | Countdown selesai → CTA aktif |
| **500 Server** | Alert error: "Server sedang bermasalah. Coba beberapa saat lagi." | Tombol `Coba Lagi` |
| **Validation** | Inline di field: "Email wajib diisi" / "Format email tidak valid" | Border error + `aria-invalid` |
| **Session expired** | Banner info di atas form: "Sesi berakhir. Silakan masuk kembali." | Auto-focus email |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| Email | Text | Input | Lowercase, trim spasi, max 254 char |
| Password | Password | Input | Masked `••••••••`, min 8 char |
| Error message | Text | Supabase error code | Bahasa Indonesia, tanpa bocor detail teknis |
| Redirect | Route | `users.role` | admin → `/dashboard`; karyawan → `/dashboard`; investor → `/dashboard` |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Input | Focus | Border primary + ring 3px `primary-soft` | 120ms | ease-standard |
| Password toggle | Tap | Icon mata ↔ mata-coret, opacity crossfade | 150ms | ease-standard |
| Button | Press | Scale 0.98 | 100ms | ease-standard |
| Form | Error | Shake X ±4px, 2 putaran | 240ms | ease-standard |
| Success | Login valid | Check icon draw + fade out form | 400ms | ease-standard |
| Theme toggle | Tap | Crossfade background 1 frame | 200ms | linear |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| CTA Masuk | Submit form | Loading → redirect / error alert |
| Enter | Keydown di field | Submit form |
| Lupa password | Tap | Dialog input email + kirim link |
| Theme toggle | Tap | Ganti tema, persist di localStorage |

### Accessibility

- **Keyboard:** urutan Tab = email → password → toggle visibilitas → ingat saya → lupa password → submit. Enter submit dari field mana pun.
- **ARIA:** `<form aria-labelledby="login-title">`, alert `role="alert"` + `aria-live="assertive"`, error field `aria-describedby`.
- **Contrast:** teks putih di `#4F46E5` = 6.6:1; placeholder `#667085` = 5.3:1.
- **Touch target:** input 48px tinggi; checkbox + label satu area 44px.
- **Screen reader:** tombol mata punya `aria-label="Tampilkan password"` / `"Sembunyikan password"`.

### Responsive Behavior

- **Mobile (<768px):** single column, padding 24px, brand panel diganti wordmark + headline singkat; CTA full width; footer trust di bawah.
- **Tablet (768–1024px):** form card max 420px di tengah, tanpa brand panel.
- **Desktop (>1024px):** split 44/56; brand panel background `primary-soft` dengan pattern grid halus; form max 400px.

---

## Screen 02: Dashboard

**Purpose:** Ringkasan performa bisnis yang berbeda per role — Admin (kontrol penuh), Karyawan (aktivitas hari ini), Investor (read-only profit & aset).
**UVP Highlight:** Laba bersih jadi hero metric; karyawan melihat versi "tanpa angka sensitif" dari layar yang sama.
**Route:** `/dashboard` · **Access:** Semua role (konten adaptif)

### Role Variants

| Variant | Hero | Metric cards | Chart | Quick actions | Data sensitif |
|---|---|---|---|---|---|
| **Admin** | Laba Bersih minggu berjalan + delta vs minggu lalu | Laba Kotor, Total Aset, Beban Operasional | Tren penjualan & laba 7/30 hari | Catat Penjualan, Pengeluaran, Proses Bagi Hasil | Semua |
| **Karyawan** | Jumlah transaksi saya hari ini | Nilai penjualan saya hari ini, Produk terjual | Sparkline jumlah transaksi 7 hari | Catat Penjualan | **Tanpa** modal, margin, laba, aset, saldo wallet |
| **Investor** | Laba Bersih minggu berjalan (read-only) | Laba Kotor, Total Aset, Deviden terakhir | Tren laba 7/30/90 hari | Lihat Riwayat Deviden | Tanpa rincian wallet & transaksi per user |

### Layout Structure

```
MOBILE (<768px)
┌───────────────────────────────────┐
│ ☰  Hai, Trisno            🔔  👤 │
│    Senin, 9 Nov 2026 · WIB       │
├───────────────────────────────────┤
│ ┌───────────────────────────────┐ │
│ │ LABA BERSIH · MINGGU INI      │ │
│ │ Rp 4.250.000        ↑ 12,4%   │ │
│ │ vs minggu lalu                │ │
│ │ [ 7 hari ][ 30 hari ]         │ │
│ │      ╱╲    ╱╲╱                │ │
│ └───────────────────────────────┘ │
│ ┌─────────────┐ ┌───────────────┐ │
│ │ Laba Kotor  │ │ Total Aset    │ │
│ │ Rp 6.100.000│ │ Rp 28.750.000 │ │
│ └─────────────┘ └───────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ Tren Penjualan      [chart]   │ │
│ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ ⚡ Periode 03–09 Nov siap     │ │
│ │    diproses          [Proses] │ │
│ └───────────────────────────────┘ │
│ Transaksi Terbaru             →   │
│ • Kuota 7GB          +Rp 12.000   │
│ • Operasional        −Rp 25.000   │
├───────────────────────────────────┤
│ [🏠]  [🧾]  [ ＋ ]  [💸]  [ ⋯ ]  │
└───────────────────────────────────┘
```

Desktop: sidebar 280px + topbar; hero 8 kolom, metric cards 4 kolom; chart 8 kolom + panel wallet/insight 4 kolom; transaksi terbaru full width.

### Components Used

| Component | Position | Description |
|---|---|---|
| AppShell | Global | Sidebar/bottom nav sesuai role |
| PageHeader | Atas | Sapaan, tanggal, notifikasi, avatar |
| MetricCard `hero` | Atas | Laba bersih + delta + toggle periode |
| MetricCard `default` | Grid | Laba kotor, total aset, beban |
| Chart | Tengah | Area/bar tren; toggle tabel a11y |
| Banner | Tengah | Periode payout siap diproses (Admin) |
| ListRow compact | Bawah | 5 transaksi terbaru |
| Button secondary | Bawah | "Lihat semua" |
| EmptyState | Konten | Belum ada data |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default** | Semua metric & chart terisi data periode berjalan | Ada data |
| **Empty** | Hero menampilkan `Rp 0` + ilustrasi + checklist onboarding (Admin) / "Belum ada transaksi" (Karyawan) | Akun baru / periode kosong |
| **Loading** | Skeleton hero + 2 card + chart + 3 list row | Fetch awal / ganti periode |
| **Error** | Card error di area chart: ikon cloud-off, pesan, `Coba Lagi`; metric terakhir tetap tampil dengan label "data terakhir" | API gagal |
| **Success** | After refresh: timestamp "Diperbarui 14:32" + toast | Pull-to-refresh / retry berhasil |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Hero metric | Shimmer rect | 100% × 148px | Shimmer |
| Metric cards | Shimmer rect ×2 | 50% × 96px each | Shimmer |
| Chart | Shimmer rect | 100% × 220px (mobile 180px) | Shimmer |
| List rows | Pulse line ×4 | 100% × 56px | Pulse |
| Page header | Static text nyata | — | — |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | Line-art dompet + grafik naik, 160×120 (mobile) / 200×150 (desktop) |
| **Ukuran** | 160×120px / 200×150px |
| **Title** | Admin: "Belum ada transaksi minggu ini" · Karyawan: "Belum ada transaksi hari ini" |
| **Description** | Admin: "Mulai catat penjualan atau pengeluaran pertama untuk melihat laba." · Karyawan: "Transaksi yang Anda catat akan muncul di sini." |
| **CTA** | Admin & Karyawan: `+ Catat Penjualan` (primary) |
| **Link** | Admin: "Impor dari Excel" → tech spec fase 2 (disabled dengan tooltip "Segera hadir") |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **API Failure** | Card chart error + `Coba Lagi`; metric bertanda "data terakhir 14:20" | Retry fetch per section |
| **Network Offline** | Banner sticky atas: "Anda offline — menampilkan data terakhir." | Auto-refresh saat online |
| **401 Session Expired** | Redirect ke `/login` + toast "Sesi berakhir" | Login ulang |
| **403 Role** | Card diganti "Data ini tidak tersedia untuk role Anda" (bukan error merah) | — |
| **500 Server** | Full-page error state + `Muat Ulang` | Reload route |
| **Partial failure** | Satu card error, card lain tetap tampil | Retry hanya section gagal |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| Laba bersih | Currency | query agregat `transactions` | `Rp 4.250.000`; delta `↑ 12,4%` hijau / `↓ 3,1%` merah |
| Laba kotor | Currency | total margin penjualan | `Rp 6.100.000` |
| Total aset | Currency | `SUM(wallets.saldo)` | `Rp 28.750.000`; investor hanya agregat |
| Beban operasional | Currency | `SUM(expense operasional)` | `−Rp 1.850.000` warna error |
| Jumlah transaksi (Karyawan) | Integer | count transaksi hari ini by user | `18 transaksi` |
| Nilai penjualan (Karyawan) | Currency | sum harga jual transaksi miliknya | `Rp 214.000` |
| Tren | Chart | agregasi harian Senin–Minggu | Label `Sen, Sel, …`; tooltip `Rp 1,2 jt` compact |
| Tanggal header | Date | now | `Senin, 9 Nov 2026 · WIB` |
| Transaksi terbaru | List | 5 transaksi terakhir | Waktu relatif: "2 jam lalu", >24 jam → `8 Nov, 14:30` |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Hero metric | Load | Count-up dari 0 (reduced motion: langsung) | 600ms | ease-out |
| Delta badge | Load | Fade + slide up 4px | 250ms | ease-standard |
| Chart | Load/ganti periode | Draw line kiri→kanan; bar grow dari bawah | 500ms | ease-standard |
| Card | Hover (desktop) | Lift 2px + shadow-md | 200ms | ease-standard |
| Pull-to-refresh | Pull >64px | Indikator rotasi + snap | 300ms | linear |
| Banner payout | Muncul | Slide down + fade | 300ms | ease-standard |
| List row | Tap | Background primary-soft 120ms | 120ms | linear |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| Hero card | Tap | Buka Bagi Hasil (Admin) / Riwayat Deviden (Investor) |
| Metric card | Tap | Buka detail terkait (aset → Wallet; beban → Transaksi filter expense) |
| Toggle 7/30 hari | Tap | Chart & delta re-fetch, skeleton chart |
| Transaksi terbaru | Tap row | Detail Transaksi (sheet) |
| Banner "Proses" | Tap | Wizard Bagi Hasil step 1 |
| Pull down | Gesture | Refresh semua data |

### Accessibility

- **Keyboard:** skip-link "Lewati ke konten"; urutan: nav → header actions → hero → metric → chart toggle → list. Chart toggle fokusabel.
- **ARIA:** `main` landmark; chart `role="img"` + `aria-label` ringkasan ("Laba bersih naik 12,4% dari minggu lalu"); tombol toggle `aria-pressed`.
- **Contrast:** delta hijau memakai `success-text` (5.2:1); teks chart ≥ 12px `text-secondary` (5.3:1).
- **Touch target:** card aksi ≥ 44px; bottom nav item 64×56px.
- **Screen reader:** metric dibacakan "Laba bersih minggu ini, empat juta dua ratus lima puluh ribu rupiah, naik dua belas koma empat persen".

### Responsive Behavior

- **Mobile (<768px):** 1 kolom; hero full width; metric cards 2 kolom; chart 180px; hanya 3 transaksi terbaru; bottom nav + FAB.
- **Tablet (768–1024px):** hero + 2 metric sejajar; chart full; sidebar icon-only.
- **Desktop (>1024px):** grid 12 kolom; hero 8 + panel insight 4; 3 metric sejajar; 5 transaksi; hover states aktif.

---

## Screen 03: Transaksi

**Purpose:** Daftar semua pemasukan/pengeluaran dengan filter, pencarian, dan akses ke detail.
**UVP Highlight:** Karyawan hanya melihat transaksi miliknya hari ini — filter dikunci dan dijelaskan, bukan disembunyikan diam-diam.
**Route:** `/transactions` · **Access:** Admin (semua), Karyawan (miliknya, hari ini), Investor (tidak ada akses)

### Layout Structure

```
MOBILE (<768px)
┌───────────────────────────────────┐
│ ←  Transaksi                 [⋮]  │
│ [ Semua ][ Masuk ][ Keluar ]      │
│ [📅 7 hari ▾]  [Filter ▾]  [🔍]  │
├───────────────────────────────────┤
│ Hari ini · 9 Nov         +Rp 48.000│
│ ┌───────────────────────────────┐ │
│ │ 🛒 Kuota 7GB                  │ │
│ │ 14:30 · Cash · oleh Trisno    │ │
│ │                  +Rp 12.000   │ │
│ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ 🧾 Operasional                │ │
│ │ 13:10 · Cash · oleh Sari      │ │
│ │                  −Rp 25.000   │ │
│ └───────────────────────────────┘ │
│ Kemarin · 8 Nov          +Rp 120.000│
│ ...                               │
├───────────────────────────────────┤
│ [🏠]  [🧾]  [ ＋ ]  [💸]  [ ⋯ ]  │
└───────────────────────────────────┘
```

Desktop: tabel dengan kolom Tanggal, Tipe, Produk/Kategori, Keterangan, Wallet, Nominal, Dicatat oleh, Aksi. Filter bar sticky di atas tabel.

### Components Used

| Component | Position | Description |
|---|---|---|
| PageHeader `detail` | Atas | Back, judul, menu (export CSV admin) |
| Segmented control | Atas | Semua / Masuk / Keluar |
| FilterBar | Atas | Date range, wallet, user (admin), search |
| DataTable (desktop) | Konten | Sortable, sticky header, pagination 25/page |
| ListRow (mobile) | Konten | Grup per tanggal + total harian |
| StatusBadge | Row | Tipe transaksi |
| MoneyText | Row | Nominal berwarna sesuai tipe |
| EmptyState | Konten | Tidak ada hasil |
| Pagination / infinite scroll | Bawah | "Muat 25 lagi" mobile |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default** | List grup tanggal, total harian, 25 item pertama | Ada data |
| **Empty** | Ilustrasi struk kosong + CTA catat | Belum ada transaksi / filter kosong |
| **Loading** | Skeleton 8 row + skeleton filter bar | Fetch awal / ganti filter |
| **Error** | Inline error row + `Coba Lagi`; filter tetap terlihat | API gagal |
| **Success** | Toast "Transaksi berhasil dicatat" + row baru tersorot 2 detik | Setelah create |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Filter chips | Pulse rounded | 3 × 72×32px | Pulse |
| Date group header | Pulse line | 40% × 20px | Pulse |
| List rows | Pulse rect ×8 | 100% × 72px | Pulse |
| Total harian | Pulse line | 96×20px | Pulse |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | Struk panjang dengan magnifier, line-art 160×120 |
| **Ukuran** | 160×120px |
| **Title** | Filter aktif: "Tidak ada transaksi yang cocok" · Tanpa data: "Belum ada transaksi" |
| **Description** | "Coba ubah rentang tanggal atau hapus filter." / "Transaksi yang Anda catat akan muncul di sini." |
| **CTA** | `Reset Filter` (secondary) / `+ Catat Transaksi` (primary) |
| **Link** | — |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **API Failure** | Kotak error di tengah list + `Coba Lagi` | Retry query dengan filter sama |
| **Network Offline** | Banner atas + list cache terakhir (read-only) | Auto-retry saat online |
| **404 Detail** | Jika membuka `/transactions/[id]` yang hilang → halaman 404 | `Kembali ke Transaksi` |
| **500 Server** | Full-page error | `Muat Ulang` |
| **403 Role** | Redirect `/403` — "Transaksi ini bukan milik Anda" | `Kembali ke Dashboard` |
| **Validation filter** | Tanggal akhir < tanggal awal → inline error + disable apply | Koreksi otomatis |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| Tanggal grup | Date | `transactions.tanggal` | `Hari ini · 9 Nov` / `Kemarin · 8 Nov` / `Sab, 7 Nov 2026` |
| Waktu | Time | `tanggal` | `14:30` (24 jam, WIB) |
| Tipe | Badge | `tipe` | income=Masuk, expense=Keluar, transfer=Transfer, payout=Payout |
| Produk | Text | `products.nama_produk` | Truncate 1 baris + ellipsis |
| Keterangan | Text | `transactions.keterangan` | Truncate 1 baris; fallback "—" |
| Wallet | Text | `wallets.nama_wallet` | Nama wallet; karyawan: hanya "Cash" |
| Nominal | Currency | `nominal` | `+Rp 12.000` / `−Rp 25.000`; tabular |
| Dicatat oleh | Text | `users.full_name` | Inisial avatar 24px + nama (admin only) |
| Total harian | Currency | agregat per tanggal | `+Rp 48.000` net; abu jika 0 |
| Pagination | Integer | count | "Menampilkan 25 dari 148" |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Segmented control | Ganti tab | Pill indicator slide | 200ms | ease-standard |
| Row | Tap | Background primary-soft | 120ms | linear |
| Row baru | Setelah create | Highlight kuning→transparan | 2s | ease-out |
| Filter sheet | Buka/tutup | Slide up + backdrop fade | 300ms | ease-standard |
| Infinite scroll | Load more | Skeleton append + fade in | 250ms | ease-standard |
| Swipe row (admin) | Swipe kiri | Reveal aksi "Batalkan" (belum delete) | 200ms | ease-out |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| Row | Tap | Buka Detail Transaksi (sheet mobile / drawer desktop) |
| Filter | Tap | Sheet filter; apply → skeleton list |
| Search | Ketik ≥2 char, debounce 300ms | Filter keterangan/produk |
| Export CSV | Tap (admin) | Download sesuai filter aktif + toast |
| Pull-to-refresh | Gesture | Re-fetch list |
| Sort kolom (desktop) | Klik header | Asc/desc + arrow indicator |

### Accessibility

- **Keyboard:** filter → segmented → search → list row → pagination. Row dapat diaktifkan Enter/Space.
- **ARIA:** list `role="list"`, row `role="listitem"` + `aria-label` lengkap; tabel pakai `<table>` semantik, header `scope="col"`; live region untuk "25 transaksi dimuat".
- **Contrast:** nominal hijau/merah memakai token teks (≥4.5:1); badge punya teks, bukan warna saja.
- **Touch target:** row 72px; filter chip 32px tinggi + area sentuh 44px.
- **Screen reader:** membaca "Pemasukan, Kuota 7GB, dua belas ribu rupiah, Cash, dicatat Trisno, 14:30".

### Responsive Behavior

- **Mobile (<768px):** list grup tanggal; filter lewat bottom sheet; 3 chip cepat (Semua/Masuk/Keluar); infinite scroll 25 item.
- **Tablet (768–1024px):** tabel ringkas (sembunyikan kolom Keterangan & Dicatat oleh); filter bar wrap 2 baris.
- **Desktop (>1024px):** tabel penuh 8 kolom; filter bar 1 baris; pagination kanan bawah; export CSV di header.

---

## Screen 04: Input Penjualan

**Purpose:** Mencatat penjualan produk dalam <20 detik; sistem otomatis mengambil harga jual dan menambah saldo wallet Cash.
**UVP Highlight:** Karyawan hanya melihat nama produk + harga jual; modal & margin tidak pernah dikirim ke client.
**Route:** `/transactions/new?type=sale` · **Access:** Admin, Karyawan

### Layout Structure

```
MOBILE (<768px) — full page
┌───────────────────────────────────┐
│ ←  Catat Penjualan           ✕    │
├───────────────────────────────────┤
│ Produk *                          │
│ ┌───────────────────────────────┐ │
│ │ 🔍 Cari produk…               │ │
│ └───────────────────────────────┘ │
│ ▾ Telkomsel                       │
│   ○ Kuota 7GB          Rp 12.000 │
│   ○ Kuota 15GB         Rp 25.000 │
│ ▾ Indosat                         │
│ Jumlah                            │
│ [ − ]        1        [ + ]       │
│ Harga jual        Rp 12.000       │
│ Subtotal          Rp 12.000       │
│ Wallet            Cash 🔒         │
│ ℹ Otomatis masuk ke Cash          │
│ Keterangan (opsional)             │
│ [_____________________________]   │
├───────────────────────────────────┤
│ [        Simpan Penjualan       ] │ ← sticky
└───────────────────────────────────┘
```

Desktop: form 7 kolom + ringkasan 5 kolom (sticky card). Ringkasan menampilkan produk, qty, subtotal, wallet, CTA.

### Components Used

| Component | Position | Description |
|---|---|---|
| PageHeader `form` | Atas | Back, judul, close |
| Combobox searchable | Form | Produk grouped per operator; hanya nama + harga jual |
| Stepper qty | Form | − / angka / +, min 1, max 99 |
| ReadonlyField | Form | Harga jual & wallet Cash (terkunci + ikon lock) |
| MoneyText `display` | Ringkasan | Subtotal besar |
| Textarea | Form | Keterangan opsional, max 200 char |
| Sticky footer | Bawah | CTA primary full width |
| Success sheet | Overlay | Ringkasan + aksi lanjutan |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default** | Form kosong, produk belum dipilih, CTA disabled | Halaman dibuka |
| **Empty** | Combobox menampilkan "Produk belum tersedia" + CTA hubungi admin / tambah produk | Master produk kosong |
| **Loading** | Skeleton combobox 5 baris; CTA spinner saat submit | Fetch produk / submit |
| **Error** | Inline field error + alert di atas CTA | Validasi / API gagal |
| **Success** | Bottom sheet: centang animasi, ringkasan, `Catat Lagi` + `Selesai` | Transaksi tersimpan |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Combobox | Pulse line ×5 | 100% × 48px | Pulse |
| Ringkasan desktop | Pulse rect | 100% × 180px | Pulse |
| Submit button | Spinner 16px + "Menyimpan…" | 20×20px | Spin 800ms |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | Kotak produk kosong + ikon plus, 120×90 |
| **Ukuran** | 120×90px |
| **Title** | "Produk belum tersedia" |
| **Description** | Admin: "Tambahkan produk dulu sebelum mencatat penjualan." · Karyawan: "Hubungi Admin untuk menambahkan produk." |
| **CTA** | Admin: `+ Tambah Produk` → `/products` · Karyawan: `Kembali` |
| **Link** | — |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **Validation produk** | Border combobox merah + "Pilih produk terlebih dahulu" | Fokus ke combobox |
| **Validation qty** | "Jumlah minimal 1" di bawah stepper | Tombol − disabled di 1 |
| **API Failure** | Alert di atas CTA: "Gagal menyimpan. Coba lagi." + data form tetap | Retry submit |
| **Network Offline** | Banner + CTA disabled; form draft disimpan lokal | Auto-enable saat online |
| **409 Duplicate** | Alert warning: "Transaksi serupa baru saja dicatat." + opsi "Tetap Simpan" | Cek list 5 menit terakhir |
| **500 Server** | Alert error + tombol `Coba Lagi` | Retry |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| Produk | Select | `products.nama_produk`, `harga_jual` | `Kuota 7GB` + `Rp 12.000`; **tanpa** `harga_beli` |
| Operator | Group | prefix produk / kategori | `Telkomsel`, `Indosat`, `XL`, `Tri`, `Smartfren` |
| Qty | Integer | input | 1–99, stepper; default 1 |
| Harga jual | Currency | `products.harga_jual` | `Rp 12.000` readonly |
| Subtotal | Currency | harga_jual × qty | `Rp 12.000`, update live |
| Wallet | Readonly | wallet `Cash` | `Cash` + ikon lock + helper |
| Tanggal | Datetime | server `now()` | Disimpan WIB; tidak ditampilkan di form mobile (di ringkasan: `9 Nov 2026, 14:30`) |
| Keterangan | Text | input | Max 200 char, counter muncul >150 |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Combobox | Buka | Fade + scale 0.98→1 | 150ms | ease-standard |
| Qty +/− | Tap | Angka flip + subtotal count-up | 200ms | ease-standard |
| Subtotal | Berubah | Highlight primary-soft 1× | 300ms | ease-out |
| CTA | Enable | Background transisi abu→primary | 150ms | linear |
| Success sheet | Buka | Slide up + backdrop blur 4px | 300ms | ease-standard |
| Check icon | Success | SVG draw 0→100% | 400ms | ease-out |
| Form | Error | Shake field | 240ms | ease-standard |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| Combobox | Ketik | Filter lokal + grouped hasil; empty result state |
| Qty stepper | Tap +/− | Update subtotal |
| Simpan | Tap | Validasi → submit → success sheet |
| Catat Lagi | Tap success sheet | Reset form, fokus ke combobox, produk terakhir tetap di memori |
| Selesai | Tap success sheet | Kembali ke `/transactions` |
| Close | Tap × | Jika form dirty → confirm "Buang perubahan?" |

### Accessibility

- **Keyboard:** combobox `role="combobox"` + `aria-expanded`, navigasi ↑↓, Enter pilih, Esc tutup. Qty bisa diketik langsung.
- **ARIA:** error field `aria-describedby`; success sheet `role="dialog" aria-modal="true"` + focus trap; live region untuk subtotal.
- **Contrast:** helper `text-secondary` 5.3:1; harga jual `text-primary` 16.9:1.
- **Touch target:** qty button 44×44px; combobox 48px; CTA 48px.
- **Screen reader:** "Subtotal dua belas ribu rupiah" saat qty berubah (polite).

### Responsive Behavior

- **Mobile (<768px):** full page, 1 kolom, sticky CTA di atas safe area; keyboard number untuk qty.
- **Tablet (768–1024px):** form 1 kolom max 560px, ringkasan di bawah form.
- **Desktop (>1024px):** 2 kolom 7/5; ringkasan sticky; Enter submit; combobox dengan preview produk.

---

## Screen 05: Input Pengeluaran

**Purpose:** Mencatat biaya operasional harian yang mengurangi laba mingguan.
**UVP Highlight:** Setiap pengeluaran langsung terhubung ke wallet & laporan laba — bukan catatan terpisah.
**Route:** `/transactions/new?type=expense` · **Access:** Admin, Karyawan

### Layout Structure

```
MOBILE (<768px)
┌───────────────────────────────────┐
│ ←  Catat Pengeluaran         ✕    │
├───────────────────────────────────┤
│ Tanggal                           │
│ [ 9 Nov 2026 · 14:30        📅 ]  │
│ Kategori *                        │
│ [ Operasional ▾ ]                 │
│ Nominal *                         │
│ ┌───────────────────────────────┐ │
│ │ Rp  0                         │ │
│ └───────────────────────────────┘ │
│ Wallet *                          │
│ [ Cash ▾ ]                        │
│ Keterangan *                      │
│ [_____________________________]   │
│ 0/200                             │
├───────────────────────────────────┤
│ [      Simpan Pengeluaran       ] │
└───────────────────────────────────┘
```

Desktop: 2 kolom — form kiri, ringkasan dampak (saldo wallet setelah) kanan.

### Components Used

| Component | Position | Description |
|---|---|---|
| PageHeader `form` | Atas | Back, judul, close |
| DatePicker | Form | Default now; tidak boleh masa depan |
| Select | Form | Kategori: Operasional, Gaji, Deviden, Lainnya |
| MoneyInput | Form | Prefix `Rp`, formatting ribuan otomatis |
| Select | Form | Wallet aktif (admin: semua; karyawan: Cash) |
| Textarea | Form | Wajib, min 5 char, max 200 |
| Alert | Bawah nominal | Peringatan saldo tidak cukup |
| Sticky footer | Bawah | CTA primary |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default** | Tanggal now, kategori Operasional, wallet Cash | Halaman dibuka |
| **Empty** | Wallet kosong → CTA "Buat wallet" (admin) / "Hubungi admin" (karyawan) | Tidak ada wallet aktif |
| **Loading** | Skeleton wallet & kategori; spinner submit | Fetch / submit |
| **Error** | Inline error + alert saldo | Validasi / API |
| **Success** | Sheet ringkasan pengeluaran + saldo wallet terbaru | Tersimpan |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Form fields | Pulse line ×4 | 100% × 48px | Pulse |
| Ringkasan saldo | Shimmer rect | 100% × 140px | Shimmer |
| Submit | Spinner | 20×20px | Spin |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | Wallet kosong + ikon plus |
| **Ukuran** | 120×90px |
| **Title** | "Belum ada wallet aktif" |
| **Description** | "Pengeluaran harus dicatat ke salah satu wallet." |
| **CTA** | Admin: `Buat Wallet` → `/wallets` · Karyawan: `Kembali` |
| **Link** | — |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **Validation nominal** | "Nominal harus lebih dari 0" | Fokus nominal |
| **Saldo tidak cukup** | Alert warning "Saldo Cash tersisa Rp 50.000" + nominal merah | Boleh tetap simpan? Tidak — blokir submit |
| **Validation keterangan** | "Keterangan minimal 5 karakter" | Counter + border |
| **API Failure** | Alert "Gagal menyimpan pengeluaran" | Retry |
| **Network Offline** | Banner + submit disabled | Auto-retry |
| **500 Server** | Alert + `Coba Lagi` | Retry |
| **Tanggal masa depan** | "Tanggal tidak boleh melebihi hari ini" | Date picker reset |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| Tanggal | Datetime | input | `9 Nov 2026 · 14:30`, max now |
| Kategori | Enum | select | `Operasional`, `Gaji`, `Deviden`, `Lainnya` |
| Nominal | Currency | input | Format live `Rp 1.250.000`; simpan numeric |
| Wallet | Select | `wallets` aktif | Nama + saldo saat ini (admin); karyawan hanya Cash |
| Keterangan | Text | input | Wajib 5–200 char |
| Saldo setelah | Currency | saldo wallet − nominal | `Rp 1.750.000`; merah bila < 0 |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| MoneyInput | Ketik | Format ribuan real-time tanpa cursor jump | instan | — |
| Saldo warning | Nominal > saldo | Alert slide down + border warning | 200ms | ease-standard |
| Kategori | Ganti | Helper text crossfade | 150ms | linear |
| Submit | Press | Scale 0.98 → spinner | 100ms | ease-standard |
| Success | Simpan | Check draw + sheet slide | 400ms | ease-out |
| Field error | Blur | Border merah + shake | 200ms | ease-standard |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| DatePicker | Tap | Kalender; pilih tanggal |
| Nominal | Ketik | Format otomatis, validasi >0 |
| Wallet | Ganti | Saldo setelah dihitung ulang |
| Simpan | Tap | Validasi → submit → success |
| Close | Tap | Confirm jika dirty |
| Selesai | Tap | Kembali ke Transaksi |

### Accessibility

- **Keyboard:** urutan field natural; DatePicker bisa diketik; nominal `inputmode="numeric"`.
- **ARIA:** alert saldo `role="alert"`; error inline terhubung `aria-describedby`; currency input `aria-label="Nominal pengeluaran dalam rupiah"`.
- **Contrast:** warning text `#B54708` 4.8:1; error `#D92D20` 5.0:1.
- **Touch target:** field 48px; tombol kalender 44px.
- **Screen reader:** membacakan "Nominal satu juta dua ratus lima puluh ribu rupiah".

### Responsive Behavior

- **Mobile:** 1 kolom; date & wallet jadi bottom sheet picker; sticky CTA.
- **Tablet:** form max 560px; ringkasan saldo di bawah.
- **Desktop:** 2 kolom 7/5; ringkasan saldo sticky; shortcut `Cmd/Ctrl+Enter` submit.

---

## Screen 06: Detail Transaksi

**Purpose:** Melihat rincian satu transaksi, audit trail, dan (Admin) membatalkan transaksi dengan reversal.
**UVP Highlight:** Transaksi tidak pernah dihapus — pembatalan membuat jurnal balik, sehingga laporan investor tetap bisa dipercaya.
**Route:** `/transactions/[id]` · **Access:** Admin (semua), Karyawan (miliknya)

### Layout Structure

```
MOBILE — full page              DESKTOP — drawer kanan 480px
┌─────────────────────────┐     ┌──────────────────────────────┐
│ ←  Detail Transaksi  ⋮ │     │ Detail Transaksi         ✕  │
├─────────────────────────┤     ├──────────────────────────────┤
│    [Badge Pemasukan]    │     │ [Badge]                     │
│    +Rp 12.000           │     │ +Rp 12.000                  │
│    Kuota 7GB            │     │ Kuota 7GB                   │
├─────────────────────────┤     │ Tanggal      9 Nov, 14:30   │
│ Tanggal   9 Nov, 14:30  │     │ Wallet       Cash           │
│ Wallet    Cash          │     │ Dicatat      Trisno         │
│ Dicatat   Trisno        │     │ Keterangan   —              │
│ Keterangan —            │     │ ID  TX-2026-1109-0042       │
│ ID  TX-2026-1109-0042   │     ├──────────────────────────────┤
├─────────────────────────┤     │ [Batalkan Transaksi] (admin)│
│ [Batalkan] (admin only) │     └──────────────────────────────┘
└─────────────────────────┘
```

### Components Used

| Component | Position | Description |
|---|---|---|
| PageHeader `detail` | Atas | Back/close, menu (salin ID) |
| StatusBadge | Hero | Tipe transaksi |
| MoneyText `display` | Hero | Nominal + tanda |
| Definition list | Konten | Label–value detail |
| Timeline | Bawah | Audit: dibuat, diubah, dibatalkan |
| Button danger secondary | Bawah | Batalkan (admin) |
| ConfirmDialog | Overlay | Alasan pembatalan wajib |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default** | Detail lengkap + timeline | Data ada |
| **Empty** | N/A — ID tidak ditemukan → 404 | — |
| **Loading** | Skeleton hero + 5 baris detail | Fetch |
| **Error** | Full drawer error + retry | API gagal |
| **Success** | Banner "Transaksi dibatalkan" + badge berubah abu + reversal link | Setelah void |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Hero | Shimmer rect | 100% × 120px | Shimmer |
| Detail rows | Pulse line ×6 | 100% × 24px | Pulse |
| Timeline | Pulse circle ×3 + line | 100% × 120px | Pulse |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | Dokumen dengan tanda tanya |
| **Ukuran** | 160×120px |
| **Title** | "Transaksi tidak ditemukan" |
| **Description** | "Transaksi mungkin sudah dibatalkan atau tautan tidak valid." |
| **CTA** | `Kembali ke Transaksi` |
| **Link** | — |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **404 Not Found** | Empty state 404 | Back ke list |
| **403 Not Owner** | Halaman 403 "Transaksi ini bukan milik Anda" | Back ke dashboard |
| **API Failure** | Drawer error + `Coba Lagi` | Retry |
| **Network Offline** | Cache terakhir + banner offline | Auto-refresh |
| **500 Server** | Error state + reload | Reload |
| **Validation void** | Alasan < 10 char → inline error | Fokus textarea |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| ID | Text | `transactions.id` | `TX-2026-1109-0042` (prefix + tanggal + urutan) |
| Tipe | Badge | `tipe` | Pemasukan / Pengeluaran / Transfer / Payout |
| Nominal | Currency | `nominal` | `+Rp 12.000` / `−Rp 25.000` |
| Produk | Text | join `products` | Nama produk; fallback "—" |
| Tanggal | Datetime | `tanggal` | `9 Nov 2026, 14:30 WIB` |
| Wallet | Text | join `wallets` | Nama wallet |
| Dicatat oleh | Text | join `users` | Nama + role badge kecil |
| Keterangan | Text | `keterangan` | Full text, line-height 22px |
| Status | Badge | derived | `Aktif` hijau / `Dibatalkan` abu |
| Audit | Timeline | `created_at`, `updated_at` | `Dibuat 9 Nov 14:30 oleh Trisno` |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Drawer | Buka | Slide dari kanan + backdrop fade | 300ms | ease-standard |
| Hero | Load | Nominal count-up | 400ms | ease-out |
| Badge void | Setelah void | Crossfade hijau→abu | 200ms | linear |
| Timeline | Load | Stagger fade-up 40ms/item | 250ms | ease-standard |
| ConfirmDialog | Buka | Scale 0.96→1 + fade | 200ms | ease-standard |
| Toast | Void sukses | Slide top + auto dismiss 3s | 300ms | ease-out |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| Salin ID | Tap | Clipboard + toast "ID disalin" |
| Batalkan | Tap (admin) | ConfirmDialog + alasan wajib |
| Konfirmasi batal | Tap | Loading → success banner + reversal entry |
| Timeline item | Tap | (Fase 2) buka audit log lengkap |
| Back | Tap | Kembali ke list dengan posisi scroll terjaga |

### Accessibility

- **Keyboard:** drawer focus trap; Esc menutup; urutan hero → detail → aksi → timeline.
- **ARIA:** drawer `role="dialog" aria-modal="true"`; definition list `<dl>`; nominal `aria-label` lengkap; status live region.
- **Contrast:** badge abu `#475467` di `#F2F4F7` = 6.4:1; nominal error 5.0:1.
- **Touch target:** menu & close 44px; tombol batal 48px.
- **Screen reader:** "Detail transaksi, pemasukan, dua belas ribu rupiah, Kuota 7GB".

### Responsive Behavior

- **Mobile:** full page; aksi batal di section bawah, bukan sticky (mencegah tap tak sengaja).
- **Tablet:** drawer 480px dari kanan.
- **Desktop:** drawer 480px + backdrop; bisa deep-link ke route; Esc tutup.

---

## Screen 07: Produk

**Purpose:** CRUD master produk + margin real-time (Admin); katalog read-only harga jual (Karyawan).
**UVP Highlight:** Margin dihitung dan ditampilkan live hanya untuk Admin; karyawan melihat katalog tanpa kolom modal.
**Route:** `/products` · **Access:** Admin (full CRUD), Karyawan (read-only: nama + harga jual), Investor (tidak ada akses)

### Layout Structure

```
MOBILE — Admin
┌───────────────────────────────────┐
│ ←  Produk                  [+ Baru]│
│ [🔍 Cari produk…]                 │
│ ┌───────────────────────────────┐ │
│ │ Kuota 7GB            Telkomsel│ │
│ │ Jual  Rp 12.000               │ │
│ │ Beli  Rp 10.500 · Margin 12,5%│ │
│ │                     [ ⋮ ]     │ │
│ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ Kuota 15GB           Telkomsel│ │
│ │ Jual  Rp 25.000               │ │
│ │ Beli  Rp 22.000 · Margin 12,0%│ │
│ └───────────────────────────────┘ │
└───────────────────────────────────┘
```

Desktop: tabel — Nama Produk, Operator, Harga Beli, Harga Jual, Margin (Rp + %), Aksi. Search + filter operator + tombol `+ Tambah Produk`.

### Components Used

| Component | Position | Description |
|---|---|---|
| PageHeader | Atas | Judul + tombol tambah (admin) |
| Search input | Atas | Debounce 300ms |
| Filter chips | Atas | Operator (Semua, Telkomsel, Indosat, XL, Tri, Smartfren) |
| DataTable (desktop) | Konten | Sortable margin, sticky header |
| ListRow (mobile) | Konten | Nama, operator, jual, beli+margin (admin) |
| Sheet form | Overlay | Tambah/edit produk |
| MoneyInput | Form | Harga beli & jual |
| Margin preview | Form | Live Rp + %, warning jika ≤ 0 |
| ConfirmDialog | Overlay | Nonaktifkan produk |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default** | List produk + margin (admin) / tanpa margin (karyawan) | Ada data |
| **Empty** | Ilustrasi box + CTA tambah (admin) / "Belum ada produk" (karyawan) | Master kosong |
| **Loading** | Skeleton 6 row | Fetch |
| **Error** | Inline error + retry | API gagal |
| **Success** | Toast "Produk ditambahkan/diperbarui" + row highlight | Simpan |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Search | Pulse rounded | 100% × 40px | Pulse |
| Product rows | Pulse rect ×6 | 100% × 84px | Pulse |
| Margin line | Pulse line | 60% × 16px | Pulse |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | Kotak produk + ikon plus, 160×120 |
| **Ukuran** | 160×120px |
| **Title** | "Belum ada produk" |
| **Description** | "Tambahkan produk pulsa/kuota pertama untuk mulai mencatat penjualan." |
| **CTA** | Admin: `+ Tambah Produk` · Karyawan: `Kembali` |
| **Link** | — |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **Validation nama** | "Nama produk wajib diisi" | Fokus field |
| **Validation harga** | "Harga harus lebih dari 0" | Border merah |
| **Margin negatif** | Warning "Harga jual lebih rendah dari harga beli" + margin merah | Tetap boleh simpan? Tidak — blokir |
| **Duplicate nama** | "Produk dengan nama ini sudah ada" | Fokus nama |
| **API Failure** | Alert di sheet + data form tetap | Retry |
| **409 Conflict** | "Produk sedang dipakai transaksi" saat hapus | Sarankan nonaktifkan |
| **500** | Alert error + retry | Retry |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| Nama produk | Text | `nama_produk` | Title case, max 60 char |
| Operator | Chip | prefix/kategori | Warna netral, teks 12px |
| Harga beli | Currency | `harga_beli` | `Rp 10.500` — **admin only** |
| Harga jual | Currency | `harga_jual` | `Rp 12.000` |
| Margin | Currency | `harga_jual − harga_beli` | `Rp 1.500` |
| Margin % | Percent | `margin / harga_jual × 100` | `12,5%`; hijau >0, merah ≤0 |
| Status | Badge | `is_active` | `Aktif` / `Nonaktif` |
| Jumlah transaksi | Integer | count join | "Terjual 24×" (detail, fase 2) |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Sheet form | Buka | Slide up (mobile) / scale+fade (desktop) | 300ms | ease-standard |
| Margin preview | Harga berubah | Count-up Rp + % color transition | 200ms | ease-standard |
| Row | Tap | Background primary-soft | 120ms | linear |
| Search | Ketik | Debounce + list fade | 150ms | linear |
| Toast | Simpan | Slide top + auto dismiss | 300ms + 3s | ease-out |
| Delete/nonaktif | Confirm | Row fade + collapse | 250ms | ease-standard |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| Tambah Produk | Tap | Sheet form kosong |
| Row | Tap | Sheet edit (admin) / read-only (karyawan) |
| Search | Ketik | Filter nama |
| Filter operator | Tap chip | Filter list |
| Simpan | Tap | Validasi → simpan → toast + list update |
| Nonaktifkan | Menu row | ConfirmDialog; produk hilang dari picker penjualan |

### Accessibility

- **Keyboard:** search → chips → list → row action; sheet focus trap; Esc tutup.
- **ARIA:** tabel semantik; sort `aria-sort`; margin punya label "Margin satu ribu lima ratus rupiah, dua belas koma lima persen".
- **Contrast:** margin hijau `success-text` 5.2:1; negatif `error` 5.0:1.
- **Touch target:** row 84px; chip 44px area; tombol menu 44px.
- **Screen reader:** karyawan hanya mendengar nama + harga jual (tidak ada elemen modal di DOM).

### Responsive Behavior

- **Mobile:** card list; tombol `+` sticky kanan bawah (di atas nav); form sheet full-screen.
- **Tablet:** tabel ringkas (Nama, Jual, Margin); filter chips scroll horizontal.
- **Desktop:** tabel penuh + bulk action (fase 2); form modal 560px.

---

## Screen 08: Wallet & Aset

**Purpose:** Melihat total aset dan saldo per wallet, serta pintu masuk mutasi/penyesuaian.
**UVP Highlight:** Total aset adalah angka yang dijaga ketat — hanya Admin (dan Investor secara agregat) yang boleh melihatnya.
**Route:** `/wallets` · **Access:** Admin (full), Investor (tidak ada akses per wallet; hanya total di dashboard)

### Layout Structure

```
MOBILE — Admin
┌───────────────────────────────────┐
│ ←  Wallet & Aset          [+ Baru]│
├───────────────────────────────────┤
│ ┌───────────────────────────────┐ │
│ │ TOTAL ASET                    │ │
│ │ Rp 28.750.000                 │ │
│ │ 3 wallet aktif                │ │
│ └───────────────────────────────┘ │
│ [ Mutasi Aset ]  [ Sesuaikan ]    │
│ ┌───────────────────────────────┐ │
│ │ 💵 Cash                       │ │
│ │ Rp 1.750.000        ● Aktif   │ │
│ │ [Detail]              [ ⋮ ]   │ │
│ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ 🏦 Rekening BCA               │ │
│ │ Rp 12.000.000       ● Aktif   │ │
│ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ 📱 Saldo OrderKuota           │ │
│ │ Rp 15.000.000       ● Aktif   │ │
│ └───────────────────────────────┘ │
└───────────────────────────────────┘
```

Desktop: hero total aset + grid 3 kolom wallet card; panel kanan "Aksi cepat" (Mutasi, Penyesuaian, Tambah Wallet) + aktivitas terakhir.

### Components Used

| Component | Position | Description |
|---|---|---|
| PageHeader | Atas | Judul + tambah wallet |
| MetricCard `hero` | Atas | Total aset semua wallet aktif |
| Button secondary | Atas | Mutasi, Sesuaikan |
| WalletCard | Grid | Ikon, nama, saldo, status, menu |
| StatusBadge | Card | Aktif / Nonaktif |
| EmptyState | Konten | Belum ada wallet |
| Sheet form | Overlay | Tambah/edit wallet |
| ConfirmDialog | Overlay | Nonaktifkan wallet |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default** | Hero total + card wallet | Ada wallet |
| **Empty** | Ilustrasi dompet + CTA buat wallet | Belum ada wallet |
| **Loading** | Skeleton hero + 3 card | Fetch |
| **Error** | Hero error + card cache / retry | API gagal |
| **Success** | Saldo ter-update + toast "Mutasi berhasil" | Setelah mutasi/penyesuaian |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Hero | Shimmer rect | 100% × 132px | Shimmer |
| Wallet cards | Shimmer rect ×3 | 100% × 120px | Shimmer |
| Quick actions | Pulse rounded ×2 | 48% × 48px | Pulse |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | Dompet terbuka + koin, line-art |
| **Ukuran** | 160×120px |
| **Title** | "Belum ada wallet" |
| **Description** | "Buat wallet untuk memisahkan uang cash, rekening bank, dan saldo digital." |
| **CTA** | `+ Buat Wallet` (primary) |
| **Link** | "Pelajari mutasi aset" → tooltip/help |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **API Failure** | Card error + retry per section | Retry |
| **Network Offline** | Banner + saldo cache "data terakhir" | Auto-refresh |
| **403** | Halaman 403 "Wallet hanya untuk Admin" | Back |
| **500** | Error state + reload | Reload |
| **Duplicate wallet** | "Nama wallet sudah dipakai" | Fokus nama |
| **Saldo negatif saat edit** | "Saldo tidak boleh negatif; gunakan penyesuaian" | Blokir simpan |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| Total aset | Currency | `SUM(saldo)` wallet aktif | `Rp 28.750.000` |
| Jumlah wallet | Integer | count aktif | `3 wallet aktif` |
| Nama wallet | Text | `nama_wallet` | Max 40 char |
| Saldo | Currency | `saldo` | `Rp 1.750.000`; tabular |
| Status | Badge | `is_active` | `Aktif` hijau / `Nonaktif` abu |
| Ikon wallet | Icon | mapping nama/tipe | Cash=Banknote, Rekening=Landmark, OrderKuota=Smartphone |
| Aktivitas terakhir | Text | `updated_at` | "Diperbarui 2 jam lalu" |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Total aset | Load/update | Count-up + highlight | 500ms | ease-out |
| Wallet card | Hover | Lift 2px + shadow-md | 200ms | ease-standard |
| Card | Tap | Scale 0.99 | 100ms | ease-standard |
| Menu | Buka | Fade + scale 0.98→1 | 150ms | ease-standard |
| Toast | Mutasi sukses | Slide top + auto dismiss | 300ms | ease-out |
| Sheet | Buka | Slide up + backdrop | 300ms | ease-standard |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| Wallet card | Tap | Buka Detail Wallet |
| Mutasi Aset | Tap | Buka `/wallets/transfer` |
| Sesuaikan | Tap | Dialog pilih wallet + saldo baru + alasan |
| Tambah/Edit | Tap | Sheet form wallet |
| Menu card | Tap | Edit, Nonaktifkan, Set default Cash |
| Pull-to-refresh | Gesture | Refresh saldo |

### Accessibility

- **Keyboard:** hero → aksi cepat → card wallet → menu; menu `aria-haspopup="menu"`.
- **ARIA:** total aset `aria-live="polite"` saat berubah; card list `<ul>`; ikon dekoratif `aria-hidden`.
- **Contrast:** saldo `text-primary` 16.9:1; status hijau pakai `success-text`.
- **Touch target:** card ≥ 120px; tombol menu 44px; aksi cepat 48px.
- **Screen reader:** "Wallet Cash, saldo satu juta tujuh ratus lima puluh ribu rupiah, aktif".

### Responsive Behavior

- **Mobile:** 1 kolom card; hero full width; aksi cepat 2 tombol sejajar; menu bottom sheet.
- **Tablet:** grid 2 kolom card; hero + aksi cepat sejajar.
- **Desktop:** hero 8 kolom + panel aksi 4 kolom; grid 3 kolom card; hover states.

---

## Screen 09: Detail Wallet

**Purpose:** Melihat saldo, arus masuk/keluar wallet, riwayat transaksi terkait, dan audit penyesuaian.
**UVP Highlight:** Setiap perubahan saldo punya jejak audit — tidak ada angka yang berubah tanpa alasan.
**Route:** `/wallets/[id]` · **Access:** Admin

### Layout Structure

```
MOBILE
┌───────────────────────────────────┐
│ ←  Cash                      [⋮]  │
├───────────────────────────────────┤
│ ┌───────────────────────────────┐ │
│ │ SALDO SAAT INI                │ │
│ │ Rp 1.750.000                  │ │
│ │ ● Aktif · diperbarui 14:30    │ │
│ └───────────────────────────────┘ │
│ ┌─────────────┐ ┌───────────────┐ │
│ │ Masuk bulan │ │ Keluar bulan  │ │
│ │ +Rp 4.2 jt  │ │ −Rp 2.4 jt    │ │
│ └─────────────┘ └───────────────┘ │
│ [ Mutasi ] [ Sesuaikan Saldo ]    │
│ [ Riwayat ] [ Audit ]  ← tabs     │
│ 9 Nov · Kuota 7GB     +Rp 12.000  │
│ 9 Nov · Operasional   −Rp 25.000  │
└───────────────────────────────────┘
```

Desktop: header wallet + hero saldo 7 kolom, panel aksi & ringkasan 5 kolom; tabel riwayat full width dengan tab Riwayat/Audit.

### Components Used

| Component | Position | Description |
|---|---|---|
| PageHeader `detail` | Atas | Back, nama wallet, menu |
| MetricCard `hero` | Atas | Saldo saat ini + status |
| MetricCard `compact` ×2 | Grid | Masuk/keluar bulan ini |
| Button secondary | Atas | Mutasi, Sesuaikan, Edit |
| Tabs | Konten | Riwayat transaksi / Audit log |
| DataTable / ListRow | Konten | Transaksi terkait wallet |
| Timeline | Tab audit | Perubahan saldo & alasan |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default** | Saldo + ringkasan + riwayat | Data ada |
| **Empty** | Tab riwayat kosong: "Belum ada transaksi di wallet ini" | Wallet baru |
| **Loading** | Skeleton hero + 2 card + 6 row | Fetch |
| **Error** | Hero error + retry; tab tetap | API gagal |
| **Success** | Saldo & ringkasan ter-update + toast | Setelah mutasi/penyesuaian |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Hero saldo | Shimmer rect | 100% × 132px | Shimmer |
| Ringkasan | Pulse rect ×2 | 50% × 88px | Pulse |
| Riwayat rows | Pulse rect ×6 | 100% × 64px | Pulse |
| Tabs | Pulse rounded | 2 × 96×32px | Pulse |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | Buku besar kosong + koin |
| **Ukuran** | 160×120px |
| **Title** | Riwayat: "Belum ada transaksi" · Audit: "Belum ada penyesuaian" |
| **Description** | "Transaksi yang memakai wallet ini akan muncul di sini." / "Perubahan saldo manual akan tercatat di sini." |
| **CTA** | `Catat Transaksi` (primary) |
| **Link** | — |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **404 Wallet** | Empty state "Wallet tidak ditemukan" | Back ke `/wallets` |
| **API Failure** | Section error + retry | Retry |
| **Network Offline** | Banner + data cache | Auto-refresh |
| **403** | Halaman 403 | Back |
| **500** | Error state | Reload |
| **Saldo mismatch** | Banner warning "Saldo perlu disesuaikan" (jika ada selisih) | Buka penyesuaian |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| Saldo | Currency | `wallets.saldo` | `Rp 1.750.000` |
| Status | Badge | `is_active` | `Aktif` / `Nonaktif` |
| Masuk bulan ini | Currency | sum income+transfer-in bulan berjalan | `+Rp 4.200.000` hijau |
| Keluar bulan ini | Currency | sum expense+transfer-out+payout | `−Rp 2.400.000` merah |
| Tanggal transaksi | Date | `tanggal` | `9 Nov · 14:30` |
| Nominal | Currency | `nominal` | Signed + warna |
| Alasan penyesuaian | Text | audit log | Full text, max 200 char |
| Pelaku | Text | `users.full_name` | `oleh Trisno` |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Saldo | Load/update | Count-up | 500ms | ease-out |
| Tab | Ganti | Underline slide + content fade | 200ms | ease-standard |
| Row | Tap | Background highlight | 120ms | linear |
| Audit item | Load | Stagger fade-up | 250ms | ease-standard |
| Toast | Sukses | Slide top | 300ms | ease-out |
| Sheet | Buka | Slide up | 300ms | ease-standard |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| Mutasi | Tap | `/wallets/transfer?from=[id]` |
| Sesuaikan | Tap | Dialog saldo baru + alasan wajib |
| Riwayat row | Tap | Detail Transaksi |
| Tab Audit | Tap | Timeline perubahan saldo |
| Menu | Tap | Edit nama, nonaktifkan |
| Pull-to-refresh | Gesture | Refresh saldo |

### Accessibility

- **Keyboard:** tabs panah kiri/kanan; row dapat diaktifkan; menu keyboard.
- **ARIA:** tabs `role="tablist"`, panel `role="tabpanel"`; saldo live region; audit `<ol>`.
- **Contrast:** masuk `success-text` 5.2:1; keluar `error` 5.0:1.
- **Touch target:** tab 44px; row 64px.
- **Screen reader:** "Saldo Cash, satu juta tujuh ratus lima puluh ribu rupiah; masuk bulan ini empat juta dua ratus ribu rupiah".

### Responsive Behavior

- **Mobile:** 1 kolom; tabs sticky di bawah hero; list riwayat.
- **Tablet:** hero + ringkasan sejajar; tabel ringkas.
- **Desktop:** grid 7/5; tabel penuh; panel audit di tab; hover.

---

## Screen 10: Mutasi Aset

**Purpose:** Memindahkan saldo antar wallet dengan validasi saldo dan preview sebelum eksekusi.
**UVP Highlight:** Transfer bukan sekadar ubah angka — sistem membuat dua jurnal (keluar/masuk) yang konsisten dan dapat diaudit.
**Route:** `/wallets/transfer` · **Access:** Admin

### Layout Structure

```
MOBILE
┌───────────────────────────────────┐
│ ←  Mutasi Aset               ✕    │
├───────────────────────────────────┤
│ Dari Wallet *                     │
│ [ 💵 Cash — Rp 1.750.000     ▾ ]  │
│                    ⇅ Tukar        │
│ Ke Wallet *                       │
│ [ 🏦 Rekening BCA — Rp 12 jt ▾ ]  │
│ Nominal *                         │
│ [ Rp  0                       ]   │
│ [ Rp 500.000 ] [ Rp 1.000.000 ]   │
│ Keterangan *                      │
│ [_____________________________]   │
├───────────────────────────────────┤
│ PREVIEW                           │
│ Cash        Rp 1.750.000 → 1.250.000│
│ Rekening    Rp12.000.000 → 12.500.000│
├───────────────────────────────────┤
│ [        Konfirmasi Mutasi      ] │
└───────────────────────────────────┘
```

Desktop: form 6 kolom + preview/konfirmasi 6 kolom sticky.

### Components Used

| Component | Position | Description |
|---|---|---|
| PageHeader `form` | Atas | Back, judul, close |
| Select wallet | Form | Wallet asal & tujuan + saldo |
| Swap button | Tengah | Tukar asal/tujuan |
| MoneyInput | Form | Nominal + quick amount chips |
| Textarea | Form | Keterangan wajib |
| Preview card | Kanan/bawah | Saldo sebelum → sesudah |
| ConfirmDialog | Overlay | Konfirmasi akhir |
| Success sheet | Overlay | Bukti mutasi |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default** | Form kosong, preview "—" | Halaman dibuka |
| **Empty** | <2 wallet aktif → state "Butuh minimal 2 wallet" + CTA buat wallet | Wallet tidak cukup |
| **Loading** | Skeleton wallet select; spinner submit | Fetch / submit |
| **Error** | Inline error + alert saldo | Validasi / API |
| **Success** | Sheet bukti mutasi + kedua saldo ter-update | Tersimpan |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Form fields | Pulse line ×4 | 100% × 48px | Pulse |
| Preview card | Shimmer rect | 100% × 160px | Shimmer |
| Submit | Spinner | 20×20px | Spin |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | Dua dompet dengan panah putus |
| **Ukuran** | 160×120px |
| **Title** | "Butuh minimal 2 wallet aktif" |
| **Description** | "Mutasi memindahkan saldo dari satu wallet ke wallet lain. Tambahkan wallet baru terlebih dahulu." |
| **CTA** | `+ Buat Wallet` → `/wallets` |
| **Link** | — |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **Wallet sama** | "Wallet asal dan tujuan tidak boleh sama" | Disable submit |
| **Saldo kurang** | Alert: "Saldo Cash tidak mencukupi (tersisa Rp 1.750.000)" | Blokir submit |
| **Nominal 0** | "Nominal harus lebih dari 0" | Fokus nominal |
| **Wallet nonaktif** | "Wallet tidak aktif" + pilihan dinonaktifkan | Pilih wallet lain |
| **API Failure** | Alert + retry; saldo tidak berubah | Retry |
| **Network Offline** | Banner + submit disabled | Auto-retry |
| **500** | Alert + `Coba Lagi` | Retry |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| Wallet asal/tujuan | Select | `wallets` aktif | Nama + saldo `Rp 1.750.000` |
| Nominal | Currency | input | `Rp 500.000`, max saldo asal |
| Quick amount | Chip | 25%, 50%, 100% saldo | `Rp 437.500` |
| Saldo sebelum | Currency | `saldo` | Abu, tabular |
| Saldo sesudah | Currency | `saldo ± nominal` | Bold; merah jika negatif |
| Keterangan | Text | input | 5–200 char, wajib |
| ID mutasi | Text | generated | `TRF-2026-1109-0012` |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Swap | Tap | Ikon rotasi 180° + field crossfade | 250ms | ease-standard |
| Nominal | Ketik | Preview update + count-up | 200ms | ease-standard |
| Saldo cukup | Berubah | Preview border hijau / merah | 150ms | linear |
| Submit | Tap | ConfirmDialog scale-in | 200ms | ease-standard |
| Success | Konfirmasi | Check draw + sheet slide | 400ms | ease-out |
| Error | Validasi | Shake field | 240ms | ease-standard |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| Swap | Tap | Tukar wallet asal/tujuan |
| Quick amount | Tap | Isi nominal |
| Preview | Otomatis | Hitung saldo setelah |
| Konfirmasi | Tap | Dialog ringkasan → eksekusi |
| Selesai | Tap | Kembali ke Wallet & Aset |
| Close | Tap | Confirm jika dirty |

### Accessibility

- **Keyboard:** urutan natural; swap fokusabel; preview live region.
- **ARIA:** alert saldo `role="alert"`; select `aria-describedby` saldo; dialog focus trap.
- **Contrast:** preview negatif `error` 5.0:1; saldo netral 16.9:1.
- **Touch target:** field 48px; chip 44px; swap 44px.
- **Screen reader:** "Dari Cash, saldo satu juta tujuh ratus lima puluh ribu rupiah".

### Responsive Behavior

- **Mobile:** 1 kolom; preview di bawah form; sticky CTA.
- **Tablet:** form + preview bertumpuk, max 640px.
- **Desktop:** 6/6 kolom; preview sticky; Enter submit.

---

## Screen 11: Bagi Hasil

**Purpose:** Ringkasan periode mingguan — margin, beban, laba bersih, dan status payout — serta pintu masuk wizard.
**UVP Highlight:** Inilah layar yang membedakan PeppyCell: laba mingguan langsung terlihat siap dibagi, bukan dihitung manual di Excel.
**Route:** `/profit-sharing` · **Access:** Admin (full), Investor (read-only, agregat)

### Role Variants

| Variant | Konten | Aksi |
|---|---|---|
| **Admin** | Periode berjalan, progress hari ke-5/7, margin, beban, laba bersih, default split donut, riwayat 3 terakhir, banner "siap diproses" | `Hitung & Proses Bagi Hasil`, `Lihat Riwayat` |
| **Investor** | Laba bersih periode, deviden saya periode terakhir, tren 4 minggu, riwayat penerimaan | `Lihat Riwayat Deviden` (read-only) |

### Layout Structure

```
MOBILE — Admin
┌───────────────────────────────────┐
│ ←  Bagi Hasil                     │
├───────────────────────────────────┤
│ PERIODE BERJALAN                  │
│ 03 – 09 Nov 2026 · hari 5/7       │
│ ████████████████░░░░  71%         │
├───────────────────────────────────┤
│ ┌───────────────────────────────┐ │
│ │ LABA BERSIH PERIODE           │ │
│ │ Rp 4.250.000                  │ │
│ │ Margin Rp 6.1jt − Beban 1.85jt│ │
│ └───────────────────────────────┘ │
│ [Margin Penjualan] [Beban Oper.]  │
│ ┌───────────────────────────────┐ │
│ │ ALOKASI DEFAULT       [donut] │ │
│ │ ● Kas Ditahan        20%      │ │
│ │ ● Deviden Admin      40%      │ │
│ │ ● Deviden Investor   30%      │ │
│ │ ● Gaji Karyawan      10%      │ │
│ └───────────────────────────────┘ │
│ [   Hitung & Proses Bagi Hasil  ] │
│ Riwayat Payout                →   │
│ • 27 Okt–02 Nov   Rp 3.9jt  ✓     │
└───────────────────────────────────┘
```

Desktop: hero laba + 2 metric di kiri (8 kolom), donut alokasi + CTA di kanan (4 kolom); riwayat payout full width.

### Components Used

| Component | Position | Description |
|---|---|---|
| PageHeader | Atas | Judul + periode picker (read-only current) |
| MetricCard `hero` | Atas | Laba bersih periode |
| MetricCard `compact` ×2 | Grid | Margin penjualan, beban operasional |
| Progress bar | Atas | Progress periode 7 hari |
| Donut chart | Kanan | Alokasi default 4 kategori |
| Button primary | Bawah | Masuk wizard |
| ListRow compact | Bawah | 3 payout terakhir |
| Banner info | Atas | "Periode siap diproses" |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default** | Angka periode berjalan + donut + CTA | Ada data |
| **Empty** | Ilustrasi "Belum ada penjualan minggu ini", angka Rp 0, CTA catat | Periode tanpa transaksi |
| **Loading** | Skeleton hero + metric + donut + list | Fetch |
| **Error** | Card error + retry; CTA disabled | API gagal |
| **Success** | Banner "Payout selesai" + status periode Selesai + link detail | Setelah payout |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Hero laba | Shimmer rect | 100% × 140px | Shimmer |
| Progress | Pulse bar | 100% × 8px | Pulse |
| Metric | Pulse rect ×2 | 50% × 88px | Pulse |
| Donut | Shimmer circle | 160×160px | Shimmer |
| Riwayat | Pulse line ×3 | 100% × 56px | Pulse |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | Grafik datar + koin, line-art |
| **Ukuran** | 160×120px |
| **Title** | "Belum ada laba untuk dibagi" |
| **Description** | "Catat penjualan dan pengeluaran minggu ini. Laba bersih akan dihitung otomatis." |
| **CTA** | `+ Catat Transaksi` |
| **Link** | "Lihat panduan bagi hasil" |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **API Failure** | Card error + `Coba Lagi`; CTA disabled dengan helper | Retry |
| **Periode belum lengkap** | Banner info: "Periode masih berjalan. Payout bisa diproses setelah Minggu 23:59." | CTA disabled + tooltip |
| **Network Offline** | Banner offline + data cache | Auto-refresh |
| **403** | Halaman 403 untuk karyawan | Back |
| **500** | Error state | Reload |
| **Data tidak konsisten** | Banner warning "Ada selisih perhitungan. Periksa transaksi." | Link ke Transaksi filter |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| Periode | Date range | Senin–Minggu | `03 – 09 Nov 2026` |
| Progress | Percent | hari ke-/7 | `hari 5/7 · 71%` |
| Margin penjualan | Currency | Σ(`harga_jual−harga_beli` × qty) | `Rp 6.100.000` |
| Beban operasional | Currency | Σ expense kategori operasional | `−Rp 1.850.000` |
| Laba bersih | Currency | margin − beban | `Rp 4.250.000`; merah jika negatif |
| Alokasi | Percent | konfigurasi payout | `20%`, `40%`, `30%`, `10%` |
| Nominal alokasi | Currency | laba × persentase | `Rp 850.000` |
| Status periode | Badge | derived | `Berjalan` / `Siap Diproses` / `Selesai` |
| Riwayat | List | `payout_history` | `27 Okt–02 Nov · Rp 3.900.000 · Selesai` |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Hero laba | Load | Count-up | 600ms | ease-out |
| Progress bar | Load | Width 0→71% | 500ms | ease-out |
| Donut | Load | Sweep 0→360° | 600ms | ease-standard |
| Banner siap | Muncul | Slide down | 300ms | ease-standard |
| CTA | Hover | Lift 1px + shadow-sm | 150ms | ease-standard |
| Riwayat row | Tap | Highlight | 120ms | linear |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| CTA proses | Tap | Wizard step 1 |
| Donut segment | Tap/hover | Tooltip nama + nominal |
| Riwayat row | Tap | Detail Payout |
| Lihat semua | Tap | Riwayat Payout |
| Periode picker (admin) | Tap | Pilih periode lampau (read-only) |
| Pull-to-refresh | Gesture | Refresh angka |

### Accessibility

- **Keyboard:** hero → metric → donut (fokusabel per segmen) → CTA → riwayat.
- **ARIA:** donut `role="img"` + ringkasan teks; progress `role="progressbar"` dengan `aria-valuenow=71`; CTA disabled punya `aria-describedby`.
- **Contrast:** alokasi warna chart punya label teks; laba negatif `error` 5.0:1.
- **Touch target:** segmen donut tidak wajib touch (dekoratif) — data tersedia di list; CTA 48px.
- **Screen reader:** "Laba bersih periode tiga sampai sembilan November, empat juta dua ratus lima puluh ribu rupiah. Alokasi: kas ditahan 20 persen, deviden admin 40 persen, deviden investor 30 persen, gaji karyawan 10 persen."

### Responsive Behavior

- **Mobile:** 1 kolom; donut 160px; CTA sticky di atas nav; riwayat 3 item.
- **Tablet:** hero + metric 2 kolom; donut kanan.
- **Desktop:** grid 8/4; donut 200px; riwayat tabel 5 item; hover tooltip.

---

## Screen 12: Wizard Bagi Hasil

**Purpose:** Menghitung dan mengeksekusi pembagian laba mingguan dalam 3 langkah dengan preview per penerima.
**UVP Highlight:** Transparansi penuh — Admin melihat dampak rupiah tiap persentase sebelum satu klik payout mengubah saldo & jurnal.
**Route:** `/profit-sharing/new` · **Access:** Admin

### Layout Structure

```
MOBILE — Step 2 dari 3
┌───────────────────────────────────┐
│ ←  Bagi Hasil          1 ─ 2 ─ 3  │
│    ●───────●───────○              │
│    Verifikasi Alokasi  Review     │
├───────────────────────────────────┤
│ LABA BERSIH                       │
│ Rp 4.250.000                      │
│                                   │
│ Kas Ditahan           [ 20 ] %    │
│ ████████░░░░░░░░░░  Rp 850.000    │
│ Deviden Admin         [ 40 ] %    │
│ ████████████████░░  Rp 1.700.000  │
│ Deviden Investor      [ 30 ] %    │
│ ████████████░░░░░░  Rp 1.275.000  │
│ Gaji Karyawan         [ 10 ] %    │
│ ████░░░░░░░░░░░░░░  Rp 425.000    │
│ ───────────────────────────────── │
│ TOTAL             100% ✅          │
│                                   │
│ Rincian penerima            [▾]   │
│ • Investor A             Rp 765.000│
│ • Karyawan Sari          Rp 425.000│
├───────────────────────────────────┤
│ [        Lanjut ke Review       ] │
└───────────────────────────────────┘
```

Desktop: stepper horizontal di atas; form alokasi 7 kolom + ringkasan sticky 5 kolom. Step 3 menampilkan tabel penerima + wallet sumber.

### Step Detail

| Step | Judul | Konten | Validasi |
|---|---|---|---|
| 1 | Verifikasi Periode | Periode Senin–Minggu, total margin, total beban, laba bersih, jumlah transaksi; tombol `Lanjut` | Laba > 0; periode sudah selesai |
| 2 | Alokasi | 4 input persentase + slider, nominal live, total indicator, rincian penerima | Semua 0–100; total tepat 100%; minimal 1 penerima |
| 3 | Review & Eksekusi | Wallet sumber (default Cash), tabel penerima + nominal, total kas keluar, checkbox konfirmasi | Saldo wallet ≥ total payout; checkbox wajib |

### Components Used (Khusus Screen — tidak reusable)

| Komponen | Deskripsi |
|---|---|
| **Stepper horizontal** | 3 langkah, state done/current/upcoming, label + nomor; mobile ringkas tanpa label |
| **AllocationRow** | Label + input % + slider + nominal Rp + progress bar; state error bila total ≠ 100 |
| **RecipientTable** | Nama, role, pool, persentase, nominal; grouped per kategori |
| **PayoutReceipt** | Ringkasan setelah sukses; nomor payout, periode, total, wallet, tombol unduh |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default** | Step 1 dengan angka periode | Masuk wizard |
| **Empty** | Step 1: "Tidak ada transaksi pada periode ini" + CTA kembali | Periode kosong |
| **Loading** | Skeleton angka saat hitung; overlay "Memproses payout…" saat eksekusi | Fetch / submit |
| **Error** | Inline validation per field; alert di step 3; data tidak hilang | Validasi / API |
| **Success** | Receipt + confetti halus (reduced motion: check saja) | Payout selesai |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Step 1 angka | Shimmer rect ×3 | 100% × 96px | Shimmer |
| Step 2 allocation rows | Pulse line ×4 | 100% × 64px | Pulse |
| Step 3 tabel penerima | Pulse rect ×5 | 100% × 48px | Pulse |
| Eksekusi | Full overlay + spinner + progres teks | 100% viewport | Spinner 800ms + fade |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | Kalender kosong + koin |
| **Ukuran** | 160×120px |
| **Title** | "Tidak ada transaksi pada periode ini" |
| **Description** | "Pilih periode lain atau catat transaksi terlebih dahulu." |
| **CTA** | `Kembali ke Bagi Hasil` |
| **Link** | "Catat Transaksi" |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **Total alokasi ≠ 100%** | Total indicator merah + "Total harus 100% (saat ini 95%)" + CTA disabled | Auto-focus field terakhir |
| **Persentase invalid** | Field merah "Harus 0–100" | Clamp saat blur |
| **Saldo wallet kurang** | Alert di step 3: "Saldo Cash Rp 2.000.000, dibutuhkan Rp 3.400.000" + pilih wallet lain | Blokir eksekusi |
| **Laba negatif** | Step 1 warning: "Periode mengalami rugi. Payout tidak dapat diproses." | CTA disabled |
| **API Failure** | Alert "Payout gagal diproses. Tidak ada saldo yang berubah." | Retry; idempotency key |
| **Double submit** | CTA disabled + overlay; tombol tidak bisa diklik 2× | Idempotent request |
| **500** | Alert + `Coba Lagi` | Retry |
| **Network putus saat proses** | Layar "Mengecek status…" + polling status payout | Tidak mengulang otomatis |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| Periode | Date range | `start_date`–`end_date` | `03 – 09 Nov 2026 (Senin–Minggu)` |
| Margin | Currency | agregat | `Rp 6.100.000` |
| Beban | Currency | agregat | `Rp 1.850.000` |
| Laba bersih | Currency | margin − beban | `Rp 4.250.000` |
| Persentase | Integer | input | `0–100`, step 1, suffix `%` |
| Nominal alokasi | Currency | laba × % | `Rp 1.700.000`; pembulatan ke rupiah terdekat |
| Penerima | Text | `users.full_name` + role | `Investor A · Investor` |
| Porsi penerima | Percent | `default_profit_share` dalam pool | `45% dari pool investor` |
| Nominal penerima | Currency | pool × porsi | `Rp 765.000` |
| Wallet sumber | Select | `wallets` aktif | `Cash — Rp 5.000.000` |
| Total kas keluar | Currency | Σ deviden + gaji (tanpa retained) | `Rp 3.400.000` |
| ID payout | Text | generated | `PO-2026-1109-001` |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Step transition | Lanjut/Kembali | Slide horizontal + fade | 300ms | ease-standard |
| Slider | Drag | Nominal & bar update 1:1 | instan | — |
| Total 100% | Tercapai | Indikator berubah hijau + check pop | 250ms | ease-out |
| Recipient row | Persentase berubah | Count-up nominal | 200ms | ease-standard |
| Eksekusi | Tap | Overlay fade + spinner + progress teks | 300ms | ease-standard |
| Success | Selesai | Check draw + receipt slide up + confetti 600ms | 600ms | ease-out |
| Error | Validasi | Shake total indicator | 240ms | ease-standard |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| Slider | Drag | Ubah % dan nominal live |
| Input % | Ketik | Slider & nominal sinkron; clamp 0–100 |
| Rincian penerima | Expand | Tampilkan per orang |
| Lanjut | Tap | Validasi step → step berikutnya |
| Kembali | Tap | Step sebelumnya (data tetap) |
| Pilih wallet | Tap | Saldo & validasi update |
| Eksekusi | Tap | ConfirmDialog terakhir → proses |
| Unduh PDF | Tap (receipt) | Generate PDF payout |

### Accessibility

- **Keyboard:** slider bisa panah kiri/kanan (step 1%), input % bisa diketik; Tab urut per alokasi; Esc keluar dengan konfirmasi.
- **ARIA:** stepper `aria-current="step"`; slider `aria-valuemin/max/now/valuetext` ("20 persen, delapan ratus lima puluh ribu rupiah"); total `aria-live="polite"`; dialog konfirmasi fokus trap.
- **Contrast:** error total `#D92D20` 5.0:1; check hijau tidak sendirian (ada teks "Total 100%").
- **Touch target:** slider thumb 24px (area 44px); input % 48px; CTA 48px.
- **Screen reader:** setiap perubahan persentase membacakan nominal baru (polite, debounce 500ms agar tidak spam).

### Responsive Behavior

- **Mobile:** stepper ringkas (3 titik + label aktif); 1 kolom; rincian penerima accordion; CTA sticky; receipt full-screen.
- **Tablet:** form + ringkasan bertumpuk; stepper dengan label.
- **Desktop:** stepper penuh; form 7 kolom + ringkasan sticky 5 kolom; tabel penerima terlihat tanpa expand.

---

## Screen 13: Riwayat Payout

**Purpose:** Daftar payout mingguan yang sudah diproses — Admin melihat semua, Investor hanya penerimaan deviden miliknya.
**UVP Highlight:** Investor punya bukti penerimaan yang bisa diunduh, tanpa bisa melihat data penerima lain.
**Route:** `/profit-sharing/history` · **Access:** Admin (all), Investor (own dividends)

### Layout Structure

```
MOBILE — Admin
┌───────────────────────────────────┐
│ ←  Riwayat Payout         [📅]    │
│ [ Semua ][ Selesai ][ Gagal ]     │
├───────────────────────────────────┤
│ ┌───────────────────────────────┐ │
│ │ 03 – 09 Nov 2026      ✓ Selesai│ │
│ │ Laba bersih   Rp 4.250.000    │ │
│ │ Dibagikan     Rp 3.400.000    │ │
│ │ Wallet Cash · 9 Nov, 20:15    │ │
│ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ 27 Okt – 02 Nov 2026  ✓ Selesai│ │
│ │ Laba bersih   Rp 3.900.000    │ │
│ │ Dibagikan     Rp 3.120.000    │ │
│ └───────────────────────────────┘ │
└───────────────────────────────────┘
```

Desktop: tabel — Periode, Laba Bersih, Kas Ditahan, Total Dibagikan, Wallet, Status, Dieksekusi, Oleh. Filter tahun/bulan + status. Investor: list card "Deviden diterima" + periode + nominal + status + unduh.

### Components Used

| Component | Position | Description |
|---|---|---|
| PageHeader | Atas | Judul + filter tanggal |
| Segmented control | Atas | Semua / Selesai / Gagal (admin) |
| FilterBar | Atas | Bulan/tahun (investor: tahun) |
| DataTable / ListRow | Konten | Ringkasan payout |
| StatusBadge | Row | Selesai / Gagal / Diproses |
| MoneyText | Row | Nominal laba & dibagikan |
| EmptyState | Konten | Belum ada payout |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default** | List payout terbaru | Ada data |
| **Empty** | Ilustrasi kalender + "Belum ada payout" | Belum pernah proses |
| **Loading** | Skeleton 5 card/row | Fetch |
| **Error** | Inline error + retry | API gagal |
| **Success** | Row baru highlight + toast setelah payout | Baru selesai |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Filter | Pulse rounded ×3 | 80×32px | Pulse |
| Payout cards | Pulse rect ×5 | 100% × 108px | Pulse |
| Nominal | Pulse line | 40% × 20px | Pulse |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | Kalender + koin dengan tanda plus |
| **Ukuran** | 160×120px |
| **Title** | Admin: "Belum ada payout" · Investor: "Belum ada deviden diterima" |
| **Description** | Admin: "Payout pertama akan muncul setelah Anda memproses bagi hasil mingguan." · Investor: "Deviden akan muncul setelah Admin memproses payout." |
| **CTA** | Admin: `Proses Bagi Hasil` · Investor: `Kembali ke Dashboard` |
| **Link** | — |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **API Failure** | Error box + retry | Retry |
| **Network Offline** | Banner + cache | Auto-refresh |
| **403** | Halaman 403 | Back |
| **404 Detail** | Detail payout tidak ditemukan | Back ke riwayat |
| **500** | Error state | Reload |
| **Filter kosong** | Empty "Tidak ada payout di bulan ini" | Reset filter |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| Periode | Date range | `start_date`–`end_date` | `03 – 09 Nov 2026` |
| Laba bersih | Currency | `net_profit_total` | `Rp 4.250.000` |
| Kas ditahan | Currency | `retained_earnings` | `Rp 850.000` (admin only) |
| Total dibagikan | Currency | net profit − retained | `Rp 3.400.000` |
| Wallet | Text | join wallet | `Cash` |
| Status | Badge | derived | `Selesai` hijau, `Diproses` warning, `Gagal` merah |
| Dieksekusi | Datetime | `created_at` | `9 Nov 2026, 20:15` |
| Oleh | Text | user | `Trisno` |
| Deviden investor | Currency | detail penerima | `Rp 765.000` (investor view) |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Card | Tap | Highlight + press scale 0.99 | 120ms | ease-standard |
| Row baru | Setelah payout | Highlight kuning→transparan | 2s | ease-out |
| Filter | Ganti | Skeleton + fade list | 200ms | ease-standard |
| Status badge | Update | Crossfade warna | 200ms | linear |
| Unduh PDF | Tap | Icon spinner → check | 800ms | ease-standard |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| Card | Tap | Detail Payout |
| Filter status | Tap | Filter list |
| Filter bulan | Tap | Filter list |
| Unduh | Tap (investor) | Download PDF deviden |
| Proses (empty admin) | Tap | Wizard |

### Accessibility

- **Keyboard:** filter → list → detail; card Enter.
- **ARIA:** list semantik; status badge punya teks; periode `<time datetime>`.
- **Contrast:** semua badge memakai token teks; nominal 16.9:1.
- **Touch target:** card ≥ 108px; filter chip 44px.
- **Screen reader:** "Payout periode tiga sampai sembilan November, laba bersih empat juta dua ratus lima puluh ribu rupiah, status selesai".

### Responsive Behavior

- **Mobile:** card list; filter bottom sheet; investor 1 kolom.
- **Tablet:** tabel ringkas (Periode, Laba, Dibagikan, Status).
- **Desktop:** tabel penuh; filter bar 1 baris; export CSV (admin, fase 2).

---

## Screen 14: Detail Payout

**Purpose:** Bukti rincian payout: angka periode, alokasi, penerima, wallet, dan audit.
**UVP Highlight:** Setiap rupiah yang dibagikan bisa ditelusuri ke penerima dan wallet — dasar kepercayaan investor.
**Route:** `/profit-sharing/history/[id]` · **Access:** Admin (all), Investor (hanya baris deviden miliknya)

### Layout Structure

```
MOBILE — Admin                 MOBILE — Investor
┌─────────────────────────┐    ┌─────────────────────────┐
│ ←  Payout 03–09 Nov  ⋮  │    │ ←  Deviden Saya     ⋮   │
├─────────────────────────┤    ├─────────────────────────┤
│ ✓ Selesai · 9 Nov 20:15 │    │ ✓ Diterima              │
│ LABA BERSIH             │    │ DEVIDEN ANDA            │
│ Rp 4.250.000            │    │ Rp 765.000              │
├─────────────────────────┤    ├─────────────────────────┤
│ Alokasi                 │    │ Periode 03–09 Nov 2026  │
│ Kas ditahan    Rp 850rb │    │ Porsi 45% dari pool     │
│ Deviden Admin  Rp 1,7jt │    │ investor                │
│ Deviden Investor Rp1,27jt│   │ Status Selesai          │
│ Gaji Karyawan  Rp 425rb │    │ [ Unduh PDF ]           │
│ ─────────────────────── │    └─────────────────────────┘
│ TOTAL DIBAGIKAN Rp 3,4jt│
│ Sumber: Cash            │
├─────────────────────────┤
│ Penerima (expand)       │
│ • Investor A   Rp 765rb │
│ • Karyawan Sari Rp 425rb│
├─────────────────────────┤
│ [ Unduh PDF ]           │
└─────────────────────────┘
```

Desktop: receipt 8 kolom + panel audit 4 kolom; tabel penerima full width.

### Components Used

| Component | Position | Description |
|---|---|---|
| PageHeader `detail` | Atas | Back, judul periode, menu |
| StatusBadge | Hero | Selesai/Diproses/Gagal |
| MetricCard `hero` | Hero | Laba bersih / deviden |
| Breakdown list | Konten | 4 kategori alokasi + nominal |
| RecipientTable | Konten | Nama, role, porsi, nominal |
| Timeline audiens | Kanan | Dibuat, dieksekusi, wallet |
| Button secondary | Bawah | Unduh PDF |
| Alert | Atas | Jika investor hanya melihat sebagian data |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default** | Receipt lengkap | Data ada |
| **Empty** | N/A → 404 jika tidak ada | — |
| **Loading** | Skeleton receipt | Fetch |
| **Error** | Error state + retry | API gagal |
| **Success** | Toast "PDF berhasil diunduh" | Unduh |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Hero | Shimmer rect | 100% × 120px | Shimmer |
| Breakdown | Pulse line ×4 | 100% × 28px | Pulse |
| Recipient table | Pulse rect ×4 | 100% × 44px | Pulse |
| PDF button | Pulse rounded | 160×44px | Pulse |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | Dokumen dengan tanda seru |
| **Ukuran** | 160×120px |
| **Title** | "Payout tidak ditemukan" |
| **Description** | "Payout mungkin sudah dihapus atau tautan tidak valid." |
| **CTA** | `Kembali ke Riwayat` |
| **Link** | — |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **404** | Empty state | Back |
| **403 Investor orang lain** | Halaman 403 "Deviden ini bukan milik Anda" | Back |
| **API Failure** | Error + retry | Retry |
| **PDF gagal** | Toast error "Gagal membuat PDF" + retry | Retry |
| **Network Offline** | Banner + cache | Auto-retry |
| **500** | Error + reload | Reload |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| Periode | Date range | payout | `03 – 09 Nov 2026` |
| Status | Badge | payout | `Selesai` |
| Laba bersih | Currency | `net_profit_total` | `Rp 4.250.000` |
| Kas ditahan | Currency | `retained_earnings` | `Rp 850.000` |
| Deviden Admin | Currency | alokasi | `Rp 1.700.000` |
| Deviden Investor | Currency | alokasi pool | `Rp 1.275.000` |
| Gaji Karyawan | Currency | alokasi pool | `Rp 425.000` |
| Total dibagikan | Currency | Σ non-retained | `Rp 3.400.000` |
| Penerima | Table | join users | `Investor A · Investor · 45% · Rp 765.000` |
| Waktu | Datetime | `created_at` | `9 Nov 2026, 20:15 WIB` |
| ID | Text | payout id | `PO-2026-1109-001` |
| PDF | File | generated | `Payout-PO-2026-1109-001.pdf` |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Hero | Load | Count-up | 500ms | ease-out |
| Breakdown rows | Load | Stagger fade-up 40ms | 300ms | ease-standard |
| Row penerima | Expand | Height auto + fade | 250ms | ease-standard |
| PDF | Tap | Spinner → check → toast | 800ms | ease-standard |
| Copy ID | Tap | Toast | 200ms | ease-out |
| Alert investor | Muncul | Fade | 200ms | linear |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| Unduh PDF | Tap | Generate + download |
| Salin ID | Tap menu | Clipboard + toast |
| Penerima | Scroll/expand | Lihat semua baris (admin) |
| Back | Tap | Kembali ke riwayat |

### Accessibility

- **Keyboard:** hero → breakdown → tabel → PDF; tabel semantik.
- **ARIA:** receipt `<article>`; status live region; PDF button `aria-busy` saat proses.
- **Contrast:** semua nominal 16.9:1; badge status token teks.
- **Touch target:** PDF 48px; row 44px.
- **Screen reader:** "Payout periode tiga sampai sembilan November, laba bersih empat juta dua ratus lima puluh ribu rupiah, total dibagikan tiga juta empat ratus ribu rupiah".

### Responsive Behavior

- **Mobile:** 1 kolom; breakdown list; tabel penerima jadi card; PDF full width.
- **Tablet:** receipt + audit bertumpuk; tabel penerima ringkas.
- **Desktop:** receipt 8 kolom + audit 4 kolom; tabel penerima penuh; print stylesheet.

---

## Screen 15: Pengguna

**Purpose:** Mengelola akun Admin/Karyawan/Investor, role, porsi bagi hasil default, dan status aktif.
**UVP Highlight:** Porsi bagi hasil per orang diatur di sini — dasar perhitungan deviden dan komisi yang adil.
**Route:** `/users` · **Access:** Admin

### Layout Structure

```
MOBILE — Admin
┌───────────────────────────────────┐
│ ←  Pengguna               [+ Baru]│
│ [🔍 Cari nama/email…]             │
│ [ Semua ][ Admin ][ Karyawan ][ Investor ]│
├───────────────────────────────────┤
│ ┌───────────────────────────────┐ │
│ │ (TR) Trisno            Admin  │ │
│ │ trisno@peppycell.id  ● Aktif  │ │
│ │ Bagi hasil        — (Admin)   │ │
│ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ (SA) Sari           Karyawan  │ │
│ │ sari@peppycell.id    ● Aktif  │ │
│ │ Porsi komisi          60%     │ │
│ └───────────────────────────────┘ │
│ ┌───────────────────────────────┐ │
│ │ (IN) Investor A     Investor  │ │
│ │ investor@mail.com    ● Aktif  │ │
│ │ Porsi deviden         45%     │ │
│ └───────────────────────────────┘ │
└───────────────────────────────────┘
```

Desktop: tabel — Nama, Email, Role, Porsi Bagi Hasil, Status, Terakhir Aktif, Aksi. Search + filter role. Sheet undang/edit user.

### Components Used

| Component | Position | Description |
|---|---|---|
| PageHeader | Atas | Judul + tombol undang |
| Search + filter chips | Atas | Cari nama/email, filter role |
| DataTable / ListRow | Konten | User + role badge + porsi |
| Avatar | Row | Inisial 40px, warna dari hash nama |
| StatusBadge | Row | Aktif / Nonaktif |
| Sheet form | Overlay | Undang/edit user |
| Select role | Form | Admin/Karyawan/Investor |
| PercentageInput | Form | Porsi default 0–100 |
| ConfirmDialog | Overlay | Nonaktifkan user |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default** | List user | Ada data |
| **Empty** | "Belum ada pengguna selain Anda" + CTA undang | Baru ada admin |
| **Loading** | Skeleton 6 row | Fetch |
| **Error** | Inline error + retry | API gagal |
| **Success** | Toast "Undangan terkirim" / "Pengguna diperbarui" | Simpan |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Search | Pulse rounded | 100% × 40px | Pulse |
| User rows | Pulse rect ×6 | 100% × 76px | Pulse |
| Filter chips | Pulse rounded ×4 | 72×32px | Pulse |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | Dua avatar + ikon plus |
| **Ukuran** | 160×120px |
| **Title** | "Baru ada Anda di sini" |
| **Description** | "Undang karyawan untuk mencatat transaksi atau investor untuk melihat laporan." |
| **CTA** | `+ Undang Pengguna` |
| **Link** | — |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **Email invalid** | "Format email tidak valid" | Fokus email |
| **Email sudah terdaftar** | "Email ini sudah punya akun" | Tawarkan kirim ulang undangan |
| **Porsi invalid** | "Porsi harus 0–100%" | Clamp |
| **Role kosong** | "Pilih role pengguna" | Fokus select |
| **API Failure** | Alert + retry; data form tetap | Retry |
| **403** | Halaman 403 | Back |
| **Nonaktifkan diri sendiri** | Dialog warning "Anda tidak bisa menonaktifkan akun sendiri" | Blokir |
| **500** | Alert + retry | Retry |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| Nama | Text | `full_name` | Title case, max 60 char |
| Email | Email | `email` | Lowercase, truncate 1 baris |
| Role | Badge | `role` | Admin ungu, Karyawan biru, Investor teal |
| Porsi bagi hasil | Percent | `default_profit_share` | `60%`; `—` untuk Admin |
| Status | Badge | `is_active` | `Aktif` / `Nonaktif` |
| Terakhir aktif | Datetime | `last_sign_in_at` | "2 jam lalu", >7 hari → `2 Nov 2026` |
| Undangan | State | Supabase invite | `Menunggu konfirmasi` kuning |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Sheet | Buka | Slide up / scale-in | 300ms | ease-standard |
| Role select | Ganti | Helper porsi muncul + fade | 200ms | ease-standard |
| Avatar | Load | Fade in | 150ms | linear |
| Toast | Simpan | Slide top | 300ms | ease-out |
| Row | Nonaktif | Fade opacity 50% | 250ms | ease-standard |
| Confirm | Buka | Scale 0.96→1 | 200ms | ease-standard |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| Undang | Tap | Sheet email + role + porsi → kirim undangan |
| Row | Tap | Sheet edit (role, porsi, status) |
| Search | Ketik | Filter nama/email |
| Filter role | Tap chip | Filter list |
| Nonaktifkan | Menu | ConfirmDialog; user tidak bisa login |
| Kirim ulang undangan | Menu | Toast "Undangan dikirim ulang" |

### Accessibility

- **Keyboard:** search → chips → list → aksi; sheet focus trap.
- **ARIA:** tabel semantik; avatar dekoratif `aria-hidden`; porsi `aria-label="Porsi bagi hasil 60 persen"`.
- **Contrast:** role badge pakai token teks; status aktif `success-text`.
- **Touch target:** row 76px; tombol menu 44px.
- **Screen reader:** "Sari, karyawan, porsi komisi enam puluh persen, aktif, terakhir aktif dua jam lalu".

### Responsive Behavior

- **Mobile:** card list; filter chips horizontal scroll; form sheet full-screen.
- **Tablet:** tabel ringkas (Nama, Role, Porsi, Status).
- **Desktop:** tabel penuh + kolom terakhir aktif; bulk invite (fase 2).

---

## Screen 16: Profil & Pengaturan

**Purpose:** Melihat profil, mengganti password, dan mengatur tema (light/dark/system) serta preferensi notifikasi.
**UVP Highlight:** Tema gelap adalah warga kelas satu — bukan afterthought — dan preferensi tiap role tersimpan.
**Route:** `/settings` · **Access:** Semua role

### Layout Structure

```
MOBILE
┌───────────────────────────────────┐
│ ←  Profil & Pengaturan            │
├───────────────────────────────────┤
│ ┌───────────────────────────────┐ │
│ │ (TR)  Trisno                  │ │
│ │       Admin · trisno@mail.com │ │
│ │       [ Ganti Foto ]          │ │
│ └───────────────────────────────┘ │
│ AKUN                              │
│ Nama lengkap          Trisno   →  │
│ Email                 trisno@… →  │
│ Role                  Admin      │
│ KEAMANAN                          │
│ Ganti password                 →  │
│ Keluar dari semua perangkat    →  │
│ TAMPILAN                          │
│ Tema        [☀ Light][☾ Dark][◐ Auto]│
│ NOTIFIKASI                        │
│ Pengingat payout mingguan  [ ● ]  │
└───────────────────────────────────┘
```

Desktop: sidebar pengaturan (Akun, Keamanan, Tampilan, Notifikasi) + panel konten; max 880px.

### Components Used

| Component | Position | Description |
|---|---|---|
| PageHeader | Atas | Judul |
| Profile card | Atas | Avatar, nama, role, email |
| ListRow setting | Konten | Label + value + chevron |
| Segmented theme | Konten | Light / Dark / Auto |
| Switch | Konten | Pengingat payout |
| Sheet form | Overlay | Edit nama / ganti password |
| Button danger | Bawah | Keluar semua perangkat |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default** | Profil + setting | Halaman dibuka |
| **Empty** | N/A | — |
| **Loading** | Skeleton profil + 6 row | Fetch |
| **Error** | Inline error + retry | API gagal |
| **Success** | Toast "Perubahan disimpan" / "Password diperbarui" | Simpan |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Profile | Shimmer rect | 100% × 112px | Shimmer |
| Setting rows | Pulse line ×6 | 100% × 56px | Pulse |
| Theme control | Pulse rounded | 240×48px | Pulse |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | N/A — halaman pengaturan selalu punya konten |
| **Ukuran** | — |
| **Title** | — |
| **Description** | — |
| **CTA** | — |
| **Link** | — |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **Validation nama** | "Nama minimal 3 karakter" | Fokus |
| **Password lama salah** | "Password lama tidak sesuai" | Fokus password lama |
| **Password lemah** | "Minimal 8 karakter, kombinasi huruf & angka" | Helper + meter |
| **API Failure** | Alert + retry | Retry |
| **Network Offline** | Banner; setting tema tetap jalan lokal | Sync saat online |
| **500** | Alert + retry | Retry |
| **Foto >2MB** | "Ukuran maksimal 2MB" | Blokir upload |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| Nama | Text | `full_name` | Max 60 char |
| Email | Email | `email` | Read-only (ganti via support/admin) |
| Role | Badge | `role` | Admin / Karyawan / Investor |
| Avatar | Image | `avatar_url` | 80px circle; fallback inisial 2 huruf |
| Tema | Enum | localStorage + profile | `light` / `dark` / `system` |
| Notifikasi | Boolean | profile | ON/OFF, default ON untuk admin |
| Password | Password | input | Min 8 char, meter lemah/sedang/kuat |
| Sesi | List | Supabase | Perangkat + "Terakhir aktif" |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Theme segmented | Ganti | Pill slide + halaman crossfade | 200ms | ease-standard |
| Switch | Toggle | Knob slide + color | 150ms | ease-standard |
| Save | Tap | Spinner → check → toast | 400ms | ease-standard |
| Password meter | Ketik | Width & color transition | 200ms | linear |
| Sheet | Buka | Slide up | 300ms | ease-standard |
| Logout all | Konfirmasi | Dialog scale-in | 200ms | ease-standard |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| Edit nama | Tap | Sheet input + simpan |
| Ganti password | Tap | Sheet 3 field + validasi |
| Theme | Tap | Langsung ganti & persist |
| Notifikasi | Toggle | Simpan otomatis |
| Keluar semua | Tap | ConfirmDialog → logout semua sesi |
| Ganti foto | Tap | File picker → crop → upload |

### Accessibility

- **Keyboard:** semua row fokusabel; switch Space/Enter; segmented panah kiri/kanan.
- **ARIA:** switch `role="switch"` + `aria-checked`; theme group `role="radiogroup"`; foto `aria-label="Ganti foto profil"`.
- **Contrast:** dark mode toggle tetap terbaca; helper 5.3:1.
- **Touch target:** row 56px; switch 48px; segmented 44px.
- **Screen reader:** "Tema gelap, dipilih" / "Pengingat payout mingguan, aktif".

### Responsive Behavior

- **Mobile:** 1 kolom; theme segmented full width; sheet full-screen.
- **Tablet:** konten max 640px di tengah.
- **Desktop:** sidebar pengaturan 240px + panel; theme segmented 3 pilihan; hover states.

---

## Screen 17: Akses Ditolak / 404

**Purpose:** Menangani route terlarang (403) dan halaman tidak ditemukan (404) tanpa membuat user bingung.
**UVP Highlight:** Role-safe sampai ke error page — karyawan yang mencoba buka `/wallets` diarahkan dengan jelas, bukan melihat error teknis.
**Route:** `/403`, `/404` · **Access:** Semua role

### Layout Structure

```
┌───────────────────────────────────┐
│              ◉ PeppyCell          │
│                                   │
│         [ Ilustrasi 160×120 ]     │
│                                   │
│       Halaman ini khusus Admin    │
│   Akun Anda (Karyawan) tidak      │
│   memiliki akses ke Wallet & Aset.│
│                                   │
│        [ Kembali ke Dashboard ]   │
│        [ Hubungi Admin ] (link)   │
└───────────────────────────────────┘
```

Desktop: centered card 480px di atas background; ilustrasi lebih besar 200×150.

### Components Used

| Component | Position | Description |
|---|---|---|
| Logo | Atas | Brand |
| Illustration | Tengah | 403 gembok / 404 kompas |
| Heading | Tengah | Judul sesuai error |
| Description | Tengah | Penjelasan ramah + role user |
| Button primary | Bawah | Kembali ke dashboard |
| Link secondary | Bawah | Hubungi admin / cari halaman |

### States

| State | Visual | Trigger |
|---|---|---|
| **Default (403)** | Ilustrasi gembok + "Halaman ini khusus Admin" | Route terlarang |
| **Default (404)** | Ilustrasi kompas + "Halaman tidak ditemukan" | Route tidak ada |
| **Empty** | N/A | — |
| **Loading** | N/A — render instan | — |
| **Error** | N/A — halaman ini adalah error state | — |
| **Success** | Tombol kembali bekerja + toast "Kembali ke dashboard" | Tap CTA |

### Loading Skeleton Spec

| Region | Skeleton Type | Size | Animation |
|---|---|---|---|
| Semua | Tidak ada — halaman statis | — | — |

### Empty State Spec

| Elemen | Deskripsi |
|---|---|
| **Ilustrasi** | 403: gembok + kartu role · 404: kompas + peta |
| **Ukuran** | 160×120px / 200×150px |
| **Title** | 403: "Akses dibatasi" · 404: "Halaman tidak ditemukan" |
| **Description** | 403: "Halaman ini hanya untuk Admin. Akun Anda saat ini Karyawan." · 404: "Tautan mungkin salah atau halaman sudah dipindahkan." |
| **CTA** | `Kembali ke Dashboard` |
| **Link** | 403: "Hubungi Admin" (mailto/WA) · 404: "Buka Transaksi" |

### Error State Detail

| Error Type | Visual | Interaction |
|---|---|---|
| **403** | Gembok + role user | CTA dashboard; link hubungi admin |
| **404** | Kompas + saran halaman | CTA dashboard; link transaksi |
| **401** | Redirect ke `/login?next=...` | Login lalu kembali |
| **Offline** | Ilustrasi kabel putus | `Coba Lagi` |
| **500** | Ilustrasi server | `Muat Ulang` + ID error untuk support |

### Data Format Per Screen

| Elemen | Type | Source | Format |
|---|---|---|---|
| Kode error | Integer | HTTP status | `403` / `404` ditampilkan kecil di atas judul |
| Role user | Badge | session | `Karyawan` |
| Pesan | Text | static + role | Bahasa Indonesia, tanpa stack trace |
| Error ID | Text | generated | `ERR-8F2A-1109` (untuk 500) |

### Micro-interactions & Animations

| Element | Trigger | Animation | Duration | Easing |
|---|---|---|---|---|
| Ilustrasi | Load | Float halus 0→4px (loop 4s) | 4s | ease-in-out |
| CTA | Hover | Lift 1px + shadow-sm | 150ms | ease-standard |
| Page | Load | Fade-in + slide-up 8px | 300ms | ease-standard |
| Link | Hover | Underline slide | 150ms | linear |

### Interactions

| Element | Interaction | Feedback |
|---|---|---|
| Kembali | Tap | Navigate `/dashboard` |
| Hubungi Admin | Tap | Buka WhatsApp/email |
| Buka Transaksi | Tap | Navigate `/transactions` |
| Logo | Tap | Dashboard |

### Accessibility

- **Keyboard:** fokus otomatis ke heading; CTA berikutnya; skip link.
- **ARIA:** `role="main"`; heading `h1`; ilustrasi `alt` deskriptif.
- **Contrast:** teks 16.9:1; CTA 6.6:1.
- **Touch target:** CTA 48px; link 44px.
- **Screen reader:** "Akses dibatasi. Halaman ini hanya untuk Admin. Akun Anda saat ini Karyawan."

### Responsive Behavior

- **Mobile:** full-screen centered, padding 24px, CTA full width.
- **Tablet:** card 480px di tengah.
- **Desktop:** card 480px + ilustrasi 200×150; background pattern halus.

---

# BAGIAN 4 — Component Specs

> Semua component memakai token Bagian 1. Component di sini hanya yang dipakai **≥2 screen**.
> Component yang hanya dipakai 1 screen (Stepper wizard, AllocationRow, RecipientTable, PayoutReceipt) sudah didokumentasikan di Screen 12.

## 4.1 Component: AppShell

**Usage:** Semua screen setelah login. **Category:** Organism.

### Variants

| Variant | Visual | When to use |
|---|---|---|
| `admin` | Sidebar 280px dengan 7 menu + topbar + bottom nav mobile | Role Admin |
| `karyawan` | Sidebar 4 menu + bottom nav + FAB | Role Karyawan |
| `investor` | Sidebar 3 menu minimal, tanpa FAB | Role Investor |
| `auth` | Tanpa shell, konten full page | Login / 403 / 404 |

### States

| State | Visual Change |
|---|---|
| **Default** | Sidebar terbuka (desktop), topbar 64px, konten |
| **Scrolled** | Topbar dapat `shadow-sm` + border bawah setelah scroll >8px |
| **Collapsed** | Sidebar 80px icon-only + tooltip (tablet / toggle manual) |
| **Mobile nav open** | Bottom sheet "Lainnya" + backdrop |
| **Offline** | Banner sticky 40px di atas konten |
| **Loading** | Slot konten menampilkan skeleton halaman, shell tetap |

### Props / API

| Prop | Type | Default | Description |
|---|---|---|---|
| `role` | `admin \| karyawan \| investor \| auth` | `admin` | Menentukan menu & FAB |
| `activeRoute` | `string` | `-` | Highlight menu aktif |
| `breadcrumb` | `Array<{label, href}>` | `[]` | Breadcrumb desktop |
| `title` | `string` | `-` | Judul topbar mobile |
| `children` | `ReactNode` | `-` | Konten halaman |
| `onNavigate` | `function` | `-` | Callback navigasi |
| `offline` | `boolean` | `false` | Tampilkan banner offline |

### Accessibility

- Sidebar `<nav aria-label="Navigasi utama">`; item aktif `aria-current="page"`.
- Skip-link "Lewati ke konten" sebagai elemen fokus pertama.
- Mobile: bottom nav 4 item + FAB; menu "Lainnya" `aria-expanded` + focus trap.
- Collapsed sidebar tetap punya `aria-label` di setiap ikon.

---

## 4.2 Component: Button

**Usage:** Semua screen. **Category:** Atom.

### Variants

| Variant | Visual | When to use |
|---|---|---|
| `primary` | Fill `primary`, teks putih, radius-sm | CTA utama (1 per screen) |
| `secondary` | Fill `surface`, border `border`, teks primary | Aksi sekunder (Batal, Filter) |
| `ghost` | Transparan, teks primary, hover `primary-soft` | Aksi tersier, icon button |
| `danger` | Fill `error` atau outline error | Batalkan transaksi, nonaktifkan |

### States

| State | Visual Change |
|---|---|
| **Default** | Sesuai variant |
| **Hover** | Primary → `primary-hover`; secondary → bg `#F9FAFB`; lift 1px |
| **Active/Pressed** | Scale 0.98, shadow hilang |
| **Focus visible** | Ring 3px `primary-soft` + offset 2px |
| **Disabled** | Opacity 50%, cursor not-allowed, tanpa hover |
| **Loading** | Spinner 16px + label "Memproses…", disabled, lebar tetap |

### Props / API

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `primary \| secondary \| ghost \| danger` | `primary` | Gaya visual |
| `size` | `sm \| md \| lg \| icon` | `md` | Tinggi 36/44/48/44px |
| `loading` | `boolean` | `false` | Spinner + disable |
| `disabled` | `boolean` | `false` | Nonaktif |
| `fullWidth` | `boolean` | `false` | 100% width (mobile CTA) |
| `iconLeft/iconRight` | `LucideIcon` | `-` | Ikon 16–20px |
| `onClick` | `function` | `-` | Handler |

### Accessibility

- Native `<button>`; Enter/Space aktivasi; `aria-busy` saat loading; `aria-disabled` saat disabled.
- Teks tombol harus deskriptif ("Simpan Penjualan", bukan "OK").
- Icon-only wajib `aria-label`.
- Kontras primary 6.6:1; danger 5.0:1.

---

## 4.3 Component: InputField

**Usage:** Login, form transaksi, produk, wallet, pengguna, pengaturan. **Category:** Molecule.

### Variants

| Variant | Visual | When to use |
|---|---|---|
| `text` | Input 48px, label atas, helper bawah | Nama, email, keterangan |
| `currency` | Prefix `Rp`, format ribuan live, `inputmode=numeric` | Nominal, harga |
| `percentage` | Suffix `%`, step 1, clamp 0–100 | Porsi bagi hasil, alokasi |
| `password` | Toggle mata, masked | Login, ganti password |
| `search` | Ikon kiri, clear button, debounce | Cari produk/transaksi/user |
| `select` | Chevron, menu popover, search opsional | Wallet, role, kategori |

### States

| State | Visual Change |
|---|---|
| **Default** | Border `border`, bg `surface`, teks `text-primary` |
| **Hover** | Border `#D0D5DD` |
| **Focus** | Border primary + ring 3px `primary-soft` |
| **Filled** | Sama + tombol clear (search) |
| **Disabled** | Bg `#F9FAFB`, teks secondary, cursor not-allowed |
| **Error** | Border error + pesan + `aria-invalid` |
| **Loading** | Skeleton/disabled + spinner (select fetch) |

### Props / API

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `text \| currency \| percentage \| password \| search \| select` | `text` | Tipe field |
| `label` | `string` | `-` | Label wajib (kecuali search) |
| `value` | `string \| number` | `-` | Nilai |
| `placeholder` | `string` | `-` | Placeholder contoh, bukan instruksi |
| `helper` | `string` | `-` | Teks bantuan 12px |
| `error` | `string` | `-` | Pesan error; mengaktifkan state error |
| `required` | `boolean` | `false` | Tanda `*` + validasi |
| `disabled` | `boolean` | `false` | Nonaktif |
| `maxLength` | `number` | `-` | Batas karakter + counter |
| `onChange` | `function` | `-` | Handler |

### Accessibility

- `<label for>` selalu terhubung; `aria-describedby` ke helper/error; `aria-invalid` saat error.
- Currency: `aria-label` menyebut "dalam rupiah"; pembacaan screen reader memakai nilai numerik, bukan format titik.
- Password toggle `aria-label` berubah sesuai state.
- Target 48px; error `role="alert"` jika muncul setelah blur.

---

## 4.4 Component: MetricCard

**Usage:** Dashboard, Wallet & Aset, Detail Wallet, Bagi Hasil. **Category:** Molecule.

### Variants

| Variant | Visual | When to use |
|---|---|---|
| `hero` | Gradient `primary-soft`, nominal `font-money-lg`, delta + chart mini | Laba bersih, total aset, saldo wallet |
| `default` | Surface + border, label + nominal + icon | Laba kotor, beban, jumlah transaksi |
| `compact` | Tinggi 88px, label 12px + nominal 16px | Ringkasan masuk/keluar bulan ini |
| `delta` | Nominal + badge persentase + sparkline | Perbandingan periode |

### States

| State | Visual Change |
|---|---|
| **Default** | Sesuai variant |
| **Hover** | Lift 2px + `shadow-md` (jika interaktif) |
| **Focus** | Ring 2px primary (jika clickable) |
| **Loading** | Shimmer rect sesuai ukuran |
| **Error** | Border error + ikon + "Gagal memuat" + retry |
| **Empty/Zero** | Nominal `Rp 0` + helper "Belum ada data" |

### Props / API

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `hero \| default \| compact \| delta` | `default` | Gaya kartu |
| `label` | `string` | `-` | Label metric |
| `value` | `number` | `0` | Nominal |
| `format` | `currency \| integer \| percent` | `currency` | Format nilai |
| `delta` | `number` | `-` | Persentase perubahan |
| `trend` | `up \| down \| flat` | `-` | Arah delta |
| `icon` | `LucideIcon` | `-` | Ikon konteks |
| `loading` | `boolean` | `false` | Skeleton |
| `onClick` | `function` | `-` | Navigasi detail |

### Accessibility

- Container `role="group"` + `aria-label` lengkap; jika clickable, `role="link"`/`button` + fokus.
- Delta tidak hanya warna: ikon panah + tanda +/− + teks "naik/turun".
- Chart mini `aria-hidden` (ringkasan sudah ada di label).
- Live region hanya untuk hero yang berubah setelah refresh.

---

## 4.5 Component: DataTable / ListRow

**Usage:** Transaksi, Produk, Pengguna, Riwayat Payout, Detail Wallet. **Category:** Organism.

### Variants

| Variant | Visual | When to use |
|---|---|---|
| `table` | `<table>` penuh, header sticky, sortable | Desktop >1024px |
| `list` | Card row 72–108px, grouped date | Mobile <768px |
| `compact` | Row 56px tanpa border, untuk 5 item terbaru | Dashboard, ringkasan |

### States

| State | Visual Change |
|---|---|
| **Default** | Row zebra/divider, teks sesuai tipe |
| **Hover** | Row bg `#F9FAFB` (dark `#1F2633`) |
| **Selected** | Bg `primary-soft` + border kiri 2px primary |
| **Sorted** | Header arrow + `aria-sort` |
| **Loading** | 8 skeleton row sesuai tinggi final |
| **Empty** | EmptyState di dalam container |
| **Error** | Error box + retry di area tabel |

### Props / API

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `table \| list \| compact` | `table` | Layout |
| `columns` | `Column[]` | `-` | Definisi kolom (label, key, sortable, align) |
| `rows` | `object[]` | `[]` | Data |
| `loading` | `boolean` | `false` | Skeleton |
| `empty` | `ReactNode` | `-` | EmptyState |
| `onRowClick` | `function` | `-` | Buka detail |
| `sort` | `{key, dir}` | `-` | Sort aktif |
| `pagination` | `{page, pageSize, total}` | `-` | Kontrol halaman |

### Accessibility

- Desktop pakai `<table>` semantik + `<th scope="col">`; mobile pakai `<ul>/<li>`.
- Row clickable punya `tabIndex=0` + Enter/Space; jangan taruh tombol di dalam row tanpa `stopPropagation`.
- Kolom nominal `text-align: right` + `font-variant-numeric: tabular-nums`.
- Status selalu teks, bukan warna saja.

---

## 4.6 Component: StatusBadge

**Usage:** Semua list & detail (tipe transaksi, status payout, role, wallet, user). **Category:** Atom.

### Variants

| Variant | Visual | When to use |
|---|---|---|
| `income` | Bg hijau muda, teks `success-text`, ikon panah masuk | Transaksi pemasukan |
| `expense` | Bg merah muda, teks error, ikon panah keluar | Transaksi pengeluaran |
| `transfer` | Bg indigo muda, teks primary, ikon tukar | Mutasi aset |
| `payout` | Bg ungu muda, teks ungu, ikon koin | Payout |
| `role` | Outline + teks sesuai role | Admin/Karyawan/Investor |
| `status` | Dot + teks | Aktif/Nonaktif/Selesai/Gagal |
| `neutral` | Abu, ikon minus | Dibatalkan/nonaktif |

### States

| State | Visual Change |
|---|---|
| **Default** | Sesuai variant, tinggi 24px, padding 8px |
| **Hover** | Tooltip penjelasan (jika singkatan) |
| **Focus** | Ring 2px primary (jika interactive) |
| **Muted** | Opacity 60% untuk status dibatalkan |
| **Live** | Dot pulse 2s untuk status "Diproses" |
| **Loading** | Badge skeleton 64×24px |

### Props / API

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `income \| expense \| transfer \| payout \| role \| status \| neutral` | `neutral` | Warna & ikon |
| `label` | `string` | `-` | Teks badge |
| `icon` | `boolean` | `true` | Tampilkan ikon |
| `dot` | `boolean` | `false` | Titik status |
| `pulse` | `boolean` | `false` | Animasi live |

### Accessibility

- Selalu ada teks; ikon `aria-hidden`; kontras teks ≥4.5:1.
- Jangan mengandalkan warna untuk membedakan income/expense.
- Badge bukan tombol kecuali diberi `role="button"` + fokus.

---

## 4.7 Component: Modal / BottomSheet

**Usage:** Form produk, filter, konfirmasi, success receipt, ganti password. **Category:** Organism.

### Variants

| Variant | Visual | When to use |
|---|---|---|
| `dialog` | Center 480px, radius-lg, backdrop 40% | Konfirmasi desktop, form pendek |
| `sheet` | Bottom sheet mobile, drag handle, radius-lg atas | Filter, form, menu |
| `fullscreen` | Full viewport mobile | Form transaksi, wizard receipt |

### States

| State | Visual Change |
|---|---|
| **Closed** | Tidak dirender / `hidden` |
| **Opening** | Backdrop fade + panel slide/scale |
| **Open/Default** | Fokus trap, scroll body lock |
| **Loading** | Overlay spinner + konten disabled |
| **Error** | Alert di dalam panel; panel tetap terbuka |
| **Success/Closing** | Check state lalu slide out |

### Props / API

| Prop | Type | Default | Description |
|---|---|---|---|
| `open` | `boolean` | `false` | Visibilitas |
| `variant` | `dialog \| sheet \| fullscreen` | `sheet` | Layout |
| `title` | `string` | `-` | Judul + `aria-labelledby` |
| `description` | `string` | `-` | Subjudul opsional |
| `onClose` | `function` | `-` | Tutup (Esc/backdrop) |
| `dismissible` | `boolean` | `true` | Boleh tutup saat dirty? |
| `footer` | `ReactNode` | `-` | CTA sticky |
| `size` | `sm \| md \| lg` | `md` | 400/480/640px |

### Accessibility

- `role="dialog" aria-modal="true"`; fokus masuk ke elemen pertama; Esc menutup (jika `dismissible`).
- Fokus kembali ke pemicu setelah ditutup; body scroll lock.
- Sheet mobile wajib punya tombol close 44px + drag handle dekoratif.
- Konfirmasi destruktif: fokus default ke "Batal", bukan "Hapus".

---

## 4.8 Component: Toast

**Usage:** Global feedback setelah simpan, mutasi, payout, unduh. **Category:** Molecule.

### Variants

| Variant | Visual | When to use |
|---|---|---|
| `success` | Ikon centang hijau, border kiri success | Transaksi tersimpan |
| `error` | Ikon X merah, border kiri error | Gagal simpan/muat |
| `warning` | Ikon segitiga kuning | Saldo menipis, sesi hampir habis |
| `info` | Ikon info biru | Info netral |

### States

| State | Visual Change |
|---|---|
| **Entering** | Slide dari atas + fade, 300ms |
| **Visible** | Timer 3s (error 5s) |
| **Hover/Focus** | Timer pause + progress bar berhenti |
| **Stacked** | Maks 3 toast, yang lama terdorong |
| **Exiting** | Fade + slide up 200ms |
| **Action** | Tombol "Undo"/"Lihat" (opsional) |

### Props / API

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `success \| error \| warning \| info` | `info` | Gaya |
| `title` | `string` | `-` | Pesan utama singkat |
| `description` | `string` | `-` | Detail opsional |
| `duration` | `number` | `3000` | Auto dismiss (error 5000) |
| `action` | `{label, onClick}` | `-` | Aksi opsional |
| `position` | `top \| bottom` | `top` | Mobile top, desktop bottom-right |

### Accessibility

- Container `role="status" aria-live="polite"` (error: `alert` + `assertive`).
- Tidak boleh jadi satu-satunya feedback untuk aksi penting (selalu ada perubahan state visual).
- Fokus tidak dipindah ke toast; aksi dapat dijangkau Tab.

---

## 4.9 Component: MoneyText

**Usage:** Semua nominal di seluruh app. **Category:** Atom.

### Variants

| Variant | Visual | When to use |
|---|---|---|
| `display` | 28–30px, 700, tabular | Hero metric, saldo |
| `inline` | 14px, 600, tabular | Tabel, list, form ringkasan |
| `compact` | 12–14px, ringkas `Rp 1,2 jt` | Sumbu chart, tooltip, card kecil |
| `delta` | 12px + panah + tanda +/− | Perbandingan periode |

### States

| State | Visual Change |
|---|---|
| **Default/Neutral** | `text-primary` |
| **Positive** | `success-text` + prefix `+` |
| **Negative** | `error` + prefix `−` |
| **Zero** | `text-secondary` + `Rp 0` |
| **Loading** | Skeleton bar selebar nominal (pulse) |
| **Muted** | `text-secondary` untuk nilai non-aktif |

### Props / API

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `number` | `0` | Nilai numerik |
| `variant` | `display \| inline \| compact \| delta` | `inline` | Gaya |
| `sign` | `never \| auto \| always` | `never` | Tampilkan +/− |
| `tone` | `neutral \| positive \| negative \| muted` | `neutral` | Warna |
| `prefix` | `string` | `Rp` | Prefix mata uang |
| `loading` | `boolean` | `false` | Skeleton |

### Accessibility

- Teks visual `Rp 12.000`; `aria-label` / `<data value="12000">` untuk nilai mentah.
- Jangan pakai `letter-spacing` negatif pada angka.
- Selalu tabular-nums agar kolom sejajar.
- Warna negatif disertai tanda `−`, bukan hanya merah.

---

## 4.10 Component: EmptyState

**Usage:** Semua list/table/chart yang bisa kosong. **Category:** Molecule.

### Variants

| Variant | Visual | When to use |
|---|---|---|
| `no-data` | Ilustrasi + judul + deskripsi + CTA | Belum ada data sama sekali |
| `no-result` | Ilustrasi magnifier + "Tidak ada hasil" + reset filter | Filter/search kosong |
| `no-access` | Gembok + penjelasan role | 403 dalam card |
| `offline` | Kabel putus + "Anda offline" + retry | Gagal koneksi |

### States

| State | Visual Change |
|---|---|
| **Default** | Ilustrasi + teks + CTA |
| **Hover CTA** | Lift 1px + shadow-sm |
| **Focus CTA** | Ring 3px primary-soft |
| **Pressed CTA** | Scale 0.98 |
| **Reduced motion** | Ilustrasi statis (tanpa float) |
| **Loading** | Tidak dipakai — gunakan skeleton, bukan empty state |

### Props / API

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `no-data \| no-result \| no-access \| offline` | `no-data` | Konteks |
| `illustration` | `ReactNode` | default per variant | Ilustrasi 160×120 |
| `title` | `string` | `-` | Judul singkat |
| `description` | `string` | `-` | Maks 2 baris |
| `cta` | `{label, onClick, variant}` | `-` | Aksi utama |
| `secondaryLink` | `{label, href}` | `-` | Link bantuan |

### Accessibility

- Ilustrasi `aria-hidden`; heading `h3`; deskripsi singkat.
- CTA fokusabel dan punya label jelas; jangan hanya ikon.
- Untuk `no-access`, jangan tampilkan data sensitif di belakang blur.

---

## 4.11 Component: PageHeader

**Usage:** Semua screen. **Category:** Molecule.

### Variants

| Variant | Visual | When to use |
|---|---|---|
| `default` | Judul + subtitle + aksi kanan | Dashboard, list |
| `detail` | Back + judul + menu | Detail transaksi/wallet/payout |
| `form` | Back/close + judul + subtitle + CTA | Input penjualan/pengeluaran, wizard |

### States

| State | Visual Change |
|---|---|
| **Default** | Statis di atas konten |
| **Sticky** | Menempel + `shadow-sm` + border setelah scroll |
| **Mobile** | Judul 18px, back 44px, aksi icon-only |
| **Loading** | Skeleton judul 40% × 24px + subtitle 24% × 16px |
| **Scrolled** | Background `surface/95` + blur 8px |
| **With breadcrumb** | Breadcrumb desktop di atas judul |

### Props / API

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `default \| detail \| form` | `default` | Layout |
| `title` | `string` | `-` | Judul halaman (`h1`) |
| `subtitle` | `string` | `-` | Konteks/tanggal |
| `backHref` | `string` | `-` | Tampilkan tombol back |
| `breadcrumb` | `Array` | `[]` | Desktop only |
| `actions` | `ReactNode` | `-` | Tombol kanan |
| `sticky` | `boolean` | `false` | Sticky + shadow saat scroll |

### Accessibility

- Satu `h1` per halaman; back button `aria-label="Kembali"`.
- Breadcrumb `<nav aria-label="Breadcrumb">` + `aria-current="page"`.
- Aksi icon-only wajib label; target 44px.

---

## 4.12 Component: FilterBar / SegmentedControl

**Usage:** Transaksi, Produk, Riwayat Payout, Pengguna, Detail Wallet. **Category:** Molecule.

### Variants

| Variant | Visual | When to use |
|---|---|---|
| `segmented` | Pill 36px, indicator slide, 2–4 opsi | Semua/Masuk/Keluar, status |
| `chips` | Chip scroll horizontal, multi-select | Operator produk, role user |
| `date-range` | Tombol tanggal + popover kalender | Transaksi, riwayat payout |
| `search` | Input search + clear | Semua list |

### States

| State | Visual Change |
|---|---|
| **Default** | Opsi tidak aktif: teks secondary, bg transparan |
| **Hover** | Bg `#F9FAFB` |
| **Active/Selected** | Bg `surface` + shadow-sm (segmented) / bg `primary-soft` + teks primary (chip) |
| **Focus** | Ring 2px primary-soft |
| **Disabled** | Opacity 50% (contoh: filter terkunci untuk karyawan) |
| **Loading** | Skeleton chip 72×32px, kontrol disabled |

### Props / API

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `segmented \| chips \| date-range \| search` | `segmented` | Jenis filter |
| `options` | `Array<{label, value, count?}>` | `[]` | Opsi |
| `value` | `string \| string[] \| DateRange` | `-` | Nilai aktif |
| `onChange` | `function` | `-` | Handler |
| `locked` | `boolean` | `false` | Tampilkan ikon lock + tooltip (karyawan) |
| `loading` | `boolean` | `false` | Skeleton/disabled |

### Accessibility

- Segmented `role="tablist"` / `radiogroup`; panah kiri/kanan pindah opsi; `aria-pressed` untuk chip.
- Filter terkunci: `aria-disabled` + tooltip "Hanya transaksi Anda hari ini".
- Jumlah hasil diumumkan via live region saat filter berubah.
- Target chip 44px area; scroll horizontal tanpa scrollbar terlihat.

---

# APPENDIX

## A. Role Visibility Matrix (UI)

| Data / Aksi | Admin | Karyawan | Investor |
|---|---|---|---|
| Harga beli & margin produk | ✅ | ❌ | ❌ |
| Harga jual produk | ✅ | ✅ | ❌ |
| Laba kotor & laba bersih | ✅ | ❌ | ✅ (agregat) |
| Total aset | ✅ | ❌ | ✅ (agregat) |
| Saldo per wallet | ✅ | ❌ (Cash hanya konteks input) | ❌ |
| Semua transaksi | ✅ | ❌ | ❌ |
| Transaksi milik sendiri hari ini | ✅ | ✅ | ❌ |
| Input penjualan/pengeluaran | ✅ | ✅ | ❌ |
| CRUD produk | ✅ | ❌ (read-only) | ❌ |
| CRUD wallet & mutasi | ✅ | ❌ | ❌ |
| Proses payout | ✅ | ❌ | ❌ |
| Riwayat payout semua | ✅ | ❌ | ❌ |
| Deviden milik sendiri | ✅ (sebagai admin) | ❌ | ✅ |
| Manajemen pengguna | ✅ | ❌ | ❌ |

> Implementasi: filter di query (RLS) **dan** conditional render. Jangan kirim field terlarang ke client lalu disembunyikan CSS.

## B. Token → shadcn/ui CSS Variables

```css
/* Light */
:root {
  --background: 220 33% 98%;        /* #F7F8FC */
  --foreground: 221 39% 11%;        /* #101828 */
  --card: 0 0% 100%;
  --card-foreground: 221 39% 11%;
  --popover: 0 0% 100%;
  --popover-foreground: 221 39% 11%;
  --primary: 243 75% 59%;           /* #4F46E5 */
  --primary-foreground: 0 0% 100%;
  --secondary: 174 77% 26%;         /* #0F766E */
  --secondary-foreground: 0 0% 100%;
  --muted: 220 14% 96%;             /* #F2F4F7 */
  --muted-foreground: 220 9% 46%;   /* #667085 */
  --destructive: 4 74% 49%;         /* #D92D20 */
  --destructive-foreground: 0 0% 100%;
  --border: 220 13% 91%;            /* #EAECF0 */
  --input: 220 13% 91%;
  --ring: 243 75% 59%;
  --radius: 0.75rem;                /* 12px */
}

/* Dark */
.dark {
  --background: 222 41% 8%;         /* #0C111D */
  --foreground: 210 33% 97%;        /* #F5F7FA */
  --card: 222 27% 12%;              /* #161B26 */
  --card-foreground: 210 33% 97%;
  --popover: 218 24% 16%;           /* #1F2633 */
  --popover-foreground: 210 33% 97%;
  --primary: 239 84% 74%;           /* #818CF8 */
  --primary-foreground: 222 41% 8%;
  --secondary: 172 66% 50%;         /* #2DD4BF */
  --secondary-foreground: 222 41% 8%;
  --muted: 218 24% 16%;
  --muted-foreground: 218 11% 65%;  /* #98A2B3 */
  --destructive: 6 92% 69%;         /* #F97066 */
  --destructive-foreground: 222 41% 8%;
  --border: 217 21% 21%;            /* #2A3441 */
  --input: 217 21% 21%;
  --ring: 239 84% 74%;
}
```

> Tambahan token custom: `--success`, `--success-text`, `--warning`, `--warning-text`, `--chart-1..2`, `--sidebar-width`, `--topbar-height`, `--bottomnav-height`.

## C. Format & Copywriting

| Konteks | Aturan | Contoh |
|---|---|---|
| Mata uang | `Rp` + spasi + ribuan titik, tanpa desimal | `Rp 12.000` |
| Negatif | Minus tipografis + warna error | `−Rp 25.000` |
| Persen | Koma desimal, maks 1 angka | `12,5%` |
| Tanggal | `d MMM yyyy` | `9 Nov 2026` |
| Tanggal + waktu | `d MMM yyyy, HH:mm WIB` | `9 Nov 2026, 14:30 WIB` |
| Periode | Rentang dengan en dash | `03 – 09 Nov 2026` |
| Waktu relatif | <24 jam; selebihnya absolut | `2 jam lalu` → `8 Nov, 14:30` |
| ID transaksi | Prefix + tanggal + urutan | `TX-2026-1109-0042` |
| Empty | Sebut alasan + aksi | "Belum ada produk. Tambahkan produk pertama Anda." |
| Error | Apa yang gagal + langkah berikut | "Gagal menyimpan. Periksa koneksi lalu coba lagi." |
| Konfirmasi payout | Konsekuensi eksplisit | "Payout akan membuat catatan pengeluaran dan memotong saldo Cash. Tindakan ini tidak bisa dibatalkan." |
| Toast sukses | Singkat, past tense | "Transaksi berhasil dicatat." |
| Nada | Netral-profesional, sapaan "Anda" | Hindari "lo/gue", hindari istilah teknis |

**Larangan copy:** jangan tampilkan "margin", "harga beli", "profit", "saldo wallet", atau "total aset" di UI Karyawan — termasuk di tooltip, placeholder, atau pesan error.

## D. Asumsi & Open Questions (perlu diputuskan di Tech Spec)

| # | Topik | Asumsi desain | Keputusan yang dibutuhkan |
|---|---|---|---|
| 1 | Konfigurasi persentase alokasi | 4 nilai global (retained/admin/investor/karyawan) + `default_profit_share` per user | Simpan di tabel `payout_settings` (singleton) atau `app_settings` JSON? |
| 2 | Pembagian pool investor/karyawan | Pool dibagi proporsional berdasarkan `default_profit_share` masing-masing | Apakah porsi boleh 0? Bagaimana jika total porsi 0? |
| 3 | Visibilitas omzet karyawan | Karyawan melihat jumlah transaksi + nilai penjualan miliknya (harga jual), tanpa profit | Konfirmasi apakah omzet boleh terlihat |
| 4 | Pembatalan transaksi | Admin dapat void dengan alasan → jurnal balik, bukan delete | Perlu aturan cutoff (misal 7 hari) & siapa boleh void |
| 5 | Payout | Dibuat setelah periode Minggu 23:59; bisa diulang? | Idempotency & status `Diproses/Gagal`; retry policy |
| 6 | Retained earnings | Tidak memotong wallet; tetap di saldo bisnis | Apakah perlu wallet "Kas Ditahan" terpisah? |
| 7 | Zona waktu | WIB fixed | Apakah perlu dukungan WITA/WIT? |
| 8 | Pajak & biaya transfer | Tidak dihitung | Masuk fase berikutnya? |
| 9 | Multi-outlet | Tidak termasuk | Fase ekspansi |
| 10 | Modul Servis HP/PC | Belum dirancang | Fase berikutnya (lihat PRD §7) |
| 11 | Notifikasi payout | In-app banner + toast | WhatsApp/email di fase 2? |
| 12 | Export | PDF payout, CSV transaksi | Format & role yang boleh export |

## E. Validasi Checklist

- [x] Semua screen dari Bagian 2 ada di Bagian 3 (17/17)
- [x] Setiap screen memakai color, typography, spacing dari Bagian 1
- [x] Setiap component Bagian 4 punya ≥3 variants
- [x] Setiap screen punya ≥5 states (default, empty, loading, error, success)
- [x] Accessibility section ada di setiap screen
- [x] Responsive behavior ada di setiap screen
- [x] Component specs konsisten dengan design system
- [x] Loading skeleton spec ada di setiap screen
- [x] Error state detail ada di setiap screen
- [x] Data format spec ada di setiap screen
- [x] Micro-interactions & animations ada di setiap screen
- [x] Dark mode tokens lengkap (light + dark)
- [x] Information Architecture / sitemap digenerate
- [x] Component Bagian 4 dipakai ≥2 screen (Stepper & komponen wizard dipindah ke Screen 12)
- [x] Bagian 5 (Google Stitch Prompt) **tidak dibuat** sesuai pilihan user — bisa diminta kapan saja

## F. Next Steps

1. Review DESIGN.md → tandai keputusan pada Appendix D.
2. Lanjut **write-tech-spec**: skema `payout_settings`, RLS policy per role, API routes, dan komponen shadcn yang dipakai.
3. Pecah menjadi task di `.agents/tasks/` lalu implementasi.
4. Setelah UI jadi, uji kontras & keyboard nav dengan data nyata (minimal 3 role).

---

> **Catatan:** Bagian 5 (Google Stitch Prompt) tidak disertakan karena user memilih "Tidak perlu". Folder `design-references/` juga tidak dibuat. Jika nanti dibutuhkan, minta: *"Buatkan prompt Stitch dari DESIGN.md ini."*

