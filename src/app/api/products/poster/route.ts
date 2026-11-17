import { requireApiRole } from "@/lib/auth/session";
import { listAllProducts } from "@/lib/data/repository";
import { renderPricePoster } from "@/lib/poster/price-poster";
import { apiError, requestIdOf } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  try {
    const user = await requireApiRole("admin", "karyawan");
    const url = new URL(request.url);
    const ids = new Set(
      (url.searchParams.get("ids") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );

    const products = (await listAllProducts(user, {})).filter(
      (product) => product.isActive && (ids.size === 0 || ids.has(product.id)),
    );

    if (products.length === 0) {
      return Response.json(
        {
          success: false,
          data: null,
          error: {
            code: "VALIDATION_ERROR",
            message: "Tidak ada produk aktif untuk dibuatkan poster.",
          },
          meta: null,
        },
        { status: 422 },
      );
    }

    const title = url.searchParams.get("title") ?? undefined;
    const subtitle = url.searchParams.get("subtitle") ?? undefined;
    const footerNote = url.searchParams.get("note") ?? undefined;
    const footerContact = url.searchParams.get("contact") ?? undefined;

    return await renderPricePoster(
      products.map((product) => ({
        nama: product.nama,
        operator: product.operator,
        hargaJual: product.hargaJual,
      })),
      { title, subtitle, footerNote, footerContact },
      "poster-harga-peppycell.png",
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
