import "server-only";

import ExcelJS from "exceljs";
import { AppError } from "@/lib/errors";
import { formatDateTimeId } from "@/lib/period";
import { productSchema } from "@/lib/validations/product";
import type { Product } from "@/types/domain";

export const PRODUCT_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const PRODUCT_IMPORT_MAX_ROWS = 1_000;

const HEADERS = [
  "Nama Produk",
  "Operator",
  "Harga Beli",
  "Harga Jual",
  "Profit",
  "Margin (%)",
  "Status",
] as const;

/** Kolom 1-based. Profit & margin dihitung otomatis, bukan input manual. */
const COLUMN = {
  nama: 1,
  operator: 2,
  hargaBeli: 3,
  hargaJual: 4,
  profit: 5,
  marginPct: 6,
  status: 7,
} as const;

const MONEY_COLUMNS: number[] = [COLUMN.hargaBeli, COLUMN.hargaJual, COLUMN.profit];
const RUPIAH_FORMAT = '"Rp"#,##0;[Red]-"Rp"#,##0';
const PERCENT_FORMAT = '0.0"%"';

/** Baris 1 = judul, baris 2 = header, baris 3+ = data — mengikuti format laporan Excel lama. */
const HEADER_ROW = 2;
const DATA_START_ROW = HEADER_ROW + 1;
const HEADER_SEARCH_LIMIT = 20;
const MAX_MATRIX_ROWS = 5_000;
const MAX_MATRIX_COLUMNS = 50;

const COLORS = {
  brand: "FF4F46E5",
  brandSoft: "FFEEF2FF",
  text: "FF101828",
  muted: "FF667085",
  border: "FFEAECF0",
  zebra: "FFF9FAFB",
  successSoft: "FFECFDF3",
  successText: "FF027A48",
  errorSoft: "FFFEF3F2",
  errorText: "FFB42318",
  white: "FFFFFFFF",
} as const;

const COLUMN_WIDTHS = [38, 18, 16, 16, 16, 14, 12];

type WorksheetWithDataValidations = ExcelJS.Worksheet & {
  dataValidations: {
    add(range: string, validation: ExcelJS.DataValidation): void;
  };
};

function border(): Partial<ExcelJS.Borders> {
  const edge = { style: "thin" as const, color: { argb: COLORS.border } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function applyHeaderStyle(cell: ExcelJS.Cell, align: "left" | "right" | "center") {
  cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.white } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.brand } };
  cell.alignment = { vertical: "middle", horizontal: align };
  cell.border = border();
}

function configureSheet(worksheet: ExcelJS.Worksheet, title: string) {
  worksheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));
  worksheet.properties.defaultRowHeight = 18;
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  worksheet.views = [{ state: "frozen", ySplit: HEADER_ROW }];

  worksheet.mergeCells(1, 1, 1, HEADERS.length);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: COLORS.text } };
  titleCell.alignment = { vertical: "middle" };
  worksheet.getRow(1).height = 24;

  const headerRow = worksheet.getRow(HEADER_ROW);
  HEADERS.forEach((label, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label;
    applyHeaderStyle(
      cell,
      MONEY_COLUMNS.includes(index + 1)
        ? "right"
        : index + 1 === COLUMN.status
          ? "center"
          : "left",
    );
  });
  headerRow.height = 22;
}

function marginOf(product: Pick<Product, "hargaBeli" | "hargaJual">) {
  const cost = product.hargaBeli ?? 0;
  const profit = product.hargaJual - cost;
  const pct = product.hargaJual > 0 ? (profit / product.hargaJual) * 100 : 0;
  return { profit, pct };
}

function writeProductRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  product: Pick<Product, "nama" | "operator" | "hargaBeli" | "hargaJual" | "isActive">,
  zebra: boolean,
) {
  const row = worksheet.getRow(rowNumber);
  const { profit, pct } = marginOf(product);
  const values: Array<string | number> = [
    product.nama,
    product.operator,
    product.hargaBeli ?? 0,
    product.hargaJual,
    profit,
    Math.round(pct * 10) / 10,
    product.isActive ? "Aktif" : "Nonaktif",
  ];

  values.forEach((value, index) => {
    const column = index + 1;
    const cell = row.getCell(column);
    cell.value = value;
    cell.font = { name: "Calibri", size: 10, color: { argb: COLORS.text } };
    cell.border = border();
    cell.alignment = {
      vertical: "middle",
      horizontal: MONEY_COLUMNS.includes(column)
        ? "right"
        : column === COLUMN.status
          ? "center"
          : "left",
    };
    if (MONEY_COLUMNS.includes(column)) cell.numFmt = RUPIAH_FORMAT;
    if (column === COLUMN.marginPct) cell.numFmt = PERCENT_FORMAT;
    if (column === COLUMN.profit && profit < 0) {
      cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.errorText } };
    }
    if (zebra && column !== COLUMN.status) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.zebra } };
    }
  });

  const statusCell = row.getCell(COLUMN.status);
  statusCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: product.isActive ? COLORS.successSoft : COLORS.errorSoft },
  };
  statusCell.font = {
    name: "Calibri",
    size: 10,
    bold: true,
    color: { argb: product.isActive ? COLORS.successText : COLORS.errorText },
  };

  row.height = 18;
}

function addInfoSheet(
  workbook: ExcelJS.Workbook,
  meta: { downloadedBy: string; filterLabel?: string; productCount: number },
) {
  const info = workbook.addWorksheet("Info");
  info.columns = [{ width: 24 }, { width: 90 }];

  info.mergeCells(1, 1, 1, 2);
  const title = info.getCell(1, 1);
  title.value = "Informasi File";
  title.font = { name: "Calibri", size: 14, bold: true, color: { argb: COLORS.text } };
  title.alignment = { vertical: "middle" };
  info.getRow(1).height = 24;

  const rows: Array<[string, string]> = [
    ["Diunduh", `${formatDateTimeId(new Date().toISOString())} WIB`],
    ["Oleh", meta.downloadedBy],
    ["Jumlah produk", String(meta.productCount)],
    ...(meta.filterLabel ? ([["Filter", meta.filterLabel]] as Array<[string, string]>) : []),
    [
      "Format",
      "Baris 1 adalah judul, baris 2 adalah header, dan data dimulai baris 3. File ini bisa diimpor kembali lewat tombol Import Produk.",
    ],
    [
      "Pencocokan",
      "Produk dicocokkan berdasarkan nama: nama yang sama akan diperbarui, nama baru akan ditambahkan.",
    ],
  ];

  rows.forEach(([label, value], index) => {
    const row = info.getRow(3 + index);
    row.getCell(1).value = label;
    row.getCell(1).font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.text } };
    row.getCell(2).value = value;
    row.getCell(2).font = { name: "Calibri", size: 10, color: { argb: COLORS.text } };
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = border();
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    row.height = 20;
  });
}

