import { requireApiRole } from "@/lib/auth/session";
import { getPayout } from "@/lib/data/repository";
import { renderPayoutReceiptPdf } from "@/lib/pdf/payout-receipt";
import { AppError } from "@/lib/errors";
import { apiError, requestIdOf } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = requestIdOf(request);
  try {
    const user = await requireApiRole("admin", "investor");
    const { id } = await params;
    const payout = await getPayout(user, id);
    if (!payout) throw new AppError("NOT_FOUND", "Payout tidak ditemukan.");

    const pdf = await renderPayoutReceiptPdf(payout, {
      id: user.id,
      fullName: user.fullName,
      role: user.role,
    });

    return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="payout-${payout.id}.pdf"`,
        "Content-Length": String(pdf.byteLength),
        "X-Request-ID": requestId,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
