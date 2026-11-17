# Product Requirements Document (PRD) - PeppyCell

## 1. Pendahuluan
**Nama Proyek:** PeppyCell Web System
**Tujuan:** Mengembangkan sistem web berbasis ERP mini untuk mencatat transaksi penjualan (pulsa/kuota), pengeluaran operasional, manajemen aset, serta sistem bagi hasil (gaji dan deviden) mingguan. Sistem ini akan menggantikan pencatatan manual berbasis CSV/Excel.
**Target Pengguna:** Admin (Pemilik/Trisno), Karyawan (Kasir/Operasional), dan Investor.

## 2. Tech Stack Utama
*   **Framework Frontend:** Next.js (App Router, Versi Stabil Terbaru)
*   **Database & Backend:** Supabase (PostgreSQL, Supabase Auth, Row Level Security)
*   **Styling & UI Components:** Tailwind CSS + shadcn/ui
*   **UI Template/Layout:** TailAdmin (Wajib mendukung fitur **Dark Mode**)
*   **Hosting/Deployment:** Vercel (disarankan untuk ekosistem Next.js)

## 3. Manajemen Hak Akses (Role-Based Access Control)
Sistem menggunakan tiga tingkatan peran (*role*) pengguna:

1.  **Admin (Pemilik)**
    *   *Akses:* Akses Penuh (Full 100%).
    *   *Wewenang:* Konfigurasi sistem, CRUD Produk, CRUD Wallet (Aset), input transaksi, memproses *Weekly Profit Sharing*, manajemen *user*.
2.  **Karyawan (Kasir)**
    *   *Akses:* Operasional Terbatas.
    *   *Wewenang:* Input transaksi (penjualan & pengeluaran operasional). Dapat melihat harga jual, tetapi **tidak dapat** melihat harga beli (modal), margin/profit, dan total aset bisnis.
3.  **Investor**
    *   *Akses:* Read-Only (Hanya Lihat).
    *   *Wewenang:* Melihat dashboard performa bisnis, total aset, riwayat laba rugi, dan riwayat penerimaan deviden mereka.

## 4. Fitur Utama

### A. Dashboard & Analytics
*   **Admin & Investor:** Ringkasan Laba Bersih, Laba Kotor, Total Aset dari seluruh *wallet*, dan grafik tren penjualan mingguan/bulanan.
*   **Karyawan:** Ringkasan jumlah transaksi harian yang mereka input (tanpa menampilkan nominal profit).

### B. Manajemen Transaksi (Income & Expense)
*   **Input Penjualan:** Saat user menginput produk terjual, sistem otomatis mengambil *harga_beli* dan *harga_jual* dari master produk.
*   **Otomatisasi Saldo:** Pemasukan dari penjualan otomatis menambahkan saldo pada akun *wallet* **"Cash"** tanpa perlu input mutasi manual.
*   **Input Pengeluaran:** Form untuk mencatat biaya operasional harian.

### C. Manajemen Produk & Margin (Admin Only)
*   Tabel CRUD untuk daftar produk (contoh: Kuota 7GB, dll).
*   Kolom esensial: Nama Produk, Harga Beli, Harga Jual.
*   Sistem otomatis menghitung Margin (Harga Jual - Harga Beli) secara *real-time* di tingkat frontend/query.

### D. Manajemen Aset & Wallet (Admin Only)
*   Fitur CRUD dinamis untuk penyimpanan uang (contoh bawaan: Cash, Rekening, Saldo OrderKuota).
*   Kemampuan untuk melakukan "Mutasi Aset" (transfer saldo antar wallet).
*   Penyesuaian saldo (*Balance Adjustment*) jika terdapat selisih pencatatan.

### E. Weekly Profit Sharing (Sistem Gaji & Deviden)
*   **Kalkulasi Otomatis:** Menghitung Laba Bersih Mingguan (`Total Margin Penjualan - Total Beban Operasional`).
*   **Alokasi Dinamis:** Admin dapat mengatur persentase pembagian Laba Bersih untuk: Kas Ditahan (*Retained Earnings*), Deviden Admin, Deviden Investor, dan Gaji Karyawan (sebagai komisi bagi hasil).
*   **Proses Payout:** Tombol eksekusi yang akan:
    1. Membuat *record* pengeluaran khusus di tabel transaksi.
    2. Memotong saldo dari *wallet* yang dipilih.
    3. Menyimpan log pembagian di tabel *Payout History*.

## 5. Struktur Database (Supabase Schema Draft)

1.  **`users` (Extends Supabase Auth)**
    *   `id` (uuid, PK)
    *   `email`, `full_name`
    *   `role` (enum: 'admin', 'karyawan', 'investor')
    *   `default_profit_share` (decimal/percentage)
2.  **`wallets`**
    *   `id` (uuid, PK)
    *   `nama_wallet` (varchar)
    *   `saldo` (numeric)
    *   `is_active` (boolean - untuk soft delete)
3.  **`products`**
    *   `id` (uuid, PK)
    *   `nama_produk` (varchar)
    *   `harga_beli` (numeric)
    *   `harga_jual` (numeric)
4.  **`transactions`**
    *   `id` (uuid, PK)
    *   `tanggal` (timestamp)
    *   `tipe` (enum: 'income', 'expense', 'transfer', 'payout')
    *   `kategori` (varchar: 'penjualan', 'operasional', 'deviden', 'gaji', dll)
    *   `nominal` (numeric)
    *   `wallet_id` (FK to wallets)
    *   `product_id` (FK to products, opsional jika bukan penjualan)
    *   `keterangan` (text)
    *   `user_id` (FK to users - pencatat transaksi)
    *   `periode_payout` (varchar, opsional untuk tracking payout mingguan)
5.  **`payout_history`**
    *   `id` (uuid, PK)
    *   `start_date`, `end_date` (timestamp)
    *   `net_profit_total` (numeric)
    *   `retained_earnings` (numeric)
    *   `created_at` (timestamp)

## 6. Keamanan & Akses Data (Supabase RLS)
*   **Row Level Security (RLS)** wajib diaktifkan pada semua tabel.
*   *Policy* `products`: Karyawan hanya bisa melihat `nama_produk` dan `harga_jual`.
*   *Policy* `wallets`: Hanya Admin yang memiliki akses *Read* dan *Write*.
*   *Policy* `transactions`: Karyawan hanya bisa *Insert* dan *Read* transaksi yang mereka buat hari ini, sementara Admin dapat melihat semuanya.

## 7. Catatan Tambahan untuk Fase Berikutnya
*   Aplikasi ini disiapkan untuk dapat diekspansi dengan modul **Servis HP/PC** (pencatatan sparepart dan jasa) di *update* selanjutnya.