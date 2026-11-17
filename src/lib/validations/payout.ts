import { z } from "zod";
import { dateSchema, idempotencySchema, idSchema, pctSchema } from "@/lib/validations/common";

export const allocationsSchema = z
  .object({
    retained: pctSchema,
    admin: pctSchema,
    investor: pctSchema,
    employee: pctSchema,
  })
  .refine(
    (data) => Math.abs(data.retained + data.admin + data.investor + data.employee - 100) < 0.01,
    { message: "Total alokasi harus 100%.", path: ["retained"] },
  );

export const payoutSettingsSchema = allocationsSchema;

export const previewPayoutSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  allocations: allocationsSchema.optional().nullable(),
});

export const executePayoutSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
  walletId: idSchema,
  allocations: allocationsSchema,
  idempotencyKey: idempotencySchema,
  confirmed: z.literal(true, { error: "Konfirmasi wajib dicentang." }),
});
