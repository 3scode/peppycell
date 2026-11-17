export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Tanggal hari ini di WIB sebagai YYYY-MM-DD. */
export function todayWib(): string {
  return new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** ISO timestamp untuk jam tertentu di WIB. */
export function isoAtWib(date: string, hour = 12, minute = 0): string {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+07:00`).toISOString();
}

/** Awal hari ini WIB dalam ISO UTC. */
export function startOfTodayWibIso(): string {
  return new Date(`${todayWib()}T00:00:00+07:00`).toISOString();
}

/** Tambah hari pada string YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Senin–Minggu yang memuat tanggal tertentu. */
export function weekBounds(date: string): { start: string; end: string } {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = Minggu
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = addDays(date, diffToMonday);
  return { start, end: addDays(start, 6) };
}

export function isMonday(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 1;
}

export function isClosedPeriod(endDate: string): boolean {
  return endDate < todayWib();
}

export function assertValidPeriod(start: string, end: string): void {
  if (!isMonday(start) || end !== addDays(start, 6)) {
    const error = new Error("Periode harus Senin–Minggu (7 hari).");
    (error as Error & { code?: string }).code = "VALIDATION_ERROR";
    throw error;
  }
}

export function lastClosedWeek(): { start: string; end: string } {
  const current = weekBounds(todayWib());
  return weekBounds(addDays(current.start, -7));
}

export function formatDateId(date: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${date}T00:00:00+07:00`));
}

export function formatDateTimeId(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

export function formatPeriod(start: string, end: string): string {
  return `${formatDateId(start)} – ${formatDateId(end)}`;
}

export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}
