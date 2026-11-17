"use server";

import { withAction } from "@/lib/action-wrapper";
import { createExpense, createSales, deleteTransactions, updateTransaction, voidTransaction } from "@/lib/data/repository";
import {
  deleteTransactionsSchema,
  expenseSchema,
  saleSchema,
  updateTransactionSchema,
  voidSchema,
} from "@/lib/validations/transaction";
import type { TransactionDetail, TransactionSafe } from "@/types/domain";

export const createSaleAction = withAction(
  "createSale",
  ["admin", "karyawan"],
  saleSchema,
  async (input, { user }): Promise<TransactionDetail[]> => await createSales(user, input),
);

export const createExpenseAction = withAction(
  "createExpense",
  ["admin", "karyawan"],
  expenseSchema,
  async (input, { user }): Promise<TransactionDetail> => await createExpense(user, input),
);

export const voidTransactionAction = withAction(
  "voidTransaction",
  ["admin"],
  voidSchema,
  async (input, { user }): Promise<TransactionDetail> =>
    await voidTransaction(user, input.id, input.reason),
);

export const updateTransactionAction = withAction(
  "updateTransaction",
  ["admin"],
  updateTransactionSchema,
  async (input, { user }): Promise<TransactionSafe> => await updateTransaction(user, input),
);

export const deleteTransactionsAction = withAction(
  "deleteTransactions",
  ["admin"],
  deleteTransactionsSchema,
  async (input, { user }): Promise<{ deleted: number }> =>
    await deleteTransactions(user, input.ids),
);
