import { z } from "zod";
import { rupiahSchema, saldoSchema } from "@/lib/validations/common";

export const productSchema = z
  .object({
    id: z.string().min(1).optional(),
    nama: z.string().trim().min(2, "Nama produk minimal 2 karakter.").max(60, "Nama produk maksimal 60 karakter."),
    operator: z.string().trim().min(1, "Operator wajib diisi.").max(40, "Operator maksimal 40 karakter."),
    hargaBeli: saldoSchema,
    hargaJual: rupiahSchema,
  })
  .refine((data) => data.hargaJual >= data.hargaBeli, {
    message: "Harga jual tidak boleh lebih rendah dari harga beli.",
    path: ["hargaJual"],
  });

export const toggleProductSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean(),
});

export const productIdsSchema = z.object({
  ids: z
    .array(z.string().min(1))
    .min(1, "Pilih minimal satu produk.")
    .max(100, "Maksimal 100 produk sekali proses."),
});

const priceChangeValue = z
  .number({ error: "Nilai kenaikan wajib berupa angka." })
  .min(0, "Nilai kenaikan tidak boleh negatif.")
  .max(1_000_000_000, "Nilai kenaikan terlalu besar.");

export const raiseProductPricesSchema = z
  .object({
    ids: z
      .array(z.string().min(1))
      .min(1, "Pilih minimal satu produk.")
      .max(100, "Maksimal 100 produk sekali ubah."),
    mode: z.enum(["percent", "nominal"], { error: "Metode kenaikan tidak valid." }),
    jual: priceChangeValue,
    beli: priceChangeValue,
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD."),
    rounding: z.enum(["none", "100", "500", "1000"], { error: "Pembulatan tidak valid." }),
  })
  .refine((data) => data.jual > 0 || data.beli > 0, {
    message: "Isi kenaikan harga jual atau harga beli.",
    path: ["jual"],
  })
  .refine((data) => data.mode !== "percent" || data.jual <= 100, {
    message: "Kenaikan persen maksimal 100%.",
    path: ["jual"],
  })
  .refine((data) => data.mode !== "percent" || data.beli <= 100, {
    message: "Kenaikan persen maksimal 100%.",
    path: ["beli"],
  });
