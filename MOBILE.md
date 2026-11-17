# PeppyCell Mobile (Capacitor)

Project dibungkus dengan **Capacitor 8** sebagai WebView shell. Karena Next.js ini memakai
server actions dan repository in-memory, APK **tidak berjalan offline** — APK membuka URL
server yang sedang berjalan.

## Build Cepat

```bash
# 1. Jalankan web server (terminal lain)
bun run dev

# 2. Build APK debug
bun run apk:debug
```

Output: `dist/PeppyCell-debug.apk`

## URL Server

Default APK debug mengarah ke `http://10.0.2.2:3000` (host dari Android emulator).

Ganti saat build lewat env:

```bash
# HP fisik di Wi-Fi yang sama (server harus listen 0.0.0.0)
CAPACITOR_SERVER_URL=http://192.168.1.10:3000 bun run apk:debug

# Setelah deploy ke Vercel
CAPACITOR_SERVER_URL=https://peppycell.vercel.app bun run apk:debug
```

Untuk HP fisik, jalankan dev server dengan host terbuka:

```bash
bun run dev -- -H 0.0.0.0
```

## Struktur

- `capacitor.config.ts` — appId, nama, `webDir`, dan `server.url`.
- `android/` — project native Android hasil `cap add android`.
- `scripts/build-apk.sh` — sync Capacitor + `assembleDebug` + copy APK ke `dist/`.
- `assets/` — source icon & splash untuk `@capacitor/assets`.

## Catatan

- APK ini **debug build**, ditandatangani dengan debug keystore. Untuk Play Store perlu
  release build + signing key sendiri.
- `android:usesCleartextTraffic="true"` aktif agar HTTP lokal bisa dibuka. Aman dibiarkan
  saat pindah ke HTTPS, tapi bisa dihapus kalau ingin HTTPS-only.
- Toolchain Android di mesin ini:
  - JDK 21: `~/android-tools/jdk`
  - Android SDK: `~/Android/Sdk` (platform 36, build-tools 36.0.0)
- Regenerate icon/splash setelah mengganti file di `assets/`:

```bash
bunx capacitor-assets generate --android \
  --iconBackgroundColor '#5B5BD6' \
  --splashBackgroundColor '#5B5BD6'
```
