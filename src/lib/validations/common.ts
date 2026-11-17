import { z } from "zod";

export const idSchema = z.string().min(1, "ID wajib diisi.").max(64);

export const rupiahSchema = z
  .number({ error: "Nominal wajib berupa angka." })
  .int("Nominal harus bilangan bulat rupiah.")
  .min(1, "Nominal harus lebih dari 0.")
  .max(1_000_000_000_000, "Nominal terlalu besar.");

export const saldoSchema = z
  .number({ error: "Saldo wajib berupa angka." })
  .int("Saldo harus bilangan bulat rupiah.")
  .min(0, "Saldo tidak boleh negatif.")
  .max(1_000_000_000_000, "Saldo terlalu besar.");

export const qtySchema = z
  .number({ error: "Jumlah wajib berupa angka." })
  .int("Jumlah harus bilangan bulat.")
  .min(1, "Jumlah minimal 1.")
  .max(99, "Jumlah maksimal 99.");

export const descriptionSchema = z
  .string()
  .trim()
  .min(5, "Keterangan minimal 5 karakter.")
  .max(200, "Keterangan maksimal 200 karakter.");

export const optionalDescriptionSchema = z
  .string()
  .trim()
  .max(200, "Keterangan maksimal 200 karakter.")
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const reasonSchema = z
  .string()
  .trim()
  .min(10, "Alasan minimal 10 karakter.")
  .max(200, "Alasan maksimal 200 karakter.");

export const pctSchema = z
  .number({ error: "Persentase wajib berupa angka." })
  .min(0, "Persentase minimal 0.")
  .max(100, "Persentase maksimal 100.");

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email wajib diisi.")
  .max(254, "Email terlalu panjang.")
  .email("Format email tidak valid.");

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Nama minimal 2 karakter.")
  .max(60, "Nama maksimal 60 karakter.");

export const idempotencySchema = z
  .string()
  .trim()
  .min(8, "Idempotency key minimal 8 karakter.")
  .max(80, "Idempotency key terlalu panjang.");
