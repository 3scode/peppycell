import { z } from "zod";
import { requireApiRole } from "@/lib/auth/session";
import { getDashboardMetrics } from "@/lib/data/repository";
import { apiError, apiOk, requestIdOf, searchObject } from "@/lib/api";

export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((value) => !value.start || !value.end || value.start <= value.end, {
    message: "Tanggal mulai harus sebelum tanggal akhir.",
  });

export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  try {
    const user = await requireApiRole("admin", "karyawan", "investor");
    const { start, end } = querySchema.parse(searchObject(request));
    const metrics = await getDashboardMetrics(user, start, end);
    if (user.role === "karyawan") {
      return apiOk(
        {
          role: metrics.role,
          period: metrics.period,
          myTransactionCountToday: metrics.myTransactionCountToday ?? 0,
          mySalesToday: metrics.mySalesToday ?? 0,
          myProductsSoldToday: metrics.myProductsSoldToday ?? 0,
          mySeries7d: metrics.series,
          recentTransactions: metrics.recentTransactions,
        },
        requestId,
      );
    }
    return apiOk(metrics, requestId);
  } catch (error) {
    return apiError(error, requestId);
  }
}
