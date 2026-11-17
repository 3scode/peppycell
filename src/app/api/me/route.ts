import { requireApiRole } from "@/lib/auth/session";
import { apiError, apiOk, requestIdOf } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  try {
    const user = await requireApiRole("admin", "karyawan", "investor");
    return apiOk(user, requestId);
  } catch (error) {
    return apiError(error, requestId);
  }
}