/** Workbook daftar produk — format kolom sama dengan template agar bisa diimpor ulang. */
export async function buildProductsWorkbook(
  products: Product[],
  meta: { downloadedBy: string; filterLabel?: string },
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PeppyCell";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Produk");
  configureSheet(worksheet, "Daftar Produk PeppyCell");

  products.forEach((product, index) => {
    writeProductRow(worksheet, DATA_START_ROW + index, product, index % 2 === 1);
  });

  const lastDataRow = DATA_START_ROW + products.length - 1;
  if (products.length > 0) {
    worksheet.autoFilter = {
      from: { row: HEADER_ROW, column: 1 },
      to: { row: lastDataRow, column: HEADERS.length },
    };
  }

  const totalRowNumber = Math.max(lastDataRow + 1, DATA_START_ROW);
  const totalRow = worksheet.getRow(totalRowNumber);
  worksheet.mergeCells(totalRowNumber, 1, totalRowNumber, 2);
  totalRow.getCell(1).value = `TOTAL · ${products.length} produk`;
  totalRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
  const totalBeli = products.reduce((sum, product) => sum + (product.hargaBeli ?? 0), 0);
  const totalJual = products.reduce((sum, product) => sum + product.hargaJual, 0);
  const totalProfit = totalJual - totalBeli;
  totalRow.getCell(COLUMN.hargaBeli).value = totalBeli;
  totalRow.getCell(COLUMN.hargaJual).value = totalJual;
  totalRow.getCell(COLUMN.profit).value = totalProfit;
  totalRow.getCell(COLUMN.marginPct).value =
    totalJual > 0 ? Math.round((totalProfit / totalJual) * 1000) / 10 : 0;
  for (let column = 1; column <= HEADERS.length; column += 1) {
    const cell = totalRow.getCell(column);
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.text } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.brandSoft } };
    cell.border = border();
    cell.alignment = {
      vertical: "middle",
      horizontal: MONEY_COLUMNS.includes(column) ? "right" : "center",
    };
    if (MONEY_COLUMNS.includes(column)) cell.numFmt = RUPIAH_FORMAT;
    if (column === COLUMN.marginPct) cell.numFmt = PERCENT_FORMAT;
  }
  totalRow.height = 20;

  addInfoSheet(workbook, { ...meta, productCount: products.length });

  return workbook.xlsx.writeBuffer();
}

