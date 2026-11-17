import { z } from "zod";
import { requireApiRole } from "@/lib/auth/session";
import { listUsers } from "@/lib/data/repository";
import { apiError, apiOk, paginationMeta, requestIdOf, searchObject } from "@/lib/api";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(80).optional(),
  role: z.enum(["admin", "karyawan", "investor"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  try {
    const user = await requireApiRole("admin");
    const query = querySchema.parse(searchObject(request));
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const q = query.q?.toLowerCase();

    const rows = (await listUsers(user))
      .filter((item) => !item.deletedAt)
      .filter((item) => (query.role ? item.role === query.role : true))
      .filter((item) =>
        q
          ? item.fullName.toLowerCase().includes(q) || item.email.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    const total = rows.length;
    const paged = rows.slice((page - 1) * limit, page * limit);
    return apiOk(paged, requestId, paginationMeta(page, limit, total));
  } catch (error) {
    return apiError(error, requestId);
  }
}
