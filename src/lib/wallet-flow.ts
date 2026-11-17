import type { TransactionSafe } from "@/types/domain";

type WalletFlowInput = Pick<
  TransactionSafe,
  "walletName" | "destinationWalletName" | "sourceWalletName"
>;

/**
 * Alur wallet satu transaksi:
 * - penjualan dengan wallet sumber: `Sumber → Tujuan`
 * - transfer: `Asal → Tujuan`
 * - lainnya: nama wallet saja
 */
export function walletFlow(tx: WalletFlowInput): string {
  const wallet = tx.walletName ?? "—";
  if (tx.sourceWalletName && tx.sourceWalletName !== wallet) {
    return `${tx.sourceWalletName} → ${wallet}`;
  }
  if (tx.destinationWalletName) {
    return `${wallet} → ${tx.destinationWalletName}`;
  }
  return wallet;
}
