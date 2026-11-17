#!/usr/bin/env bun
/**
 * Validasi environment sebelum build/deploy.
 * Mode demo (Supabase kosong) diizinkan untuk development, ditolak di production.
 */
export {};

function mask(value: string | undefined): string {
  if (!value) return "(kosong)";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

const env = process.env;
const isProduction = env.NODE_ENV === "production";
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

const demoMode = !supabaseUrl && !anonKey;
let failed = false;

function fail(message: string) {
  failed = true;
  console.error(`✖ ${message}`);
}

function ok(message: string) {
  console.log(`✔ ${message}`);
}

console.log("PeppyCell — environment check\n");

ok(`NODE_ENV=${env.NODE_ENV ?? "development"}`);
ok(`NEXT_PUBLIC_APP_URL=${env.NEXT_PUBLIC_APP_URL ?? "(default http://localhost:3000)"}`);
ok(`TZ=${env.TZ ?? "(sistem)"}`);

if (demoMode) {
  ok("Mode DEMO aktif (Supabase tidak dikonfigurasi, data in-memory).");
  if (isProduction) {
    fail("Production tidak boleh berjalan tanpa NEXT_PUBLIC_SUPABASE_URL & ANON_KEY.");
  }
} else {
  if (!supabaseUrl) {
    fail("NEXT_PUBLIC_SUPABASE_URL wajib diisi.");
  } else {
    try {
      const url = new URL(supabaseUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("protokol");
      ok(`NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}`);
    } catch {
      fail("NEXT_PUBLIC_SUPABASE_URL bukan URL valid.");
    }
  }

  if (!anonKey) fail("NEXT_PUBLIC_SUPABASE_ANON_KEY wajib diisi.");
  else ok(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${mask(anonKey)}`);

  if (!serviceKey) {
    if (isProduction) fail("SUPABASE_SERVICE_ROLE_KEY wajib diisi di production.");
    else console.warn("⚠ SUPABASE_SERVICE_ROLE_KEY kosong — seed & admin API tidak tersedia.");
  } else {
    ok(`SUPABASE_SERVICE_ROLE_KEY=${mask(serviceKey)}`);
  }

  if (anonKey?.startsWith("eyJ") && serviceKey && anonKey === serviceKey) {
    fail("Anon key dan service role key tidak boleh sama.");
  }
}

if ((env.TZ ?? "").length > 0 && env.TZ !== "Asia/Jakarta") {
  console.warn("⚠ TZ bukan Asia/Jakarta. Perhitungan SQL memakai WIB eksplisit, tetapi proses Node sebaiknya TZ=Asia/Jakarta.");
}

if (env.AUTH_REDIRECT_URL && !env.AUTH_REDIRECT_URL.startsWith("http")) {
  fail("AUTH_REDIRECT_URL harus URL absolut.");
}

console.log("");
if (failed) {
  console.error("Environment belum siap. Perbaiki variabel di atas.");
  process.exit(1);
}
console.log("Environment OK.");
