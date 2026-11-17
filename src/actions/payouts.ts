"use server";

import { withAction } from "@/lib/action-wrapper";
import {
  executePayout,
  previewPayout,
  updatePayoutSettings,
} from "@/lib/data/repository";
import {
  executePayoutSchema,
  payoutSettingsSchema,
  previewPayoutSchema,
} from "@/lib/validations/payout";
import type { PayoutPreview, PayoutRecord, PayoutSettings } from "@/types/domain";

export const updatePayoutSettingsAction = withAction(
  "updatePayoutSettings",
  ["admin"],
  payoutSettingsSchema,
  async (input, { user }): Promise<PayoutSettings> =>
    await updatePayoutSettings(user, {
      retainedPct: input.retained,
      adminPct: input.admin,
      investorPct: input.investor,
      employeePct: input.employee,
      updatedAt: "",
    }),
);

export const previewPayoutAction = withAction(
  "previewPayout",
  ["admin"],
  previewPayoutSchema,
  async (input, { user }): Promise<PayoutPreview> =>
    await previewPayout(user, input.startDate, input.endDate, input.allocations),
);

export const executePayoutAction = withAction(
  "executePayout",
  ["admin"],
  executePayoutSchema,
  async (input, { user }): Promise<PayoutRecord> =>
    await executePayout(user, {
      startDate: input.startDate,
      endDate: input.endDate,
      walletId: input.walletId,
      allocations: input.allocations,
      idempotencyKey: input.idempotencyKey,
    }),
);
