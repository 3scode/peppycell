"use client";

import { useRealtimeRefresh } from "@/lib/hooks/use-realtime-refresh";

const PRODUCT_TABLES = ["products", "product_prices"] as const;

/**
 * Menyegarkan data produk/harga di halaman saat ada perubahan dari tab atau
 * perangkat lain. Event realtime hanya memicu router.refresh(), jadi state
 * form (keranjang, tanggal, pencarian) tetap utuh.
 */
export function useProductCatalogRealtime(): void {
  useRealtimeRefresh("product-catalog-changes", PRODUCT_TABLES);
}
