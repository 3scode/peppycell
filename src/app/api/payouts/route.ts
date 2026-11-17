import { z } from "zod";
import { requireApiRole } from "@/lib/auth/session";
import { listPayouts } from "@/lib/data/repository";
import { apiError, apiOk, paginationMeta, requestIdOf, searchObject } from "@/lib/api";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.enum(["processing", "completed", "failed"]).optional(),
  year: z.string().regex(/^\d{4}$/).optional(),
  month: z.string().regex(/^(0[1-9]|1[0-2])$/).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  try {
    const user = await requireApiRole("admin", "investor");
    const query = querySchema.parse(searchObject(request));
    const data = await listPayouts(user, {
      ...query,
      page: query.page ?? 1,
      limit: query.limit ?? 25,
    });
    return apiOk(data.rows, requestId, paginationMeta(data.page, data.limit, data.total));
  } catch (error) {
    return apiError(error, requestId);
  }
}
