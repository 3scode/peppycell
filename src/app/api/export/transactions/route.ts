import { z } from "zod";
import { requireApiRole } from "@/lib/auth/session";
import { listTransactions } from "@/lib/data/repository";
import { todayWib } from "@/lib/period";
import { apiError, requestIdOf, searchObject } from "@/lib/api";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type: z.enum(["income", "expense", "transfer", "payout"]).optional(),
});

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r;]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export async function GET(request: Request) {
  const requestId = requestIdOf(request);
  try {
    const user = await requireApiRole("admin");
    const query = querySchema.parse(searchObject(request));

    const all: Awaited<ReturnType<typeof listTransactions>>["rows"] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const result = await listTransactions(user, {
        ...query,
        page,
        limit: 100,
      });
      all.push(...result.rows);
      totalPages = result.totalPages;
      page += 1;
    } while (page <= totalPages && page <= 100);

    const header = [
      "ID",
      "Tanggal",
      "Tipe",
      "Kategori",
      "Deskripsi",
      "Produk",
      "Qty",
      "Nominal",
      "Wallet",
      "Wallet Tujuan",
      "Wallet Sumber",
      "Dicatat Oleh",
      "Status",
      "Reversal Of",
    ];
    const lines = [header.map(csvCell).join(",")];
    for (const row of all) {
      lines.push(
        [
          row.id,
          row.tanggal,
          row.tipe,
          row.kategori,
          row.description,
          row.productName ?? "",
          row.qty ?? "",
          row.nominal,
          row.walletName ?? "",
          row.destinationWalletName ?? "",
          row.sourceWalletName ?? "",
          row.userName ?? "",
          row.status,
          row.reversalOf ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }

    const csv = `\uFEFF${lines.join("\r\n")}\r\n`;
    const filename = `transaksi-${query.from ?? "awal"}-${query.to ?? todayWib()}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Request-ID": requestId,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
