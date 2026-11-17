#!/usr/bin/env bun
/**
 * Membuat / memperbarui akun Admin pertama lewat Supabase Admin API.
 *
 * Pemakaian:
 *   bun run seed:admin -- --email=admin@peppycell.id --password=Password123! \
 *     --name="Admin PeppyCell"
 *
 * Variabel env yang dipakai:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME
 */
import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found?.slice(prefix.length);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi.\n" +
      "Jalankan mode demo tanpa script ini: bun run dev.",
  );
  process.exit(1);
}

const email = (arg("email") ?? process.env.SEED_ADMIN_EMAIL ?? "admin@peppycell.id").toLowerCase();
const password = arg("password") ?? process.env.SEED_ADMIN_PASSWORD;
const fullName = arg("name") ?? process.env.SEED_ADMIN_NAME ?? "Admin PeppyCell";

if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  console.error(
    "Password admin wajib diisi dan minimal 8 karakter dengan kombinasi huruf & angka.\n" +
      "Contoh: bun run seed:admin -- --email=admin@peppycell.id --password=Admin123!",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(target: string) {
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
  return null;
}

console.log(`Menyiapkan admin ${email}…`);

let userId: string;
const existing = await findUserByEmail(email);
if (existing) {
  const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    app_metadata: { role: "admin" },
    user_metadata: { full_name: fullName, role: "admin", default_profit_share: 100 },
  });
  if (error) throw error;
  userId = data.user.id;
  console.log("Akun auth sudah ada — password & metadata diperbarui.");
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "admin" },
    user_metadata: { full_name: fullName, role: "admin", default_profit_share: 100 },
  });
  if (error) throw error;
  userId = data.user.id;
  console.log("Akun auth dibuat.");
}

const { error: profileError } = await admin.from("users").upsert(
  {
    id: userId,
    email,
    full_name: fullName,
    role: "admin",
    default_profit_share: 100,
    is_active: true,
    theme: "system",
    notification_payout: true,
  },
  { onConflict: "id" },
);
if (profileError) throw profileError;

const { error: settingsError } = await admin.from("payout_settings").upsert(
  {
    id: 1,
    retained_pct: 20,
    admin_pct: 40,
    investor_pct: 30,
    employee_pct: 10,
    updated_by: userId,
  },
  { onConflict: "id" },
);
if (settingsError) throw settingsError;

console.log(`✔ Admin siap: ${email} (${userId})`);
console.log("Login melalui /login, lalu undang pengguna lain dari /users.");
