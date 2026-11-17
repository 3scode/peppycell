import sharp from "sharp";
import { requireApiRole } from "@/lib/auth/session";
import { setAvatar } from "@/lib/data/repository";
import { isSupabaseConfigured } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { apiError, apiOk, requestIdOf } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;

function isAllowedImage(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const webp =
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";
  return jpeg || png || webp;
}

async function storeAvatar(userId: string, buffer: Buffer): Promise<string> {
  const dataUrl = `data:image/webp;base64,${buffer.toString("base64")}`;
  if (!isSupabaseConfigured()) return dataUrl;
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const path = `${userId}/avatar.webp`;
    const { error } = await supabase.storage.from("avatars").upload(path, buffer, {
      upsert: true,
      contentType: "image/webp",
      cacheControl: "3600",
    });
    if (error) return dataUrl;
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
    await supabase.from("users").update({ avatar_url: publicUrl }).eq("id", userId);
    return publicUrl;
  } catch {
    return dataUrl;
  }
}

export async function POST(request: Request) {
  const requestId = requestIdOf(request);
  try {
    const user = await requireApiRole("admin", "karyawan", "investor");
    const form = await request.formData().catch(() => null);
    if (!form) {
      throw new AppError("VALIDATION_ERROR", "Body harus berupa multipart/form-data.");
    }

    const remove = String(form.get("remove") ?? "") === "true";
    if (remove) {
      await removeStoredAvatar(user.id);
      await setAvatar(user, null);
      return apiOk({ avatarUrl: null }, requestId);
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "File foto wajib diunggah.");
    }
    if (file.size > MAX_BYTES) {
      throw new AppError("VALIDATION_ERROR", "Ukuran maksimal 2MB.");
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new AppError("VALIDATION_ERROR", "Format foto harus JPG, PNG, atau WebP.");
    }

    const input = Buffer.from(await file.arrayBuffer());
    if (!isAllowedImage(input)) {
      throw new AppError("VALIDATION_ERROR", "Isi file bukan gambar yang valid.");
    }

    const optimized = await sharp(input)
      .rotate()
      .resize(512, 512, { fit: "cover", position: "center" })
      .webp({ quality: 86 })
      .toBuffer();

    const avatarUrl = await storeAvatar(user.id, optimized);
    await setAvatar(user, avatarUrl);

    return apiOk({ avatarUrl }, requestId);
  } catch (error) {
    return apiError(error, requestId);
  }
}

export async function DELETE(request: Request) {
  const requestId = requestIdOf(request);
  try {
    const user = await requireApiRole("admin", "karyawan", "investor");
    await removeStoredAvatar(user.id);
    await setAvatar(user, null);
    return apiOk({ avatarUrl: null }, requestId);
  } catch (error) {
    return apiError(error, requestId);
  }
}

async function removeStoredAvatar(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    await supabase.storage.from("avatars").remove([`${userId}/avatar.webp`]);
    await supabase.from("users").update({ avatar_url: null }).eq("id", userId);
  } catch {
    // Storage opsional; profil tetap dihapus di sisi aplikasi.
  }
}
