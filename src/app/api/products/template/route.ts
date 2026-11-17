import { requireApiRole } from "@/lib/auth/session";
import { buildProductTemplateWorkbook } from "@/lib/excel/products";
import { apiError, requestIdOf } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  try {
    await requireApiRole("admin");
    const file = await buildProductTemplateWorkbook();
    const contentType =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    return new Response(new Blob([file], { type: contentType }), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": 'attachment; filename="template-import-produk-peppycell.xlsx"',
        "Content-Length": String(file.byteLength),
        "X-Request-ID": requestId,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
