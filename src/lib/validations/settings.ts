import { z } from "zod";
import { fullNameSchema } from "@/lib/validations/common";

export const profileSchema = z.object({
  fullName: fullNameSchema,
  avatarUrl: z.string().max(500).nullable().optional(),
});

export const themeSchema = z.object({
  theme: z.enum(["light", "dark", "system"], { error: "Tema tidak valid." }),
});

export const notificationSchema = z.object({
  enabled: z.boolean(),
});

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Password lama wajib diisi."),
    newPassword: z
      .string()
      .min(8, "Password minimal 8 karakter.")
      .max(128, "Password maksimal 128 karakter.")
      .regex(/[A-Za-z]/, "Password harus mengandung huruf.")
      .regex(/\d/, "Password harus mengandung angka."),
    confirmPassword: z.string().min(1, "Konfirmasi password wajib diisi."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Konfirmasi password tidak sama.",
    path: ["confirmPassword"],
  });
