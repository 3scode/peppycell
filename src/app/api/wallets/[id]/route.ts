import { requireApiRole } from "@/lib/auth/session";
import { getWalletDetail } from "@/lib/data/repository";
import { AppError } from "@/lib/errors";
import { apiError, apiOk, requestIdOf } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = requestIdOf(request);
  try {
    const user = await requireApiRole("admin", "investor");
    const { id } = await params;
    const detail = await getWalletDetail(user, id);
    if (!detail) throw new AppError("NOT_FOUND", "Wallet tidak ditemukan.");
    return apiOk(detail, requestId);
  } catch (error) {
    return apiError(error, requestId);
  }
}
