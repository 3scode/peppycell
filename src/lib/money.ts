export type AllocationPart = { key: string; pct: number };

/**
 * Bagi net profit ke 4 kategori payout. Kategori non-retained di-floor,
 * retained menyerap seluruh sisa pembulatan — sama persis dengan execute_payout.
 */
export function allocateRupiah(total: number, parts: AllocationPart[]): Record<string, number> {
  if (!Number.isInteger(total) || total < 0) throw new Error("total harus integer >= 0");
  if (parts.some((p) => !Number.isFinite(p.pct) || p.pct < 0 || p.pct > 100)) {
    throw new Error("persentase harus 0–100");
  }
  const sumPct = parts.reduce((s, p) => s + p.pct, 0);
  if (Math.abs(sumPct - 100) > 0.01) throw new Error("total persentase harus 100");
  if (!parts.some((p) => p.key === "retained")) throw new Error("alokasi wajib punya key retained");

  const result: Record<string, number> = {};
  let allocated = 0;

  for (const p of parts) {
    if (p.key === "retained") continue;
    const amount = Math.floor((total * p.pct) / 100);
    result[p.key] = amount;
    allocated += amount;
  }

  result.retained = total - allocated;
  return result;
}

/** Bagi pool ke penerima berbobot; bobot 0 semua = bagi rata. */
export function distributePool(
  pool: number,
  recipients: { id: string; weight: number }[],
): Record<string, number> {
  if (!Number.isInteger(pool) || pool < 0) throw new Error("pool harus integer >= 0");
  if (recipients.length === 0) return {};
  if (recipients.some((r) => r.weight < 0)) throw new Error("bobot tidak boleh negatif");

  const totalWeight = recipients.reduce((s, r) => s + r.weight, 0);
  const weights =
    totalWeight === 0 ? recipients.map((r) => ({ ...r, weight: 1 })) : recipients;
  const effectiveWeight = totalWeight === 0 ? recipients.length : totalWeight;

  const raw = weights.map((r) => ({
    id: r.id,
    exact: (pool * r.weight) / effectiveWeight,
  }));

  const result: Record<string, number> = {};
  let allocated = 0;

  for (const r of raw) {
    const floor = Math.floor(r.exact);
    result[r.id] = floor;
    allocated += floor;
  }

  let remainder = pool - allocated;
  const order = [...raw].sort((a, b) => {
    const frac = (b.exact % 1) - (a.exact % 1);
    return frac !== 0 ? frac : a.id.localeCompare(b.id);
  });

  for (let i = 0; remainder > 0; i = (i + 1) % order.length, remainder--) {
    result[order[i]!.id] += 1;
  }
  return result;
}

export function formatRupiah(value: number, opts?: { compact?: boolean }): string {
  if (!Number.isFinite(value)) return "Rp 0";
  if (opts?.compact) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return `Rp ${(value / 1_000_000_000).toFixed(1).replace(".", ",")} M`;
    if (abs >= 1_000_000) return `Rp ${(value / 1_000_000).toFixed(1).replace(".", ",")} jt`;
    if (abs >= 1_000) return `Rp ${(value / 1_000).toFixed(0)} rb`;
  }
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function parseRupiahInput(input: string): number {
  const digits = input.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

export function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}
