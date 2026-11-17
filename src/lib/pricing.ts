import type { ProductPrice } from "@/types/domain";

export type PriceChangeMode = "percent" | "nominal";
export type PriceRounding = "none" | "100" | "500" | "1000";

export interface PricePoint {
  effectiveFrom: string;
  hargaBeli?: number;
  hargaJual: number;
}

/**
 * Harga yang berlaku pada tanggal tertentu (YYYY-MM-DD, WIB).
 * Jika belum ada riwayat sama sekali, pakai harga master sebagai fallback.
 */
export function priceAtDate(
  history: PricePoint[] | undefined,
  fallback: { hargaBeli?: number; hargaJual: number },
  date: string,
): { hargaBeli: number; hargaJual: number } {
  if (!history || history.length === 0) {
    return { hargaBeli: fallback.hargaBeli ?? 0, hargaJual: fallback.hargaJual };
  }

  let best: PricePoint | null = null;
  for (const point of history) {
    if (point.effectiveFrom > date) continue;
    if (!best || point.effectiveFrom >= best.effectiveFrom) best = point;
  }
  if (best) {
    return { hargaBeli: best.hargaBeli ?? fallback.hargaBeli ?? 0, hargaJual: best.hargaJual };
  }

  // Tanggal transaksi lebih lama dari riwayat pertama: pakai harga paling awal.
  let earliest = history[0]!;
  for (const point of history) {
    if (point.effectiveFrom < earliest.effectiveFrom) earliest = point;
  }
  return { hargaBeli: earliest.hargaBeli ?? fallback.hargaBeli ?? 0, hargaJual: earliest.hargaJual };
}

export function applyPriceChange(
  base: number,
  value: number,
  mode: PriceChangeMode,
  rounding: PriceRounding,
): number {
  if (!Number.isFinite(base) || base < 0) return 0;
  if (!Number.isFinite(value) || value <= 0) return base;
  const raw = mode === "percent" ? base * (1 + value / 100) : base + value;
  const step = rounding === "none" ? 0 : Number(rounding);
  const rounded = step > 0 ? Math.ceil(raw / step) * step : Math.round(raw);
  return Math.max(0, rounded);
}

export function pricePointsOf(history: ProductPrice[], productId: string): ProductPrice[] {
  return history.filter((entry) => entry.productId === productId);
}
