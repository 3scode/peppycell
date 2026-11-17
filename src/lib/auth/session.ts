import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { SessionUser, UserRole } from "@/types/domain";

export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const { data: profile } = await supabase
      .from("users")
      .select("*")
      .eq("id", data.user.id)
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
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
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
