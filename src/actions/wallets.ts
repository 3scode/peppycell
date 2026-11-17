"use server";

import { withAction } from "@/lib/action-wrapper";
import {
  applyWalletAdjustment,
  createWallet,
  deleteWallet,
  toggleWallet,
  transferWallet,
  updateWallet,
} from "@/lib/data/repository";
import {
  adjustSchema,
  createWalletSchema,
  deleteWalletSchema,
  toggleWalletSchema,
  transferSchema,
  updateWalletSchema,
} from "@/lib/validations/wallet";
import type { TransactionSafe, Wallet } from "@/types/domain";

export const createWalletAction = withAction(
  "createWallet",
  ["admin"],
  createWalletSchema,
  async (input, { user }): Promise<Wallet> => await createWallet(user, input),
);

export const updateWalletAction = withAction(
  "updateWallet",
  ["admin"],
  updateWalletSchema,
  async (input, { user }): Promise<Wallet> => await updateWallet(user, input),
);

export const toggleWalletAction = withAction(
  "toggleWallet",
  ["admin"],
  toggleWalletSchema,
  async (input, { user }): Promise<Wallet> => await toggleWallet(user, input.id, input.isActive),
);

export const deleteWalletAction = withAction(
  "deleteWallet",
  ["admin"],
  deleteWalletSchema,
  async (input, { user }): Promise<{ deleted: true; defaultWalletName: string | null }> =>
    await deleteWallet(user, input.id),
);

export const transferWalletAction = withAction(
  "transferWallet",
  ["admin"],
  transferSchema,
  async (input, { user }): Promise<TransactionSafe> => await transferWallet(user, input),
);

export const adjustWalletAction = withAction(
  "adjustWallet",
  ["admin"],
  adjustSchema,
  async (input, { user }): Promise<Wallet> =>
    await applyWalletAdjustment(user, input.walletId, input.newBalance, input.reason),
);
