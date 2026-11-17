import { z } from "zod";
import { emailSchema, fullNameSchema, idSchema, pctSchema } from "@/lib/validations/common";

const role = z.enum(["admin", "karyawan", "investor"], { error: "Role tidak valid." });

export const createUserSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, "Password minimal 8 karakter.")
    .max(72, "Password maksimal 72 karakter."),
  fullName: fullNameSchema,
  role,
  defaultProfitShare: pctSchema,
});

export const updateUserSchema = z.object({
  id: idSchema,
  fullName: fullNameSchema,
  role,
  defaultProfitShare: pctSchema,
  isActive: z.boolean(),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter.")
    .max(72, "Password maksimal 72 karakter.")
    .optional(),
});

export const toggleUserSchema = z.object({
  id: idSchema,
  isActive: z.boolean(),
});

export const deleteUsersSchema = z.object({
  ids: z
    .array(idSchema)
    .min(1, "Pilih minimal satu pengguna.")
    .max(100, "Maksimal 100 pengguna per penghapusan."),
});