/** Template import dengan header, validasi status, dan sheet petunjuk. */
export async function buildProductTemplateWorkbook(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PeppyCell";
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const worksheet = workbook.addWorksheet("Template Produk");
  configureSheet(worksheet, "Template Import Produk PeppyCell");

  for (let rowNumber = DATA_START_ROW; rowNumber < DATA_START_ROW + 200; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let column = 1; column <= HEADERS.length; column += 1) {
      const cell = row.getCell(column);
      cell.border = border();
      if (MONEY_COLUMNS.includes(column)) cell.numFmt = RUPIAH_FORMAT;
      if (column === COLUMN.marginPct) cell.numFmt = PERCENT_FORMAT;
    }

    // Profit & margin otomatis mengikuti Harga Beli (C) dan Harga Jual (D).
    row.getCell(COLUMN.profit).value = {
      formula: `IF(OR(C${rowNumber}="",D${rowNumber}=""),"",D${rowNumber}-C${rowNumber})`,
    };
    row.getCell(COLUMN.marginPct).value = {
      formula: `IF(OR(C${rowNumber}="",D${rowNumber}="",D${rowNumber}=0),"",(D${rowNumber}-C${rowNumber})/D${rowNumber})`,
    };
    for (const column of [COLUMN.profit, COLUMN.marginPct]) {
      row.getCell(column).font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.muted } };
    }
  }

  (worksheet as WorksheetWithDataValidations).dataValidations.add(
    `G${DATA_START_ROW}:G${DATA_START_ROW + 199}`,
    {
      type: "list",
      allowBlank: true,
      formulae: ['"Aktif,Nonaktif"'],
      showErrorMessage: true,
      errorTitle: "Status tidak valid",
      error: "Pilih Aktif atau Nonaktif.",
    },
  );

  const guide = workbook.addWorksheet("Petunjuk");
  guide.columns = [{ width: 22 }, { width: 12 }, { width: 72 }];
  guide.getCell(1, 1).value = "Petunjuk Import Produk";
  guide.getCell(1, 1).font = { name: "Calibri", size: 14, bold: true, color: { argb: COLORS.text } };
  guide.getRow(1).height = 24;

  guide.getCell(3, 1).value = "Kolom";
  guide.getCell(3, 2).value = "Wajib";
  guide.getCell(3, 3).value = "Keterangan";
  for (let column = 1; column <= 3; column += 1) {
    applyHeaderStyle(guide.getCell(3, column), "left");
  }

  const columns: Array<[string, string, string]> = [
    [
      "Nama Produk",
      "Ya",
      "Nama unik produk, 2–60 karakter. Nama yang sudah ada akan diperbarui. Bisa juga memakai kolom Voucher dari laporan lama.",
    ],
    [
      "Operator",
      "Ya",
      "Contoh: Telkomsel, Indosat, XL, Tri, Smartfren, PLN, Game. Bisa juga memakai kolom Provider.",
    ],
    ["Harga Beli", "Ya", "Angka rupiah tanpa Rp/titik/koma. Contoh: 57000."],
    ["Harga Jual", "Ya", "Harus lebih besar atau sama dengan harga beli. Contoh: 65000."],
    [
      "Profit",
      "Tidak",
      "Dihitung otomatis dari Harga Jual − Harga Beli lewat rumus Excel. Tidak perlu diisi.",
    ],
    [
      "Margin (%)",
      "Tidak",
      "Dihitung otomatis dari Profit ÷ Harga Jual. Tidak perlu diisi dan tidak dipakai saat import.",
    ],
    [
      "Status",
      "Tidak",
      "Aktif atau Nonaktif. Kosong dianggap Aktif. Nilai Sukses/Berhasil juga dianggap Aktif.",
    ],
  ];
  columns.forEach(([name, required, note], index) => {
    const row = guide.getRow(4 + index);
    row.getCell(1).value = name;
    row.getCell(2).value = required;
    row.getCell(3).value = note;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Calibri", size: 10, color: { argb: COLORS.text } };
      cell.border = border();
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    row.height = 22;
  });

  const notes = [
    "1. Isi sheet \"Template Produk\" mulai baris 3. Baris 2 adalah header dan tidak boleh diubah.",
    "2. Produk dicocokkan berdasarkan nama. Nama yang sama akan diperbarui, nama baru akan ditambahkan.",
    "3. Harga diisi angka rupiah tanpa \"Rp\", titik, atau koma. Contoh: 65000.",
    "4. Status boleh dikosongkan; kosong berarti Aktif.",
    "5. Kolom Profit dan Margin (%) berisi rumus otomatis. Tidak perlu diisi dan tidak dibaca saat import.",
    "6. Maksimal 1.000 baris per file dan ukuran file maksimal 2 MB.",
    "7. Simpan file sebagai .xlsx. File .xls lama (Excel 97-2003) juga bisa diimpor langsung.",
  ];
  notes.forEach((note, index) => {
    const cell = guide.getCell(12 + index, 1);
    guide.mergeCells(12 + index, 1, 12 + index, 3);
    cell.value = note;
    cell.font = { name: "Calibri", size: 10, color: { argb: COLORS.muted } };
    cell.alignment = { vertical: "middle", wrapText: true };
    guide.getRow(12 + index).height = 20;
  });

  return workbook.xlsx.writeBuffer();
}

export interface ParsedProductRow {
  rowNumber: number;
  nama: string;
  operator: string;
  hargaBeli: number;
  hargaJual: number;
  isActive: boolean;
}

export interface ProductRowError {
  rowNumber: number;
  nama?: string;
  message: string;
}

export interface ParseProductsResult {
  rows: ParsedProductRow[];
  errors: ProductRowError[];
}

type Field = "nama" | "operator" | "hargaBeli" | "hargaJual" | "status";

const FIELD_ALIASES: Record<Field, string[]> = {
  nama: ["nama produk", "nama", "produk", "voucher", "nama voucher", "produk voucher"],
  operator: ["operator", "provider", "operator provider"],
  hargaBeli: ["harga beli", "harga modal", "modal", "harga pokok"],
  hargaJual: ["harga jual", "harga"],
  status: ["status", "status produk", "aktif"],
};

const REQUIRED_FIELDS: Field[] = ["nama", "operator", "hargaBeli", "hargaJual"];

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[:*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.error === "string") return record.error;
    if (typeof record.result === "string" || typeof record.result === "number") {
      return String(record.result);
    }
    if (Array.isArray(record.richText)) {
      return record.richText
        .map((part) =>
          part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
            ? (part as { text: string }).text
            : "",
        )
        .join("");
    }
  }
  return String(value);
}

function parseRupiahValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : null;
  }
  const text = cellText(value).replace(/rp/gi, "").replace(/\s/g, "");
  if (!text) return null;

  let normalized: string;
  if (text.includes(",")) {
    // Format Indonesia: titik = ribuan, koma = desimal.
    normalized = text.replace(/\./g, "").replace(/,/g, ".");
  } else {
    const parts = text.split(".");
    if (parts.length === 2 && parts[1]!.length !== 3) {
      normalized = `${parts[0]}.${parts[1]}`;
    } else {
      normalized = parts.join("");
    }
  }
  normalized = normalized.replace(/[^0-9.-]/g, "");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function parseStatusValue(value: string): boolean | null {
  const text = value.trim().toLowerCase();
  if (!text) return true;
  if (
    ["aktif", "active", "ya", "yes", "1", "true", "sukses", "berhasil", "success", "lunas"].includes(
      text,
    )
  ) {
    return true;
  }
  if (
    [
      "nonaktif",
      "non-aktif",
      "non aktif",
      "inactive",
      "tidak",
      "no",
      "0",
      "false",
      "gagal",
      "batal",
      "cancel",
      "canceled",
      "cancelled",
      "failed",
    ].includes(text)
  ) {
    return false;
  }
  return null;
}

function headerMapOfRow(row: unknown[]): Map<Field, number> | null {
  const map = new Map<Field, number>();
  row.forEach((value, index) => {
    const header = normalizeHeader(cellText(value));
    if (!header) return;
    for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<[Field, string[]]>) {
      if (map.has(field)) continue;
      if (aliases.includes(header)) {
        map.set(field, index + 1);
        break;
      }
    }
  });
  return REQUIRED_FIELDS.every((field) => map.has(field)) ? map : null;
}

function isSummaryRow(row: unknown[], nama: string): boolean {
  if (/^(total|jumlah|subtotal)\s*[·:-]/i.test(nama)) return true;
  if (/^(catatan|keterangan|diunduh|petunjuk|file ini)\b/i.test(nama)) return true;
  if (nama) return false;
  return row.some((value) => /^(total|jumlah|subtotal)\b/i.test(cellText(value).trim()));
}

interface SheetMatrix {
  name: string;
  rows: unknown[][];
}

