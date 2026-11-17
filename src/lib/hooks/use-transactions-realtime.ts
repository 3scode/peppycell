"use client";

import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

const TRANSACTION_TABLES = ["transactions", "wallets", "products", "users"] as const;

/**
 * Auto-update daftar transaksi. Hanya admin yang punya akses SELECT langsung
 * ke tabel-tabel ini; role lain tidak akan menerima event karena RLS.
 */
export function useTransactionsRealtime(enabled = true): void {
  useRealtimeRefresh("transaction-list-changes", TRANSACTION_TABLES, enabled);
}
