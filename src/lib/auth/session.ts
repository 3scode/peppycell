import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { SessionUser, UserRole } from "@/types/domain";

type Jwk = {
  kty: string;
  kid?: string;
  alg?: string;
  key_ops?: string[];
};

const JWKS_TTL_MS = 10 * 60 * 1000;
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;

/**
 * Ambil JWKS sekali per proses lalu dipakai ulang. Tanpa ini, setiap request
 * (client Supabase baru) akan menarik JWKS lagi sehingga verifikasi JWT justru
 * menambah satu round-trip ke Supabase.
 */
async function loadJwks(): Promise<{ keys: Jwk[] } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return { keys: jwksCache.keys };
  }
  try {
    const response = await fetch(`${url}/auth/v1/.well-known/jwks.json`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { keys?: Jwk[] };
    if (!Array.isArray(payload.keys) || payload.keys.length === 0) return null;
    jwksCache = { keys: payload.keys, fetchedAt: Date.now() };
    return { keys: payload.keys };
  } catch {
    return null;
  }
}

type ServerSupabase = Awaited<
  ReturnType<typeof import("@/lib/supabase/server").createSupabaseServerClient>
>;

/**
 * Verifikasi identitas pemanggil.
 *
 * `getClaims()` memvalidasi tanda tangan JWT secara lokal (project ini memakai
 * signing key ES256), jadi tidak perlu round-trip ke Auth server seperti
 * `getUser()`. Kalau JWKS tidak tersedia / token tidak bisa diverifikasi lokal,
 * kita jatuh ke `getUser()` supaya perilakunya tetap aman.
 */
async function resolveUserId(supabase: ServerSupabase): Promise<string | null> {
  const jwks = await loadJwks();
  const { data, error } = await supabase.auth.getClaims(
    undefined,
    jwks ? { jwks: jwks as unknown as { keys: { kty: string; key_ops: string[] }[] } } : undefined,
  );
  // Tanpa error & tanpa data artinya memang tidak ada sesi — tidak perlu
  // round-trip tambahan ke Auth server.
  if (!error) return data?.claims?.sub ?? null;

  const { data: userData } = await supabase.auth.getUser();
  return userData.user?.id ?? null;
}

const loadSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!isSupabaseConfigured()) return null;
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const userId = await resolveUserId(supabase);
    if (!userId) return null;
    const { data: profile } = await supabase
      .from("users")
      .select(
        "id,email,full_name,role,is_active,avatar_url,default_profit_share,theme,notification_payout,deleted_at",
      )
      .eq("id", userId)
      .maybeSingle();
    if (!profile || !profile.is_active || profile.deleted_at) return null;
    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role as UserRole,
      isActive: profile.is_active,
      avatarUrl: profile.avatar_url ?? null,
      defaultProfitShare: Number(profile.default_profit_share ?? 0),
      theme: profile.theme ?? "system",
      notificationPayout: Boolean(profile.notification_payout),
    };
  } catch {
    return null;
  }
});

/**
 * Di-cache per request (React `cache`), jadi layout dan page yang sama-sama
 * memanggil fungsi ini hanya memicu satu kali verifikasi + satu query profil.
 */
export const getSessionUser = loadSessionUser;

export async function requireUser(): Promise<SessionUser> {
  const user = await loadSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/403");
  return user;
}

export async function requireApiRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AppError("UNAUTHORIZED", "Sesi tidak valid. Silakan login ulang.");
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new AppError("FORBIDDEN", "Anda tidak punya akses ke aksi ini.");
  }
  return user;
}

/** Bersihkan cookie sesi demo lama (jika ada) saat logout. */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete("pc_user");
  store.delete("pc_role");
}
