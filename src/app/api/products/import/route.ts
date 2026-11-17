import { requireApiRole } from "@/lib/auth/session";
import { listAllProducts, upsertProduct } from "@/lib/data/repository";
import { parseProductsWorkbook, PRODUCT_IMPORT_MAX_BYTES } from "@/lib/excel/products";
import { AppError } from "@/lib/errors";
import { apiError, apiOk, requestIdOf } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = requestIdOf(request);
  try {
    const user = await requireApiRole("admin");
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {
      throw new AppError("VALIDATION_ERROR", "Pilih file Excel (.xls/.xlsx) yang ingin diimpor.");
    }
    if (file.size > PRODUCT_IMPORT_MAX_BYTES) {
      throw new AppError("VALIDATION_ERROR", "Ukuran file maksimal 2 MB.");
    }
    if (!/\.(xls|xlsx|xlsm)$/i.test(file.name)) {
      throw new AppError("VALIDATION_ERROR", "Format file harus .xls, .xlsx, atau .xlsm.");
    }

    const buffer = await file.arrayBuffer();
    const parsed = await parseProductsWorkbook(buffer);

    if (parsed.rows.length === 0 && parsed.errors.length === 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Tidak ada data produk di file. Isi data mulai baris 3 sesuai template.",
      );
    }

    const seenNames = new Set<string>();
    const rows: typeof parsed.rows = [];
    let skipped = 0;

    for (const row of parsed.rows) {
      const key = row.nama.trim().toLowerCase();
      if (seenNames.has(key)) {
        skipped += 1;
        continue;
      }
      seenNames.add(key);
      rows.push(row);
    }

    if (form.get("preview") === "1") {
      return apiOk(
        {
          preview: true,
          rows,
          skipped,
          total: parsed.rows.length + parsed.errors.length,
          errors: parsed.errors.slice(0, 25),
          truncated: parsed.errors.length > 25,
        },
        requestId,
      );
    }

    const existingByName = new Map(
      (await listAllProducts(user)).map((product) => [product.nama.trim().toLowerCase(), product]),
    );
    const errors = [...parsed.errors];
    let created = 0;
    let updated = 0;

    for (const row of rows) {
      const key = row.nama.trim().toLowerCase();
      const existing = existingByName.get(key);
      try {
        await upsertProduct(user, {
          id: existing?.id,
          nama: row.nama,
          operator: row.operator,
          hargaBeli: row.hargaBeli,
          hargaJual: row.hargaJual,
          isActive: row.isActive,
        });
        if (existing) {
          updated += 1;
        } else {
          created += 1;
        }
      } catch (error) {
        errors.push({
          rowNumber: row.rowNumber,
          nama: row.nama,
          message: error instanceof Error ? error.message : "Baris gagal disimpan.",
        });
      }
    }

    errors.sort((a, b) => a.rowNumber - b.rowNumber);

    return apiOk(
      {
        created,
        updated,
        skipped,
        failed: errors.length,
        total: parsed.rows.length + parsed.errors.length,
        errors: errors.slice(0, 25),
        truncated: errors.length > 25,
      },
      requestId,
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
