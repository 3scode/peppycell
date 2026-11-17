import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

const WIDTH = 1080;
const HEIGHT = 1920;
const PADDING = 32;
const GUTTER = 14;
const CARD_WIDTH = (WIDTH - PADDING * 2 - GUTTER) / 2;
const CARD_PADDING = 8;
const ROW_GAP = 4;
const TOP_BAR = 8;
const HEADER_BLOCK = 252;
const FOOTER_BLOCK = 138;

const INK_TOP = "#0B1B3F";
const INK_BOTTOM = "#060B1C";
const YELLOW = "#FFC53D";
const PAPER = "#FFFFFF";

const fontDir = join(process.cwd(), "assets", "fonts");

type LoadedFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 600 | 700;
  style: "normal";
};

let fontsPromise: Promise<LoadedFont[]> | null = null;

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

async function loadFonts(): Promise<LoadedFont[]> {
  fontsPromise ??= Promise.all([
    readFile(join(fontDir, "inter-latin-400-normal.woff")),
    readFile(join(fontDir, "inter-latin-600-normal.woff")),
    readFile(join(fontDir, "inter-latin-700-normal.woff")),
    readFile(join(fontDir, "space-grotesk-latin-700-normal.woff")),
  ]).then(([regular, semibold, bold, display]) => [
    { name: "Inter", data: toArrayBuffer(regular), weight: 400, style: "normal" },
    { name: "Inter", data: toArrayBuffer(semibold), weight: 600, style: "normal" },
    { name: "Inter", data: toArrayBuffer(bold), weight: 700, style: "normal" },
    { name: "Space Grotesk", data: toArrayBuffer(display), weight: 700, style: "normal" },
  ]);
  return fontsPromise;
}

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#5B5BD6"/><path d="M35.5 8 18 35h12l-1.5 21L46 28H33.5l2-20Z" fill="#FFFFFF"/></svg>`;
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;

interface Brand {
  bg: string;
  fg: string;
  tint: string;
}

const BRANDS: Record<string, Brand> = {
  telkomsel: { bg: "#C8102E", fg: "#FFFFFF", tint: "#FFF3F5" },
  indosat: { bg: "#F2B600", fg: "#1C1400", tint: "#FFFAEB" },
  axis: { bg: "#6C2A8C", fg: "#FFFFFF", tint: "#FAF5FF" },
  xl: { bg: "#0B4F9E", fg: "#FFFFFF", tint: "#F2F6FD" },
  tri: { bg: "#151515", fg: "#FFFFFF", tint: "#F6F6F6" },
  smartfren: { bg: "#D6006E", fg: "#FFFFFF", tint: "#FFF4FA" },
  "by.u": { bg: "#009FE3", fg: "#FFFFFF", tint: "#F2FBFF" },
  pln: { bg: "#0A6EB4", fg: "#FFFFFF", tint: "#F2F9FF" },
  game: { bg: "#4C1D95", fg: "#FFFFFF", tint: "#F7F3FF" },
  voucher: { bg: "#0F766E", fg: "#FFFFFF", tint: "#F1FCFA" },
};

const FALLBACK: Brand[] = [
  { bg: "#1D4ED8", fg: "#FFFFFF", tint: "#F2F6FF" },
  { bg: "#B45309", fg: "#FFFFFF", tint: "#FFF8F1" },
  { bg: "#047857", fg: "#FFFFFF", tint: "#F1FBF7" },
  { bg: "#BE123C", fg: "#FFFFFF", tint: "#FFF4F6" },
];

function brandOf(operator: string): Brand {
  const key = operator.trim().toLowerCase();
  if (BRANDS[key]) return BRANDS[key]!;
  const compact = key.replace(/[^a-z]/g, "");
  const found = Object.entries(BRANDS).find(
    ([name]) => compact.includes(name.replace(/[^a-z]/g, "")),
  );
  if (found) return found[1];
  const hash = compact.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return FALLBACK[hash % FALLBACK.length]!;
}

