"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { SessionUser } from "@/types/domain";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const MAX_ORIGINAL_BYTES = 2 * 1024 * 1024;
const TARGET_SIZE = 256;

async function shrinkToWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas tidak tersedia.");
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    TARGET_SIZE,
    TARGET_SIZE,
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.86),
  );
  if (!blob) throw new Error("Gagal mengompres gambar.");
  return blob;
}

export function AvatarUploader({ user }: { user: SessionUser }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(user.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Format foto harus JPG, PNG, atau WebP.");
      return;
    }
    if (file.size > MAX_ORIGINAL_BYTES) {
      toast.error("Ukuran maksimal 2MB.");
      return;
    }
    setUploading(true);
    try {
      const optimized = await shrinkToWebp(file);
      const form = new FormData();
      form.append("file", new File([optimized], "avatar.webp", { type: "image/webp" }));
      const response = await fetch("/api/avatar", { method: "POST", body: form });
      const payload = (await response.json()) as {
        data?: { avatarUrl?: string | null };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Gagal mengunggah foto.");
      }
      setPreview(payload.data?.avatarUrl ?? null);
      toast.success("Foto profil diperbarui.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengunggah foto.");
    } finally {
      setUploading(false);
    }
  }

  async function onRemove() {
    setRemoving(true);
    try {
      const response = await fetch("/api/avatar", { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "Gagal menghapus foto.");
      }
      setPreview(null);
      toast.success("Foto profil dihapus.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus foto.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <Avatar name={user.fullName} src={preview} size="xl" />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label="Ganti foto profil"
          className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full border-2 border-surface bg-primary text-primary-foreground shadow-card hover:bg-primary-hover disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Camera className="size-3.5" aria-hidden />
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={onPick}
          aria-label="Pilih foto profil"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => inputRef.current?.click()}
          loading={uploading}
        >
          Ganti Foto
        </Button>
        {preview ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            loading={removing}
            className="text-error-text hover:bg-error-soft"
          >
            <Trash2 className="size-3.5" aria-hidden /> Hapus
          </Button>
        ) : null}
      </div>
      <p className="text-center text-[10px] text-foreground-muted">
        JPG, PNG, atau WebP · maks 2MB. Foto dipotong persegi dan dioptimalkan otomatis.
      </p>
    </div>
  );
}
