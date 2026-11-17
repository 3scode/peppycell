"use client";

import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

const WALLET_TABLES = ["wallets"] as const;

/**
 * Auto-update saldo wallet saat ada transaksi, mutasi, penyesuaian, atau
 * perubahan stok voucher dari tab/perangkat lain. Hanya admin yang punya
 * akses SELECT langsung ke tabel wallets; role lain tidak menerima event.
 */
export function useWalletsRealtime(enabled = true): void {
  useRealtimeRefresh("wallet-list-changes", WALLET_TABLES, enabled);
}