function formatRupiah(value: number) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(Math.max(0, Math.round(value)))}`;
}

function normalizeUnit(unit: string) {
  const lower = unit.toLowerCase();
  if (lower === "hr" || lower === "day" || lower === "hari") return "Hari";
  if (lower === "bln" || lower === "bulan") return "Bulan";
  return "Minggu";
}

function parseSpec(nama: string) {
  const duration = nama.match(/(\d+)\s*(hari|hr|day|bulan|bln|minggu|mgg)/i);
  const quota = nama.match(/(\d+(?:[.,]\d+)?)\s*(gb|mb|tb)/i);

  const unit = duration ? normalizeUnit(duration[2]!) : "Hari";
  const amount = duration ? Number(duration[1]) : 0;
  const durationDays = unit === "Bulan" ? amount * 30 : unit === "Minggu" ? amount * 7 : amount;

  const quotaUnit = quota ? quota[2]!.toUpperCase() : "GB";
  const quotaAmount = quota ? Number(quota[1]!.replace(",", ".")) : 0;
  const quotaValue =
    quotaUnit === "MB" ? quotaAmount / 1024 : quotaUnit === "TB" ? quotaAmount * 1024 : quotaAmount;

  return {
    durationLabel: duration ? `${amount} ${unit}` : null,
    quotaLabel: quota ? `${quota[1]!.replace(".", ",")} ${quotaUnit}` : null,
    quotaAmount: quota ? quota[1]!.replace(".", ",") : null,
    quotaUnitName: quotaUnit,
    durationDays,
    quotaValue,
  };
}

function cleanName(nama: string, operator: string) {
  const spec = parseSpec(nama);
  let rest = nama;
  if (spec.durationLabel) {
    rest = rest.replace(/(\d+)\s*(hari|hr|day|bulan|bln|minggu|mgg)/i, " ");
  }
  if (spec.quotaLabel) {
    rest = rest.replace(/(\d+(?:[.,]\d+)?)\s*(gb|mb|tb)/i, " ");
  }
  rest = rest.replace(new RegExp(operator, "i"), " ");
  return rest.replace(/\s+/g, " ").replace(/^[-–·|:]+|[-–·|:]+$/g, "").trim();
}

export interface PosterProduct {
  nama: string;
  operator: string;
  hargaJual: number;
}

export interface PosterOptions {
  title?: string;
  subtitle?: string;
  footerNote?: string;
  footerContact?: string;
}

interface PreparedRow {
  duration: string;
  quota: string;
  quotaAmount: string;
  quotaUnit: string;
  price: string;
  durationDays: number;
  quotaValue: number;
  priceValue: number;
}

interface PreparedGroup {
  operator: string;
  brand: Brand;
  hasDuration: boolean;
  rows: PreparedRow[];
}

interface Metrics {
  rowHeight: number;
  headerHeight: number;
  cardGap: number;
}

function prepare(products: PosterProduct[]): PreparedGroup[] {
  const byOperator = new Map<string, PosterProduct[]>();
  for (const product of products) {
    const key = product.operator.trim() || "Lainnya";
    byOperator.set(key, [...(byOperator.get(key) ?? []), product]);
  }

  const groups: PreparedGroup[] = [];
  for (const [operator, items] of byOperator) {
    const rows = items
      .map((product) => {
        const spec = parseSpec(product.nama);
        const fallback = cleanName(product.nama, operator) || product.nama;
        return {
          duration: spec.durationLabel ?? "",
          durationDays: spec.durationDays,
          quota: spec.quotaLabel ?? fallback,
          quotaAmount: spec.quotaAmount ?? fallback,
          quotaUnit: spec.quotaAmount ? spec.quotaUnitName : "",
          quotaValue: spec.quotaValue,
          price: formatRupiah(product.hargaJual),
          priceValue: product.hargaJual,
        };
      })
      .sort((a, b) => {
        if (a.durationDays !== b.durationDays) return a.durationDays - b.durationDays;
        if (a.quotaValue !== b.quotaValue) return a.quotaValue - b.quotaValue;
        return a.priceValue - b.priceValue;
      });
    groups.push({
      operator,
      brand: brandOf(operator),
      hasDuration: rows.some((row) => row.duration.length > 0),
      rows,
    });
  }

  return groups.sort((a, b) => {
    if (b.rows.length !== a.rows.length) return b.rows.length - a.rows.length;
    return a.operator.localeCompare(b.operator);
  });
}

function cardHeight(group: PreparedGroup, metrics: Metrics) {
  return (
    metrics.headerHeight +
    group.rows.length * metrics.rowHeight +
    Math.max(0, group.rows.length - 1) * ROW_GAP +
    CARD_PADDING * 2
  );
}

function balanceColumns(groups: PreparedGroup[], metrics: Metrics) {
  const measure = (column: PreparedGroup[]) =>
    column.reduce((sum, group) => sum + cardHeight(group, metrics) + metrics.cardGap, 0);

  // Cari pembagian dua kolom dengan tinggi maksimum paling kecil.
  // Jumlah operator selalu kecil, jadi pencarian menyeluruh masih murah.
  const canEnumerate = groups.length <= 16;
  if (canEnumerate) {
    const total = 1 << groups.length;
    let bestMask = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let mask = 0; mask < total; mask += 1) {
      const left: PreparedGroup[] = [];
      const right: PreparedGroup[] = [];
      for (let index = 0; index < groups.length; index += 1) {
        if (mask & (1 << index)) left.push(groups[index]!);
        else right.push(groups[index]!);
      }
      const score = Math.max(measure(left), measure(right));
      if (score < bestScore) {
        bestScore = score;
        bestMask = mask;
      }
    }
    const left: PreparedGroup[] = [];
    const right: PreparedGroup[] = [];
    for (let index = 0; index < groups.length; index += 1) {
      if (bestMask & (1 << index)) left.push(groups[index]!);
      else right.push(groups[index]!);
    }
    return { columns: [left, right], height: bestScore };
  }

  const columns: PreparedGroup[][] = [[], []];
  for (const group of groups) {
    const target = measure(columns[0]!) <= measure(columns[1]!) ? 0 : 1;
    columns[target]!.push(group);
  }
  return { columns, height: Math.max(measure(columns[0]!), measure(columns[1]!)) };
}

function availableHeight() {
  return HEIGHT - PADDING * 2 - TOP_BAR - HEADER_BLOCK - FOOTER_BLOCK;
}

/** Pilih tinggi baris terbesar yang masih muat di kanvas 9:16. */
function fitMetrics(groups: PreparedGroup[]): Metrics {
  const limit = availableHeight();
  for (let rowHeight = 108; rowHeight >= 22; rowHeight -= 2) {
    const metrics: Metrics = {
      rowHeight,
      headerHeight: Math.round(rowHeight * 0.86) + 14,
      cardGap: rowHeight >= 42 ? 12 : 8,
    };
    if (balanceColumns(groups, metrics).height <= limit) return metrics;
  }
  return { rowHeight: 22, headerHeight: 34, cardGap: 6 };
}

function splitTitle(title: string): string[] {
  const words = title.toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return [words.join(" ")];
  if (words.length === 3) return [words.slice(0, 2).join(" "), words[2]!];
  const perLine = Math.ceil(words.length / 2);
  const lines: string[] = [];
  for (let index = 0; index < words.length; index += perLine) {
    lines.push(words.slice(index, index + perLine).join(" "));
  }
  return lines;
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  const lines = splitTitle(title);
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const size = longest > 18 ? 46 : longest > 14 ? 54 : 62;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: HEADER_BLOCK,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoDataUri} width={42} height={42} alt="" />
        <div
          style={{
            display: "flex",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: 6,
            color: "rgba(255,255,255,0.72)",
          }}
        >
          PEPPY CELL
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 16,
        }}
      >
        {lines.map((line, index) => (
          <div
            key={`${line}-${index}`}
            style={{
              display: "flex",
              fontFamily: "Space Grotesk",
              fontSize: size,
              fontWeight: 700,
              letterSpacing: -1.2,
              lineHeight: 1.08,
              color: index === 1 || lines.length === 1 ? YELLOW : "#FFFFFF",
              textAlign: "center",
            }}
          >
            {line}
          </div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          marginTop: 10,
          fontSize: 19,
          fontWeight: 600,
          color: "rgba(255,255,255,0.94)",
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

function OperatorCard({
  group,
  metrics,
  width,
}: {
  group: PreparedGroup;
  metrics: Metrics;
  width: number;
}) {
  const { brand, hasDuration } = group;
  const fontMain = Math.max(12, Math.round(metrics.rowHeight * 0.34));
  const fontPrice = Math.max(14, Math.round(metrics.rowHeight * 0.44));
  const fontHead = Math.max(16, Math.round(metrics.headerHeight * 0.48));
  const fontQuota = Math.max(16, Math.round(metrics.rowHeight * 0.56));
  const fontQuotaUnit = Math.max(10, Math.round(metrics.rowHeight * 0.28));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width,
        backgroundColor: brand.bg,
        borderRadius: 14,
        padding: CARD_PADDING,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: metrics.headerHeight - CARD_PADDING * 2,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Space Grotesk",
            fontSize: fontHead,
            fontWeight: 700,
            letterSpacing: 0.6,
            color: brand.fg,
          }}
        >
          {group.operator.toUpperCase()}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: ROW_GAP }}>
        {group.rows.map((row, index) => {
          return (
          <div
            key={`${group.operator}-${row.quota}-${index}`}
            style={{
              display: "flex",
              alignItems: "center",
              height: metrics.rowHeight,
              backgroundColor: index % 2 === 0 ? PAPER : brand.tint,
              borderRadius: 7,
              paddingLeft: 6,
              paddingRight: 9,
              gap: 7,
            }}
          >
            {hasDuration ? (
              <div
                style={{
                  display: "flex",
                  width: Math.round(metrics.rowHeight * 1.75),
                  fontSize: fontMain,
                  fontWeight: 600,
                  color: "#5A6070",
                }}
              >
                {row.duration || "—"}
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: Math.round(metrics.rowHeight * 1.7),
                height: Math.min(
                  Math.max(21, metrics.rowHeight - 12),
                  Math.round(metrics.rowHeight * 1.15),
                ),
                borderRadius: 6,
                paddingLeft: 10,
                paddingRight: 10,
                backgroundColor: brand.bg,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <div
                  style={{
                    display: "flex",
                    fontFamily: "Space Grotesk",
                    fontSize: fontQuota,
                    fontWeight: 700,
                    lineHeight: 1,
                    letterSpacing: -0.6,
                    color: brand.fg,
                  }}
                >
                  {row.quotaAmount}
                </div>
                {row.quotaUnit ? (
                  <div
                    style={{
                      display: "flex",
                      fontSize: fontQuotaUnit,
                      fontWeight: 700,
                      lineHeight: 1,
                      marginLeft: 4,
                      marginBottom: 2,
                      letterSpacing: 0.4,
                      color: brand.fg,
                    }}
                  >
                    {row.quotaUnit}
                  </div>
                ) : null}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexGrow: 1,
                justifyContent: "flex-end",
                fontFamily: "Space Grotesk",
                fontSize: fontPrice,
                fontWeight: 700,
                color: "#0D1220",
              }}
            >
              {row.price}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

export async function renderPricePoster(
  products: PosterProduct[],
  options: PosterOptions = {},
  fileName?: string,
) {
  const fonts = await loadFonts();
  const groups = prepare(products);
  const metrics = fitMetrics(groups);
  const { columns } = balanceColumns(groups, metrics);
  const visibleColumns = columns.filter((column) => column.length > 0);
  const singleColumn = visibleColumns.length === 1;
  const columnWidth = singleColumn ? WIDTH - PADDING * 2 : CARD_WIDTH;

  const title = options.title?.trim() || "Daftar Harga Voucher Data";
  const subtitle = options.subtitle?.trim() || "Murah, Cepat & Terlengkap!";
  const footerNote =
    options.footerNote?.trim() ||
    "Kode voucher dikirim lewat WhatsApp. Hubungi kami atau datang langsung ke Peppy Cell.";
  const footerContact = options.footerContact?.trim() || "Peppy Cell · Melayani setiap hari";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: PADDING,
          backgroundColor: INK_BOTTOM,
          backgroundImage: `linear-gradient(180deg, ${INK_TOP} 0%, ${INK_BOTTOM} 66%)`,
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            height: TOP_BAR,
            borderRadius: 999,
            backgroundImage: `linear-gradient(90deg, #4F46E5 0%, ${YELLOW} 52%, #12B76A 100%)`,
            marginBottom: 16,
          }}
        />

        <Header title={title} subtitle={subtitle} />

        <div
          style={{
            display: "flex",
            flexGrow: 1,
            gap: GUTTER,
            alignItems: "flex-start",
            overflow: "hidden",
          }}
        >
          {visibleColumns.map((column, columnIndex) => (
            <div
              key={`column-${columnIndex}`}
              style={{
                display: "flex",
                flexDirection: "column",
                width: columnWidth,
                gap: metrics.cardGap,
              }}
            >
              {column.map((group) => (
                <OperatorCard
                  key={group.operator}
                  group={group}
                  metrics={metrics}
                  width={columnWidth}
                />
              ))}
            </div>
          ))}
        </div>

        {groups.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 150,
              borderRadius: 14,
              border: "2px dashed rgba(255,255,255,0.24)",
              color: "rgba(255,255,255,0.72)",
              fontSize: 22,
            }}
          >
            Belum ada produk aktif untuk ditampilkan.
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: FOOTER_BLOCK,
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              backgroundColor: "rgba(255,255,255,0.07)",
              border: "2px solid rgba(255,255,255,0.14)",
              borderRadius: 13,
              paddingTop: 12,
              paddingBottom: 12,
              paddingLeft: 16,
              paddingRight: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: 2.4,
                color: YELLOW,
              }}
            >
              KETERANGAN
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 5,
                fontSize: 17,
                fontWeight: 600,
                lineHeight: 1.32,
                color: "#FFFFFF",
              }}
            >
              {footerNote}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 4,
                fontSize: 14,
                fontWeight: 400,
                color: "rgba(255,255,255,0.7)",
              }}
            >
              {footerContact}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        ...(fileName ? { "Content-Disposition": `attachment; filename="${fileName}"` } : {}),
      },
    },
  );
}
