import { z } from "zod";
import { idSchema, dateSchema } from "@/lib/validations/common";

const kodeVoucherSchema = z
  .string()
  .trim()
  .min(3, "Kode voucher minimal 3 karakter.")
  .max(80, "Kode voucher maksimal 80 karakter.");

export const convertVoucherItemSchema = z.object({
  transactionId: idSchema,
  kodes: z
    .array(kodeVoucherSchema)
    .min(1, "Isi minimal satu kode voucher.")
    .max(99, "Maksimal 99 kode per transaksi."),
});

export const convertVouchersSchema = z
  .object({
    items: z
      .array(convertVoucherItemSchema)
      .min(1, "Pilih minimal satu penjualan.")
      .max(50, "Maksimal 50 penjualan sekali konversi."),
    walletId: idSchema,
    clientRequestId: z.string().uuid("Permintaan tidak valid."),
    tanggal: dateSchema,
  })
  .refine(
    (data) => new Set(data.items.map((item) => item.transactionId)).size === data.items.length,
    { message: "Ada penjualan yang dipilih lebih dari sekali.", path: ["items"] },
  )
  .refine(
    (data) =>
      new Set(
        data.items.flatMap((item) => item.kodes.map((kode) => kode.trim().toLowerCase())),
      ).size === data.items.reduce((sum, item) => sum + item.kodes.length, 0),
    { message: "Kode voucher tidak boleh sama.", path: ["items"] },
  )
  .refine((data) => data.items.reduce((sum, item) => sum + item.kodes.length, 0) <= 50, {
    message: "Maksimal 50 voucher sekali konversi.",
    path: ["items"],
  });

export const sellVoucherSchema = z.object({
  id: idSchema,
  walletId: idSchema.optional(),
  tanggal: dateSchema.optional(),
});

export const updateVoucherSchema = z.object({
  id: idSchema,
  kode: kodeVoucherSchema,
  productId: idSchema,
  walletId: idSchema,
  hargaBeli: z
    .number({ error: "Harga beli wajib berupa angka." })
    .int("Harga beli harus bilangan bulat rupiah.")
    .min(0, "Harga beli tidak boleh negatif.")
    .max(1_000_000_000_000, "Harga beli terlalu besar."),
  hargaJual: z
    .number({ error: "Harga jual wajib berupa angka." })
    .int("Harga jual harus bilangan bulat rupiah.")
    .min(0, "Harga jual tidak boleh negatif.")
    .max(1_000_000_000_000, "Harga jual terlalu besar."),
  tanggal: dateSchema,
});

export const previewVoucherConversionSchema = z.object({
  ids: z.array(idSchema).min(1, "Pilih minimal satu penjualan.").max(50),
});

export const voucherFilterSchema = z.object({
  status: z.enum(["available", "sold", "void", "all"]).optional(),
  productId: z.string().optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type ConvertVouchersInput = z.infer<typeof convertVouchersSchema>;
export type SellVoucherInput = z.infer<typeof sellVoucherSchema>;
export type UpdateVoucherInput = z.infer<typeof updateVoucherSchema>;