function parseSheetMatrix(sheets: SheetMatrix[]): ParseProductsResult {
  let target: { rows: unknown[][]; headerIndex: number; columns: Map<Field, number> } | null = null;

  for (const sheet of sheets) {
    const limit = Math.min(sheet.rows.length, HEADER_SEARCH_LIMIT);
    for (let index = 0; index < limit; index += 1) {
      const columns = headerMapOfRow(sheet.rows[index] ?? []);
      if (columns) {
        target = { rows: sheet.rows, headerIndex: index, columns };
        break;
      }
    }
    if (target) break;
  }

  if (!target) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Header produk tidak ditemukan. Gunakan template dengan kolom: Nama Produk (atau Voucher), Operator (atau Provider), Harga Beli, dan Harga Jual. Kolom Status, Profit, dan Margin (%) opsional.",
    );
  }

  const matrix = target.rows;
  const columns = target.columns;
  const rows: ParsedProductRow[] = [];
  const errors: ProductRowError[] = [];
  let dataRows = 0;

  for (let index = target.headerIndex + 1; index < matrix.length; index += 1) {
    const row = matrix[index] ?? [];
    const cellAt = (field: Field): unknown => {
      const column = columns.get(field);
      return column ? row[column - 1] : null;
    };
    const read = (field: Field): string => cellText(cellAt(field)).trim();

    const mappedColumns = Array.from(new Set(columns.values()));
    const isBlank = mappedColumns.every((column) => cellText(row[column - 1]).trim() === "");
    if (isBlank) continue;

    const nama = read("nama");
    if (isSummaryRow(row, nama)) continue;

    dataRows += 1;
    if (dataRows > PRODUCT_IMPORT_MAX_ROWS) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Maksimal ${PRODUCT_IMPORT_MAX_ROWS.toLocaleString("id-ID")} baris produk per file.`,
      );
    }

    const operator = read("operator");
    const hargaBeli = parseRupiahValue(cellAt("hargaBeli"));
    const hargaJual = parseRupiahValue(cellAt("hargaJual"));
    const statusRaw = read("status");
    const isActive = parseStatusValue(statusRaw);
    const messages: string[] = [];

    if (!nama) messages.push("Nama produk wajib diisi.");
    if (!operator) messages.push("Operator wajib diisi.");
    if (hargaBeli === null) messages.push("Harga beli harus berupa angka.");
    if (hargaJual === null) messages.push("Harga jual harus berupa angka.");
    if (isActive === null) messages.push("Status harus Aktif atau Nonaktif.");

    if (messages.length === 0) {
      const parsed = productSchema.safeParse({
        nama,
        operator,
        hargaBeli,
        hargaJual,
      });
      if (!parsed.success) {
        messages.push(...parsed.error.issues.map((issue) => issue.message));
      }
    }

    if (messages.length > 0) {
      errors.push({ rowNumber: index + 1, nama: nama || undefined, message: messages.join(" ") });
      continue;
    }

    rows.push({
      rowNumber: index + 1,
      nama,
      operator,
      hargaBeli: hargaBeli as number,
      hargaJual: hargaJual as number,
      isActive: isActive as boolean,
    });
  }

  return { rows, errors };
}

function excelJsSheetToMatrix(worksheet: ExcelJS.Worksheet): unknown[][] {
  const rows: unknown[][] = [];
  const rowCount = Math.min(worksheet.rowCount, MAX_MATRIX_ROWS);
  const columnCount = Math.min(worksheet.columnCount, MAX_MATRIX_COLUMNS);

  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values: unknown[] = [];
    for (let column = 1; column <= columnCount; column += 1) {
      values.push(row.getCell(column).value);
    }
    rows.push(values);
  }

  return rows;
}

async function xlsSheetToMatrices(buffer: ArrayBuffer): Promise<SheetMatrix[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });

  return workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name];
    if (!worksheet) return { name, rows: [] };

    const ref = worksheet["!ref"];
    const range = ref ? XLSX.utils.decode_range(ref) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
      range: {
        s: { r: range.s.r, c: range.s.c },
        e: {
          r: Math.min(range.e.r, MAX_MATRIX_ROWS - 1),
          c: Math.min(range.e.c, MAX_MATRIX_COLUMNS - 1),
        },
      },
    });

    return { name, rows };
  });
}

type WorkbookFormat = "xlsx" | "xls";

function detectWorkbookFormat(buffer: ArrayBuffer): WorkbookFormat {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 8));
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "xlsx"; // ZIP / OOXML
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return "xls"; // OLE / BIFF8
  }
  throw new AppError(
    "VALIDATION_ERROR",
    "File Excel tidak dikenali. Gunakan file .xls, .xlsx, atau .xlsm.",
  );
}

/** Baca file .xls/.xlsx/.xlsm menjadi baris produk; header dicari di 20 baris pertama. */
export async function parseProductsWorkbook(buffer: ArrayBuffer): Promise<ParseProductsResult> {
  const format = detectWorkbookFormat(buffer);

  if (format === "xls") {
    try {
      return parseSheetMatrix(await xlsSheetToMatrices(buffer));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "VALIDATION_ERROR",
        "File .xls tidak bisa dibaca. Pastikan file tidak rusak atau terproteksi password.",
      );
    }
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new AppError(
      "VALIDATION_ERROR",
      "File Excel tidak bisa dibaca. Pastikan file berformat .xls, .xlsx, atau .xlsm dan tidak rusak.",
    );
  }

  return parseSheetMatrix(
    workbook.worksheets.map((worksheet) => ({
      name: worksheet.name,
      rows: excelJsSheetToMatrix(worksheet),
    })),
  );
}
