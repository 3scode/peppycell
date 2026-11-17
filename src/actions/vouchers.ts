"use server";

import { withAction } from "@/lib/action-wrapper";
import {
  convertSalesToVouchers,
  previewVoucherConversion,
  sellVoucher,
  updateVoucher,
} from "@/lib/data/repository";
import {
  convertVouchersSchema,
  previewVoucherConversionSchema,
  sellVoucherSchema,
  updateVoucherSchema,
} from "@/lib/validations/voucher";
import type {
  VoucherConversionResult,
  VoucherPreviewRow,
  VoucherSaleResult,
  VoucherStock,
} from "@/types/domain";

export const previewVoucherConversionAction = withAction(
  "previewVoucherConversion",
  ["admin", "karyawan"],
  previewVoucherConversionSchema,
  async (input, { user }): Promise<VoucherPreviewRow[]> =>
    await previewVoucherConversion(user, input.ids),
);

export const convertSalesToVouchersAction = withAction(
  "convertSalesToVouchers",
  ["admin", "karyawan"],
  convertVouchersSchema,
  async (input, { user }): Promise<VoucherConversionResult> =>
    await convertSalesToVouchers(user, input),
);

export const sellVoucherAction = withAction(
  "sellVoucher",
  ["admin", "karyawan"],
  sellVoucherSchema,
  async (input, { user }): Promise<VoucherSaleResult> => await sellVoucher(user, input),
);

export const updateVoucherAction = withAction(
  "updateVoucher",
  ["admin"],
  updateVoucherSchema,
  async (input, { user }): Promise<VoucherStock> => await updateVoucher(user, input),
);
