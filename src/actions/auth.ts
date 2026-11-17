"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { toActionError, AppError } from "@/lib/errors";
import { clearSession } from "@/lib/auth/session";
import type { ActionResult, UserRole } from "@/types/domain";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Email wajib diisi.").email("Format email tidak valid."),
  password: z.string().min(1, "Password wajib diisi."),
  remember: z.boolean().optional(),
  next: z.string().optional(),
});

function safeNext(next: string | undefined): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/dashboard";
  return next;
}

export async function loginAction(
  raw: unknown,
): Promise<ActionResult<{ role: UserRole; redirectTo: string }>> {
  try {
    const input = loginSchema.parse(raw);

    if (!isSupabaseConfigured()) {
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message:
            "Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        },
      };
    }

    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error || !data.user) {
      return {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Email atau password tidak sesuai." },
      };
    }
    const { data: profile } = await supabase
      .from("users")
      .select("id,role,is_active,deleted_at")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile || !profile.is_active || profile.deleted_at) {
      await supabase.auth.signOut();
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "Akun belum terdaftar aktif di data aplikasi." },
      };
    }
    return {
      ok: true,
      data: { role: profile.role as UserRole, redirectTo: safeNext(input.next) },
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function logoutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const { createSupabaseServerClient } = await import("@/lib/supabase/server");
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch {
      // abaikan — cookie tetap dibersihkan
    }
  }
  await clearSession();
  redirect("/login");
}

export async function logoutAllAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const { createSupabaseServerClient } = await import("@/lib/supabase/server");
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      // abaikan — cookie tetap dibersihkan
    }
  }
  await clearSession();
  redirect("/login");
}

export async function requestPasswordResetAction(
  raw: unknown,
): Promise<ActionResult<{ sent: boolean }>> {
  try {
    const email = z.string().email("Format email tidak valid.").parse((raw as { email?: string })?.email);
    if (isSupabaseConfigured()) {
      const { createSupabaseServerClient } = await import("@/lib/supabase/server");
      const supabase = await createSupabaseServerClient();
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: process.env.AUTH_REDIRECT_URL,
      });
    }
    return { ok: true, data: { sent: true } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updatePasswordAction(
  raw: unknown,
): Promise<ActionResult<{ updated: boolean }>> {
  try {
    if (!isSupabaseConfigured()) {
      throw new AppError("VALIDATION_ERROR", "Ganti password melalui halaman Pengaturan.");
    }
    const password = z.string().min(8).parse((raw as { password?: string })?.password);
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new AppError("INTERNAL_ERROR", "Gagal memperbarui password.");
    return { ok: true, data: { updated: true } };
  } catch (error) {
    return toActionError(error);
  }
}
