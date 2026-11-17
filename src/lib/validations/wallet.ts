import { z } from "zod";
import {
  dateSchema,
  descriptionSchema,
  idSchema,
  idempotencySchema,
  rupiahSchema,
  saldoSchema,
} from "@/lib/validations/common";

const walletType = z.enum(["cash", "bank", "digital"], { error: "Tipe wallet tidak valid." });

export const createWalletSchema = z.object({
  nama: z.string().trim().min(2, "Nama wallet minimal 2 karakter.").max(40, "Nama wallet maksimal 40 karakter."),
  tipe: walletType,
  saldoAwal: saldoSchema,
  isDefault: z.boolean().optional(),
});

export const updateWalletSchema = z.object({
  id: idSchema,
  nama: z.string().trim().min(2, "Nama wallet minimal 2 karakter.").max(40, "Nama wallet maksimal 40 karakter."),
  tipe: walletType,
  saldo: saldoSchema.optional(),
  isDefault: z.boolean().optional(),
});

export const toggleWalletSchema = z.object({
  id: idSchema,
  isActive: z.boolean(),
});

export const deleteWalletSchema = z.object({
  id: idSchema,
});

export const transferSchema = z
  .object({
    fromWalletId: idSchema,
    toWalletId: idSchema,
    tanggal: dateSchema,
    nominal: rupiahSchema,
    description: descriptionSchema,
    clientRequestId: idempotencySchema,
  })
  .refine((data) => data.fromWalletId !== data.toWalletId, {
    message: "Wallet asal dan tujuan tidak boleh sama.",
    path: ["toWalletId"],
  });

export const adjustSchema = z.object({
  walletId: idSchema,
  newBalance: saldoSchema,
  reason: z.string().trim().min(10, "Alasan minimal 10 karakter.").max(200, "Alasan maksimal 200 karakter."),
});
