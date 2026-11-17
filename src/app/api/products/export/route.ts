import { z } from "zod";
import { requireApiRole } from "@/lib/auth/session";
import { listAllProducts } from "@/lib/data/repository";
import { buildProductsWorkbook } from "@/lib/excel/products";
import { todayWib } from "@/lib/period";
import { apiError, requestIdOf, searchObject } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(80).optional(),
  operator: z.string().trim().max(40).optional(),
});

export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  try {
    const user = await requireApiRole("admin");
    const query = querySchema.parse(searchObject(request));
    const products = await listAllProducts(user, query);

    const filterLabel = [
      query.q ? `Pencarian: "${query.q}"` : null,
      query.operator ? `Operator: ${query.operator}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const file = await buildProductsWorkbook(products, {
      downloadedBy: user.fullName,
      filterLabel: filterLabel || undefined,
    });
    const filename = `produk-peppycell-${todayWib()}.xlsx`;
    const contentType =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    return new Response(new Blob([file], { type: contentType }), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(file.byteLength),
        "X-Request-ID": requestId,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
