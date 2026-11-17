import { z } from "zod";
import { requireApiRole } from "@/lib/auth/session";
import { listProducts } from "@/lib/data/repository";
import { apiError, apiOk, paginationMeta, requestIdOf, searchObject } from "@/lib/api";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(80).optional(),
  operator: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  try {
    const user = await requireApiRole("admin", "karyawan");
    const query = querySchema.parse(searchObject(request));
    const data = await listProducts(user, {
      ...query,
      page: query.page ?? 1,
      limit: query.limit ?? 25,
    });
    return apiOk(data.rows, requestId, paginationMeta(data.page, data.limit, data.total));
  } catch (error) {
    return apiError(error, requestId);
  }
}
