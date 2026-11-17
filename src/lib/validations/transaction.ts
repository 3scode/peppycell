import { z } from "zod";
import {
  descriptionSchema,
  idSchema,
  idempotencySchema,
  optionalDescriptionSchema,
  qtySchema,
  reasonSchema,
  rupiahSchema,
} from "@/lib/validations/common";

const transactionDateSchema = z
  .string()
  .trim()
  .min(1, "Tanggal wajib diisi.")
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "Tanggal tidak valid.");

export const saleItemSchema = z.object({
  productId: idSchema,
  qty: qtySchema,
});

export const saleSchema = z.object({
  tanggal: transactionDateSchema,
  items: z
    .array(saleItemSchema)
    .min(1, "Pilih minimal satu produk.")
    .max(20, "Maksimal 20 produk sekali catat.")
    .refine(
      (items) => new Set(items.map((item) => item.productId)).size === items.length,
      "Produk yang sama tidak boleh dipilih dua kali.",
    ),
  description: optionalDescriptionSchema,
  clientRequestId: idempotencySchema,
  walletId: idSchema.optional(),
  sourceWalletId: idSchema.optional(),
  sourceCost: z.number().int().nonnegative().optional(),
});

export const expenseCategories = ["operasional", "gaji", "deviden", "lainnya"] as const;

export const expenseSchema = z.object({
  tanggal: transactionDateSchema,
  kategori: z.enum(expenseCategories, { error: "Kategori tidak valid." }),
  nominal: rupiahSchema,
  walletId: idSchema.optional(),
  description: descriptionSchema,
  clientRequestId: idempotencySchema.optional(),
});

export const voidSchema = z.object({
  id: idSchema,
  reason: reasonSchema,
});

export const updateTransactionSchema = z.object({
  id: idSchema,
  tanggal: transactionDateSchema,
  description: z.string().trim().max(200, "Keterangan maksimal 200 karakter.").optional(),
  productId: idSchema.optional(),
  qty: qtySchema.optional(),
  nominal: rupiahSchema.optional(),
  kategori: z.enum(expenseCategories).optional(),
  fromWalletId: idSchema.optional(),
  toWalletId: idSchema.optional(),
  sourceWalletId: z.union([idSchema, z.null()]).optional(),
  /** true = wallet sumber memang diubah (termasuk direset ke "tanpa wallet sumber"). */
  sourceWalletChanged: z.boolean().optional(),
  sourceCost: z.number().int().nonnegative().optional(),
}).refine(
  (data) => !data.toWalletId || Boolean(data.fromWalletId),
  { message: "Pilih wallet asal dan tujuan.", path: ["toWalletId"] },
).refine(
  (data) => !data.fromWalletId || data.fromWalletId !== data.toWalletId,
  { message: "Wallet asal dan tujuan tidak boleh sama.", path: ["toWalletId"] },
);

export const deleteTransactionsSchema = z.object({
  ids: z
    .array(idSchema)
    .min(1, "Pilih minimal satu transaksi.")
    .max(100, "Maksimal 100 transaksi sekali hapus."),
});

export const transactionFilterSchema = z.object({
  type: z.enum(["income", "expense", "transfer", "payout"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  walletId: z.string().optional(),
  userId: z.string().optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
