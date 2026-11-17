import { requireApiRole } from "@/lib/auth/session";
import { listTransactions } from "@/lib/data/repository";
import { transactionFilterSchema } from "@/lib/validations/transaction";
import { apiError, apiOk, paginationMeta, requestIdOf, searchObject } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  try {
    const user = await requireApiRole("admin", "investor");
    const filters = transactionFilterSchema.parse(searchObject(request));
    const data = await listTransactions(user, {
      ...filters,
      page: filters.page ?? 1,
      limit: filters.limit ?? 25,
    });
    return apiOk(data.rows, requestId, paginationMeta(data.page, data.limit, data.total));
  } catch (error) {
    return apiError(error, requestId);
  }
}
