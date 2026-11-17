import { requireApiRole } from "@/lib/auth/session";
import { getPayout } from "@/lib/data/repository";
import { AppError } from "@/lib/errors";
import { apiError, apiOk, requestIdOf } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = requestIdOf(request);
  try {
    const user = await requireApiRole("admin");
    const { id } = await params;
    const payout = await getPayout(user, id);
    if (!payout) throw new AppError("NOT_FOUND", "Payout tidak ditemukan.");
    return apiOk(
      {
        id: payout.id,
        status: payout.status,
        completedAt: payout.completedAt ?? null,
        failedReason: null,
      },
      requestId,
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
