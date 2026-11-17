import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AppError, type ErrorCode } from "@/lib/errors";
import { addDays, lastClosedWeek, todayWib, weekBounds, WIB_OFFSET_MS } from "@/lib/period";
import type {
  AuditLog,
  DashboardMetrics,
  DashboardTransaction,
  Paginated,
  PayoutAllocations,
  PayoutItem,
  PayoutPreview,
  PayoutRecord,
  PayoutSettings,
  Product,
  ProductPrice,
  SessionUser,
  TransactionDetail,
  TransactionSafe,
  UserRole,
  UserSummary,
  VoucherConversionResult,
  VoucherPreviewRow,
  VoucherSaleResult,
  VoucherStock,
  Wallet,
  WalletAdjustment,
} from "@/types/domain";
import type { DataRepository } from "@/lib/data/types";

type Row = Record<string, unknown>;
type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const ERROR_MAP: Record<string, { code: ErrorCode; message: string }> = {
  UNAUTHORIZED: { code: "UNAUTHORIZED", message: "Sesi tidak valid. Silakan login ulang." },
  FORBIDDEN: { code: "FORBIDDEN", message: "Anda tidak punya akses ke aksi ini." },
  NOT_FOUND: { code: "NOT_FOUND", message: "Data tidak ditemukan." },
  CONFLICT: { code: "CONFLICT", message: "Aksi ini tidak bisa dilakukan." },
  VALIDATION_ERROR: { code: "VALIDATION_ERROR", message: "Periksa kembali input Anda." },
  PRODUCT_INACTIVE: { code: "PRODUCT_INACTIVE", message: "Produk sedang nonaktif." },
  PRODUCT_COST_MISSING: { code: "PRODUCT_COST_MISSING", message: "Harga beli produk belum diatur." },
  INVALID_MARGIN: { code: "INVALID_MARGIN", message: "Harga jual lebih rendah dari harga beli." },
  DEFAULT_WALLET_MISSING: {
    code: "DEFAULT_WALLET_MISSING",
    message: "Belum ada wallet aktif. Buat wallet dulu sebelum mencatat transaksi.",
  },
  INSUFFICIENT_BALANCE: { code: "INSUFFICIENT_BALANCE", message: "Saldo wallet tidak mencukupi." },
  WALLET_INACTIVE: { code: "WALLET_INACTIVE", message: "Wallet tidak aktif." },
  SAME_WALLET: { code: "SAME_WALLET", message: "Wallet asal dan tujuan tidak boleh sama." },
  HISTORICAL_PERIOD: {
    code: "HISTORICAL_PERIOD",
    message: "Periode ini sudah dibayarkan atau memuat data historis yang terkunci.",
  },
  IDEMPOTENCY_CONFLICT: {
    code: "IDEMPOTENCY_CONFLICT",
    message: "Permintaan ini sudah pernah diproses.",
  },
  DUPLICATE_PAYOUT: { code: "DUPLICATE_PAYOUT", message: "Periode ini sudah pernah dipayout." },
  PAYOUT_LOSS: { code: "PAYOUT_LOSS", message: "Laba bersih periode ini tidak positif." },
  PAYOUT_PERIOD_OPEN: { code: "PAYOUT_PERIOD_OPEN", message: "Periode berjalan belum bisa dieksekusi." },
  INVALID_ALLOCATION: { code: "INVALID_ALLOCATION", message: "Total alokasi harus 100%." },
};

function raise(error: unknown, fallback = "Terjadi kesalahan pada database."): never {
  const raw = (error as { message?: string } | null)?.message ?? "";
  const key = raw.split(":")[0]?.trim() ?? "";
  const mapped = ERROR_MAP[key];
  if (mapped) {
    const suffix = raw.includes(":") ? raw.split(":").slice(1).join(":").trim() : "";
    const useSuffix = suffix && (key === "CONFLICT" || key === "INSUFFICIENT_BALANCE");
    throw new AppError(mapped.code, useSuffix ? suffix : mapped.message);
  }
  const code = (error as { code?: string } | null)?.code;
  if (code === "42501") throw new AppError("FORBIDDEN", "Anda tidak punya akses ke aksi ini.");
  if (code === "23505") throw new AppError("CONFLICT", "Data yang sama sudah ada.");
  if (code === "PGRST116") throw new AppError("NOT_FOUND", "Data tidak ditemukan.");
  if (code === "23514" && raw.includes("wallets_saldo_check")) {
    throw new AppError("INSUFFICIENT_BALANCE", "Saldo wallet tidak cukup untuk melakukan aksi ini.");
  }
  throw new AppError("INTERNAL_ERROR", fallback);
}

function num(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function wibDate(iso: string): string {
  return new Date(new Date(iso).getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

function dateOnly(value: string | undefined): string {
  if (!value) return todayWib();
  return value.length === 10 ? value : wibDate(value);
}

function startOfWibIso(date: string): string {
  return new Date(`${date}T00:00:00+07:00`).toISOString();
}

function endOfWibIso(date: string): string {
  return new Date(`${date}T23:59:59.999+07:00`).toISOString();
}

function mapUser(row: Row): UserSummary {
  return {
    id: text(row.id),
    email: text(row.email),
    fullName: text(row.full_name),
    role: (row.role as UserRole) ?? "karyawan",
    isActive: Boolean(row.is_active),
    avatarUrl: (row.avatar_url as string | null) ?? null,
    defaultProfitShare: num(row.default_profit_share),
    theme: (row.theme as SessionUser["theme"]) ?? "system",
    notificationPayout: Boolean(row.notification_payout),
    createdAt: text(row.created_at),
    lastSeenAt: (row.last_seen_at as string | null) ?? null,
    deletedAt: (row.deleted_at as string | null) ?? null,
  };
}

function mapWallet(row: Row): Wallet {
  return {
    id: text(row.id),
    nama: text(row.nama_wallet),
    tipe: (row.tipe as Wallet["tipe"]) ?? "cash",
    saldo: num(row.saldo),
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
    createdAt: text(row.created_at),
  };
}

function mapProduct(row: Row, hargaBeli?: number | null): Product {
  return {
    id: text(row.id),
    nama: text(row.nama_produk),
    operator: text(row.operator),
    hargaJual: num(row.harga_jual),
    hargaBeli: hargaBeli === undefined || hargaBeli === null ? undefined : num(hargaBeli),
    isActive: Boolean(row.is_active),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    archivedAt: row.deleted_at ? text(row.deleted_at) : null,
  };
}

function mapProductPrice(row: Row): ProductPrice {
  return {
    id: text(row.id),
    productId: text(row.product_id),
    effectiveFrom: text(row.effective_from),
    hargaBeli: num(row.harga_beli),
    hargaJual: num(row.harga_jual),
    createdAt: text(row.created_at),
    createdBy: text(row.created_by),
  };
}

function mapSettings(row: Row): PayoutSettings {
  return {
    retainedPct: num(row.retained_pct),
    adminPct: num(row.admin_pct),
    investorPct: num(row.investor_pct),
    employeePct: num(row.employee_pct),
    updatedAt: text(row.updated_at),
  };
}

function mapAllocations(value: unknown): PayoutAllocations {
  const row = (value ?? {}) as Row;
  return {
    retained: num(row.retained),
    admin: num(row.admin),
    investor: num(row.investor),
    employee: num(row.employee),
  };
}

async function lookups(supabase: Supabase) {
  const [wallets, products, users] = await Promise.all([
    supabase.rpc("wallet_lookup"),
    supabase.rpc("product_lookup"),
    supabase.from("users").select("id,full_name"),
  ]);
  const walletMap = new Map<string, string>();
  if (!wallets.error) {
    for (const row of (wallets.data ?? []) as Row[]) walletMap.set(text(row.id), text(row.nama));
  }
  const productMap = new Map<string, string>();
  if (!products.error) {
    for (const row of (products.data ?? []) as Row[]) productMap.set(text(row.id), text(row.nama));
  }
  const userMap = new Map<string, string>();
  if (!users.error) {
    for (const row of (users.data ?? []) as Row[]) userMap.set(text(row.id), text(row.full_name));
  }
  return { walletMap, productMap, userMap };
}

function mapTransaction(
  row: Row,
  maps: Awaited<ReturnType<typeof lookups>>,
  cost?: Row,
): TransactionDetail {
  const productName = row.product_id ? maps.productMap.get(text(row.product_id)) ?? null : null;
  const description = row.keterangan
    ? text(row.keterangan)
    : productName
      ? `Penjualan ${productName}`
      : "";
  return {
    id: text(row.id),
    tanggal: text(row.tanggal),
    tipe: row.tipe as TransactionSafe["tipe"],
    kategori: text(row.kategori),
    nominal: num(row.nominal),
    qty: row.qty == null ? null : num(row.qty),
    unitPrice: row.unit_price == null ? null : num(row.unit_price),
    walletId: text(row.wallet_id),
    walletName: maps.walletMap.get(text(row.wallet_id)),
    destinationWalletId: (row.wallet_destination_id as string | null) ?? null,
    destinationWalletName: row.wallet_destination_id
      ? maps.walletMap.get(text(row.wallet_destination_id))
      : null,
    sourceWalletId: (row.source_wallet_id as string | null) ?? null,
    sourceWalletName: row.source_wallet_id
      ? maps.walletMap.get(text(row.source_wallet_id))
      : null,
    productId: (row.product_id as string | null) ?? null,
    productName,
    userId: text(row.user_id),
    userName: maps.userMap.get(text(row.user_id)),
    description,
    status: (row.status as TransactionSafe["status"]) ?? "active",
    reversalOf: (row.reversal_of as string | null) ?? null,
    payoutId: (row.payout_id as string | null) ?? null,
    importBatchId: (row.import_batch_id as string | null) ?? null,
    createdAt: text(row.created_at),
    unitCost: cost ? num(cost.unit_cost) : null,
    margin: cost ? num(cost.margin) : null,
    sourceCost: cost ? num(cost.source_cost) : null,
  };
}

function toSafeTransaction(tx: TransactionDetail): TransactionSafe {
  return {
    id: tx.id,
    tanggal: tx.tanggal,
    tipe: tx.tipe,
    kategori: tx.kategori,
    nominal: tx.nominal,
    qty: tx.qty,
    unitPrice: tx.unitPrice,
    walletId: tx.walletId,
    walletName: tx.walletName,
    destinationWalletId: tx.destinationWalletId,
    destinationWalletName: tx.destinationWalletName,
    sourceWalletId: tx.sourceWalletId,
    sourceWalletName: tx.sourceWalletName,
    productId: tx.productId,
    productName: tx.productName,
    userId: tx.userId,
    userName: tx.userName,
    description: tx.description,
    status: tx.status,
    reversalOf: tx.reversalOf,
    payoutId: tx.payoutId,
    importBatchId: tx.importBatchId,
    createdAt: tx.createdAt,
  };
}

async function mapTransactions(
  supabase: Supabase,
  rows: Row[],
  includeCost: boolean,
): Promise<TransactionDetail[]> {
  const maps = await lookups(supabase);
  const costMap = new Map<string, Row>();
  if (includeCost && rows.length > 0) {
    const ids = rows.map((row) => text(row.id));
    const { data, error } = await supabase
      .from("transaction_costs")
      .select("transaction_id,unit_cost,margin,source_cost")
      .in("transaction_id", ids);
    if (error) raise(error);
    for (const row of (data ?? []) as Row[]) costMap.set(text(row.transaction_id), row);
  }
  return rows.map((row) => {
    const detail = mapTransaction(row, maps, costMap.get(text(row.id)));
    return includeCost ? detail : { ...detail, unitCost: null, margin: null, sourceCost: null };
  });
}

async function loadProductCosts(supabase: Supabase, ids: string[]) {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("product_costs")
    .select("product_id,harga_beli")
    .in("product_id", ids);
  if (error) raise(error);
  for (const row of (data ?? []) as Row[]) map.set(text(row.product_id), num(row.harga_beli));
  return map;
}

async function getTxRowsByIds(supabase: Supabase, ids: string[]): Promise<Row[]> {
  if (ids.length === 0) return [];
  // Satu penjualan bisa menghasilkan banyak baris (satu per unit), jadi id
  // dikirim bertahap agar URL PostgREST tidak melebihi batas.
  const rows: Row[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const { data, error } = await supabase.from("transactions").select("*").in("id", chunk);
    if (error) raise(error);
    rows.push(...((data ?? []) as Row[]));
  }
  return rows;
}

async function getTxRow(supabase: Supabase, id: string): Promise<Row | null> {
  const { data, error } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
  if (error) raise(error);
  return (data as Row | null) ?? null;
}

async function mapPayoutRecord(
  supabase: Supabase,
  row: Row,
): Promise<PayoutRecord> {
  const walletMap = (await supabase.rpc("wallet_lookup")).data as Row[] | null;
  const walletName = (walletMap ?? []).find((item) => text(item.id) === text(row.wallet_id))?.nama;
  const { data: itemRows, error } = await supabase
    .from("payout_items")
    .select("*")
    .eq("payout_id", text(row.id))
    .order("created_at", { ascending: true });
  if (error) raise(error);
  const { data: users } = await supabase.from("users").select("id,full_name,role");
  const userMap = new Map<string, { name: string; role: UserRole }>();
  for (const user of (users ?? []) as Row[]) {
    userMap.set(text(user.id), {
      name: text(user.full_name),
      role: (user.role as UserRole) ?? "investor",
    });
  }
  const items: PayoutItem[] = ((itemRows ?? []) as Row[]).map((item) => ({
    id: text(item.id),
    payoutId: text(item.payout_id),
    userId: text(item.user_id),
    userName: userMap.get(text(item.user_id))?.name ?? "",
    role: userMap.get(text(item.user_id))?.role ?? "investor",
    category: item.category as PayoutItem["category"],
    weightPct: num(item.weight_pct),
    amount: num(item.amount),
    transactionId: text(item.transaction_id),
  }));
  return {
    id: text(row.id),
    startDate: text(row.start_date),
    endDate: text(row.end_date),
    grossMargin: num(row.gross_margin_total),
    operatingExpense: num(row.operating_expense_total),
    netProfit: num(row.net_profit_total),
    retainedEarnings: num(row.retained_earnings),
    totalDistributed: num(row.total_distributed),
    walletId: text(row.wallet_id),
    walletName: walletName ? text(walletName) : undefined,
    status: (row.status as PayoutRecord["status"]) ?? "completed",
    allocations: mapAllocations(row.allocations),
    notes: (row.notes as string | null) ?? null,
    createdBy: text(row.created_by),
    createdAt: text(row.created_at),
    completedAt: (row.completed_at as string | null) ?? null,
    items,
  };
}

/**
 * Payout versi investor: hanya field yang memang boleh dilihat. Nilai agregat
 * perusahaan (margin, beban, kas ditahan, total dibagikan, alokasi, pembuat)
 * sengaja dikosongkan agar tidak bocor lewat API.
 */
function mapInvestorPayoutRecord(row: Row, user: SessionUser): PayoutRecord {
  const items: PayoutItem[] = ((row.items ?? []) as Row[]).map((item) => ({
    id: text(item.id),
    payoutId: text(item.payout_id),
    userId: text(item.user_id),
    userName: user.fullName,
    role: user.role,
    category: item.category as PayoutItem["category"],
    weightPct: num(item.weight_pct),
    amount: num(item.amount),
    transactionId: text(item.transaction_id),
  }));
  return {
    id: text(row.id),
    startDate: text(row.start_date),
    endDate: text(row.end_date),
    grossMargin: 0,
    operatingExpense: 0,
    netProfit: num(row.net_profit),
    retainedEarnings: 0,
    totalDistributed: 0,
    walletId: "",
    walletName: row.wallet_name ? text(row.wallet_name) : undefined,
    status: (row.status as PayoutRecord["status"]) ?? "completed",
    allocations: { retained: 0, admin: 0, investor: 0, employee: 0 },
    notes: (row.notes as string | null) ?? null,
    createdBy: "",
    createdAt: text(row.created_at),
    completedAt: (row.completed_at as string | null) ?? null,
    items,
  };
}

/* ── Reads ─────────────────────────────────────────────────────── */

async function listProductPrices(productIds?: string[]): Promise<ProductPrice[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("product_prices").select("*");
  if (productIds && productIds.length > 0) query = query.in("product_id", productIds);
  const { data, error } = await query;
  if (error) raise(error);
  return ((data ?? []) as Row[]).map(mapProductPrice);
}

async function listProducts(
  user: SessionUser,
  filters: { q?: string; operator?: string; page?: number; limit?: number; archived?: boolean } = {},
): Promise<Paginated<Product>> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 25));
  const archived = user.role === "admin" && Boolean(filters.archived);
  let query = supabase
    .from("products")
    .select("*", { count: "exact" });
  query = archived ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
  if (!archived && user.role !== "admin") query = query.eq("is_active", true);
  if (filters.q) {
    const term = filters.q.replace(/[,()]/g, " ");
    query = query.or(`nama_produk.ilike.%${term}%,operator.ilike.%${term}%`);
  }
  if (filters.operator) query = query.eq("operator", filters.operator);
  query = query.order("nama_produk", { ascending: true }).range((page - 1) * limit, page * limit - 1);
  const { data, error, count } = await query;
  if (error) raise(error);
  const rows = (data ?? []) as Row[];
  const costMap = user.role === "admin" ? await loadProductCosts(supabase, rows.map((row) => text(row.id))) : new Map();
  const total = count ?? rows.length;
  return {
    rows: rows.map((row) => mapProduct(row, user.role === "admin" ? costMap.get(text(row.id)) : undefined)),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

async function listAllProducts(
  user: SessionUser,
  filters: { q?: string; operator?: string } = {},
): Promise<Product[]> {
  const result = await listProducts(user, { ...filters, page: 1, limit: 100 });
  return result.rows;
}

async function getProduct(user: SessionUser, id: string): Promise<Product | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) raise(error);
  if (!data) return null;
  const row = data as Row;
  if (user.role !== "admin" && !row.is_active) return null;
  const costMap = user.role === "admin" ? await loadProductCosts(supabase, [id]) : new Map();
  return mapProduct(row, user.role === "admin" ? costMap.get(id) : undefined);
}

async function listTransactions(
  user: SessionUser,
  filters: {
    type?: string;
    from?: string;
    to?: string;
    walletId?: string;
    userId?: string;
    q?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<Paginated<TransactionSafe>> {
  const isInvestor = user.role === "investor";
  const supabase = (isInvestor ? supabaseAdmin : await createSupabaseServerClient()) as Supabase;
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 25));
  let query = supabase.from("transactions").select("*", { count: "exact" });
  if (filters.type) query = query.eq("tipe", filters.type);
  if (filters.from) query = query.gte("tanggal", startOfWibIso(filters.from));
  if (filters.to) query = query.lte("tanggal", endOfWibIso(filters.to));
  if (filters.userId) query = query.eq("user_id", filters.userId);
  if (filters.walletId) {
    query = query.or(
      `wallet_id.eq.${filters.walletId},wallet_destination_id.eq.${filters.walletId},source_wallet_id.eq.${filters.walletId}`,
    );
  }
  if (filters.q) {
    const term = filters.q.replace(/[,()]/g, " ");
    const maps = await lookups(supabase);
    const productIds = Array.from(maps.productMap.entries())
      .filter(([, nama]) => nama.toLowerCase().includes(term.toLowerCase()))
      .map(([id]) => id);
    const userIds = Array.from(maps.userMap.entries())
      .filter(([, nama]) => nama.toLowerCase().includes(term.toLowerCase()))
      .map(([id]) => id);
    const parts = [`keterangan.ilike.%${term}%`];
    if (productIds.length > 0) parts.push(`product_id.in.(${productIds.join(",")})`);
    if (userIds.length > 0) parts.push(`user_id.in.(${userIds.join(",")})`);
    query = query.or(parts.join(","));
  }
  query = query.order("tanggal", { ascending: false }).range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await query;
  if (error) raise(error);
  const rows = (data ?? []) as Row[];
  const mapped = await mapTransactions(supabase, rows, user.role === "admin");
  const total = count ?? rows.length;
  return {
    rows: mapped.map(toSafeTransaction),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

async function getTransactionDetail(user: SessionUser, id: string): Promise<TransactionDetail | null> {
  const isInvestor = user.role === "investor";
  const supabase = (isInvestor ? supabaseAdmin : await createSupabaseServerClient()) as Supabase;
  const row = await getTxRow(supabase, id);
  if (!row) return null;
  const [detail] = await mapTransactions(supabase, [row], user.role === "admin");
  return detail ?? null;
}

async function listWallets(user: SessionUser) {
  if (user.role !== "admin" && user.role !== "investor") {
    throw new AppError("FORBIDDEN", "Role ini tidak bisa melihat wallet.");
  }
  const supabase = (user.role === "investor" ? supabaseAdmin : await createSupabaseServerClient()) as Supabase;
  const { data, error } = await supabase
    .from("wallets")
    .select("*")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) raise(error);
  const wallets = ((data ?? []) as Row[]).map(mapWallet);
  return {
    wallets,
    totalAssets: wallets.filter((wallet) => wallet.isActive).reduce((sum, wallet) => sum + wallet.saldo, 0),
  };
}

async function listActiveWalletsForTransactions(
  user: SessionUser,
): Promise<{ id: string; nama: string; saldo: number }[]> {
  if (user.role !== "admin" && user.role !== "investor") return [];
  const supabase = (user.role === "investor" ? supabaseAdmin : await createSupabaseServerClient()) as Supabase;
  const { data, error } = await supabase
    .from("wallets")
    .select("id,nama_wallet,saldo")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) raise(error);
  return ((data ?? []) as Row[]).map((row) => ({
    id: text(row.id),
    nama: text(row.nama_wallet),
    saldo: num(row.saldo),
  }));
}

async function walletDefaults() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("wallet_defaults");
  if (error) raise(error);
  const row = (data ?? {}) as Row;
  return {
    hasActive: Boolean(row.has_active),
    label: text(row.default_label) || "Belum ada wallet aktif",
  };
}

async function getDefaultWalletLabel(): Promise<string> {
  return (await walletDefaults()).label;
}

async function hasActiveWallet(): Promise<boolean> {
  return (await walletDefaults()).hasActive;
}

async function listWalletOptions(
  user: SessionUser,
): Promise<{ id: string; nama: string; isDefault: boolean }[]> {
  if (user.role !== "admin" && user.role !== "karyawan") {
    throw new AppError("FORBIDDEN", "Role ini tidak bisa melihat wallet.");
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("wallet_options");
  if (error) raise(error);
  return ((data ?? []) as Row[]).map((row) => ({
    id: text(row.id),
    nama: text(row.nama),
    isDefault: Boolean(row.is_default),
  }));
}

async function getWalletDetail(user: SessionUser, id: string) {
  if (user.role !== "admin" && user.role !== "investor") {
    throw new AppError("FORBIDDEN", "Role ini tidak bisa melihat wallet.");
  }
  const isAdmin = user.role === "admin";
  const supabase = (isAdmin ? await createSupabaseServerClient() : supabaseAdmin) as Supabase;
  const { data: walletRow, error } = await supabase
    .from("wallets")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) raise(error);
  if (!walletRow) return null;

  const monthPrefix = todayWib().slice(0, 7);
  const monthStart = `${monthPrefix}-01`;
  const monthEnd = addDays(`${addDays(`${monthPrefix}-01`, 32).slice(0, 7)}-01`, -1);

  const [latest, monthRows, adjustmentRows, monthAdjustmentRows] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .or(`wallet_id.eq.${id},wallet_destination_id.eq.${id},source_wallet_id.eq.${id}`)
      .order("tanggal", { ascending: false })
      .limit(20),
    supabase
      .from("transactions")
      .select("*")
      .or(`wallet_id.eq.${id},wallet_destination_id.eq.${id},source_wallet_id.eq.${id}`)
      .gte("tanggal", startOfWibIso(monthStart))
      .lte("tanggal", endOfWibIso(monthEnd)),
    supabase
      .from("wallet_adjustments")
      .select("*")
      .eq("wallet_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("wallet_adjustments")
      .select("delta")
      .eq("wallet_id", id)
      .gte("created_at", startOfWibIso(monthStart))
      .lte("created_at", endOfWibIso(monthEnd)),
  ]);
  if (latest.error) raise(latest.error);
  if (monthRows.error) raise(monthRows.error);
  if (adjustmentRows.error) raise(adjustmentRows.error);
  if (monthAdjustmentRows.error) raise(monthAdjustmentRows.error);

  const transactions = await mapTransactions(supabase, (latest.data ?? []) as Row[], isAdmin);
  let monthlyIn = 0;
  let monthlyOut = 0;
  for (const row of (monthRows.data ?? []) as Row[]) {
    let effect = 0;
    const isSource = text(row.wallet_id) === id;
    const isDestination = text(row.wallet_destination_id) === id;
    const isSourceWallet = text(row.source_wallet_id) === id;
    if (row.tipe === "income") {
      if (isSource) effect = num(row.nominal);
      if (isSourceWallet) effect = effect - (num(row.source_cost) ?? 0);
    } else if (row.tipe === "expense" || row.tipe === "payout") {
      effect = isSource ? -num(row.nominal) : 0;
    } else if (row.tipe === "transfer") {
      if (isSource) effect = -num(row.nominal);
      else if (isDestination) effect = num(row.nominal);
    }
    if (row.reversal_of && row.tipe !== "transfer") effect = -effect;
    if (effect > 0) monthlyIn += effect;
    else monthlyOut += Math.abs(effect);
  }

  // Penyesuaian saldo (termasuk konversi/penjualan voucher) ikut dihitung
  // supaya total masuk/keluar bulan ini rekonsiliasi dengan saldo wallet.
  for (const row of (monthAdjustmentRows.data ?? []) as Row[]) {
    const delta = num(row.delta);
    if (delta > 0) monthlyIn += delta;
    else monthlyOut += Math.abs(delta);
  }

  return {
    wallet: mapWallet(walletRow as Row),
    transactions,
    adjustments: isAdmin ? ((adjustmentRows.data ?? []) as Row[]).map(mapAdjustment) : [],
    monthlyIn,
    monthlyOut,
  };
}

function mapAdjustment(row: Row): WalletAdjustment {
  return {
    id: text(row.id),
    walletId: text(row.wallet_id),
    actorId: text(row.actor_id),
    oldBalance: num(row.old_balance),
    newBalance: num(row.new_balance),
    delta: num(row.delta),
    reason: text(row.reason),
    createdAt: text(row.created_at),
  };
}

async function getPayoutSettings(): Promise<PayoutSettings> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payout_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) raise(error);
  if (!data) {
    return { retainedPct: 20, adminPct: 40, investorPct: 30, employeePct: 10, updatedAt: new Date().toISOString() };
  }
  return mapSettings(data as Row);
}

async function updatePayoutSettings(user: SessionUser, input: PayoutSettings): Promise<PayoutSettings> {
  if (user.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const sum = input.retainedPct + input.adminPct + input.investorPct + input.employeePct;
  if (Math.abs(sum - 100) > 0.01) throw new AppError("INVALID_ALLOCATION", "Total alokasi harus 100%.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_payout_settings", {
    p_retained: input.retainedPct,
    p_admin: input.adminPct,
    p_investor: input.investorPct,
    p_employee: input.employeePct,
  });
  if (error) raise(error);
  return getPayoutSettings();
}

async function previewPayout(
  user: SessionUser,
  start: string,
  end: string,
  allocations?: PayoutAllocations | null,
): Promise<PayoutPreview> {
  if (user.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("preview_payout", {
    p_start: start,
    p_end: end,
    p_allocations: allocations ?? null,
  });
  if (error) raise(error);
  const row = (data ?? {}) as Row;
  return {
    startDate: text(row.start_date),
    endDate: text(row.end_date),
    grossMargin: num(row.gross_margin),
    operatingExpense: num(row.operating_expense),
    netProfit: num(row.net_profit),
    allocations: mapAllocations(row.allocations),
    pools: {
      retained: num((row.pools as Row)?.retained),
      admin: num((row.pools as Row)?.admin),
      investor: num((row.pools as Row)?.investor),
      employee: num((row.pools as Row)?.employee),
    },
    retainedActual: num(row.retained_actual),
    items: ((row.items ?? []) as Row[]).map((item) => ({
      userId: text(item.user_id),
      fullName: text(item.full_name),
      role: (item.role as UserRole) ?? "investor",
      category: item.category as PayoutItem["category"],
      weightPct: num(item.weight_pct),
      amount: num(item.amount),
    })),
    warnings: ((row.warnings ?? []) as string[]).map(String),
  };
}

async function listPayouts(
  user: SessionUser,
  filters: { status?: string; year?: string; month?: string; page?: number; limit?: number } = {},
): Promise<Paginated<PayoutRecord>> {
  if (user.role !== "admin" && user.role !== "investor") {
    throw new AppError("FORBIDDEN", "Tidak punya akses.");
  }
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 25));

  if (user.role === "investor") {
    // RPC security definer memakai auth.uid() dari JWT user, jadi harus
    // dipanggil lewat client sesi (bukan service role).
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("list_investor_payouts", {
      p_status: filters.status ?? null,
      p_year: filters.year ? Number(filters.year) : null,
      p_month: filters.month ? Number(filters.month) : null,
      p_limit: limit,
      p_offset: (page - 1) * limit,
    });
    if (error) raise(error);
    const payload = (data ?? {}) as Row;
    const rows = ((payload.rows ?? []) as Row[]).map((row) => mapInvestorPayoutRecord(row, user));
    const total = num(payload.total);
    return {
      rows,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("payout_history").select("*", { count: "exact" });
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.year) query = query.gte("start_date", `${filters.year}-01-01`).lte("start_date", `${filters.year}-12-31`);
  if (filters.month) {
    const year = filters.year ?? String(new Date().getFullYear());
    const month = filters.month.padStart(2, "0");
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    query = query.gte("start_date", `${year}-${month}-01`).lte("start_date", `${year}-${month}-${lastDay}`);
  }
  query = query.order("created_at", { ascending: false }).range((page - 1) * limit, page * limit - 1);
  const { data, error, count } = await query;
  if (error) raise(error);
  const rows = (data ?? []) as Row[];
  const records = await Promise.all(rows.map((row) => mapPayoutRecord(supabase, row)));
  const total = count ?? rows.length;
  return {
    rows: records,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

async function getPayout(user: SessionUser, id: string): Promise<PayoutRecord | null> {
  if (user.role === "investor") {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_investor_payout", { p_id: id });
    if (error) raise(error);
    if (!data) return null;
    return mapInvestorPayoutRecord(data as Row, user);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("payout_history").select("*").eq("id", id).maybeSingle();
  if (error && (error as { code?: string }).code !== "PGRST116") raise(error);
  if (!data) return null;
  if (user.role !== "admin") return null;
  return mapPayoutRecord(supabase, data as Row);
}

async function executePayout(
  user: SessionUser,
  input: {
    startDate: string;
    endDate: string;
    walletId: string;
    allocations: PayoutAllocations;
    idempotencyKey: string;
  },
): Promise<PayoutRecord> {
  if (user.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  if (!input.idempotencyKey || input.idempotencyKey.trim().length < 8) {
    throw new AppError("VALIDATION_ERROR", "Idempotency key minimal 8 karakter.");
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("execute_payout", {
    p_start: input.startDate,
    p_end: input.endDate,
    p_wallet_id: input.walletId,
    p_allocations: input.allocations,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) raise(error);
  const id = text((data as Row)?.id);
  const record = id ? await getPayout(user, id) : null;
  if (!record) throw new AppError("INTERNAL_ERROR", "Payout tersimpan tetapi gagal dibaca.");
  return record;
}

async function getDashboardMetrics(user: SessionUser, start?: string, end?: string): Promise<DashboardMetrics> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_dashboard_metrics", {
    p_start: start ?? null,
    p_end: end ?? null,
  });
  if (error) raise(error);
  const row = (data ?? {}) as Row;
  const today = todayWib();
  const currentWeek = weekBounds(today);
  const closed = lastClosedWeek();
  const period = (row.period as Row | undefined) ?? { start: start ?? currentWeek.start, end: end ?? currentWeek.end };
  const mapRecent = (items: unknown): DashboardTransaction[] =>
    ((items ?? []) as Row[]).map((item) => ({
      id: text(item.id),
      tanggal: text(item.tanggal),
      tipe: item.tipe as DashboardTransaction["tipe"],
      kategori: text(item.kategori),
      nominal: num(item.nominal),
      description: text(item.keterangan),
      userName: item.user_name ? text(item.user_name) : undefined,
    }));
  const series = ((row.series ?? []) as Row[]).map((item) => ({
    date: text(item.date),
    income: num(item.income),
    expense: num(item.expense),
    profit: num(item.profit),
  }));
  const [series7Result, series30Result] = await Promise.all([
    supabase.rpc("dashboard_series", { p_days: 7 }),
    supabase.rpc("dashboard_series", { p_days: 30 }),
  ]);
  const mapSeries = (value: unknown) =>
    ((value ?? []) as Row[]).map((item) => ({
      date: text(item.date),
      income: num(item.income),
      expense: num(item.expense),
      profit: num(item.profit),
    }));
  const series7 = series7Result.error ? series : mapSeries(series7Result.data);
  const series30 = series30Result.error ? series7 : mapSeries(series30Result.data);

  if (user.role === "karyawan") {
    const mySeries = ((row.my_series_7d ?? []) as Row[]).map((item) => ({
      date: text(item.date),
      income: num(item.count),
      expense: 0,
      profit: 0,
    }));
    return {
      role: "karyawan",
      period: { start: text(period.start), end: text(period.end) },
      grossMargin: 0,
      operatingExpense: 0,
      netProfit: 0,
      totalAssets: 0,
      transactionCount: num(row.my_transaction_count_today),
      series: series7.length > 0 ? series7 : mySeries,
      series30: series30.length > 0 ? series30 : mySeries,
      recentTransactions: mapRecent(row.recent_transactions),
      payoutReady: false,
      payoutPeriod: closed,
      myTransactionCountToday: num(row.my_transaction_count_today),
      mySalesToday: num(row.my_sales_today),
      myProductsSoldToday: num(row.my_products_sold_today),
    };
  }

  if (user.role === "investor") {
    const grossMargin = num(row.gross_margin);
    const netProfit = num(row.net_profit);
    return {
      role: "investor",
      period: { start: text(period.start), end: text(period.end) },
      grossMargin,
      operatingExpense: Math.max(0, grossMargin - netProfit),
      netProfit,
      totalAssets: num(row.total_assets),
      transactionCount: 0,
      series: series7,
      series30,
      recentTransactions: [],
      payoutReady: false,
      payoutPeriod: closed,
      lastDividend: num(row.last_dividend),
      payoutHistoryMini: ((row.payout_history_mini ?? []) as Row[]).map((item) => ({
        id: text(item.id),
        startDate: text(item.start_date),
        endDate: text(item.end_date),
        grossMargin: 0,
        operatingExpense: 0,
        netProfit: 0,
        retainedEarnings: 0,
        totalDistributed: num(item.amount),
        walletId: "",
        status: "completed",
        allocations: { retained: 0, admin: 0, investor: 0, employee: 0 },
        createdBy: "",
        createdAt: text(item.start_date),
        items: [],
      })),
    };
  }

  return {
    role: "admin",
    period: { start: text(period.start), end: text(period.end) },
    grossMargin: num(row.gross_margin),
    operatingExpense: num(row.operating_expense),
    netProfit: num(row.net_profit),
    totalAssets: num(row.total_assets),
    transactionCount: num(row.transaction_count),
    series: series7,
    series30,
    recentTransactions: mapRecent(row.recent_transactions),
    payoutReady: Boolean(row.payout_ready),
    payoutPeriod: {
      start: text((row.payout_period as Row)?.start),
      end: text((row.payout_period as Row)?.end),
    },
    payoutReadyNetProfit: num(row.payout_ready_net_profit),
  };
}

async function listUsers(user: SessionUser): Promise<UserSummary[]> {
  if (user.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("users").select("*").order("full_name", { ascending: true });
  if (error) raise(error);
  return ((data ?? []) as Row[]).map(mapUser);
}

async function listAuditLogs(user: SessionUser): Promise<AuditLog[]> {
  if (user.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) raise(error);
  const rows = (data ?? []) as Row[];
  const { data: users } = await supabase.from("users").select("id,full_name");
  const userMap = new Map<string, string>();
  for (const item of (users ?? []) as Row[]) userMap.set(text(item.id), text(item.full_name));
  return rows.map((row) => ({
    id: text(row.id),
    tableName: text(row.table_name),
    recordId: text(row.record_id),
    action: text(row.action),
    actorId: text(row.actor_id),
    actorName: userMap.get(text(row.actor_id)),
    oldValues: row.old_values,
    newValues: row.new_values,
    createdAt: text(row.created_at),
  }));
}

async function getWalletAdjustments(user: SessionUser): Promise<WalletAdjustment[]> {
  if (user.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("wallet_adjustments")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) raise(error);
  return ((data ?? []) as Row[]).map(mapAdjustment);
}

async function auditAsAdmin(
  tableName: string,
  recordId: string,
  action: string,
  actorId: string,
  oldValues?: unknown,
  newValues?: unknown,
) {
  await supabaseAdmin.from("audit_logs").insert({
    table_name: tableName,
    record_id: recordId,
    action,
    old_values: oldValues ?? null,
    new_values: newValues ?? null,
    actor_id: actorId,
  });
}

/* ── Writes ────────────────────────────────────────────────────── */

async function upsertProduct(
  actor: SessionUser,
  input: {
    id?: string;
    nama: string;
    operator: string;
    hargaBeli: number;
    hargaJual: number;
    isActive?: boolean;
  },
): Promise<Product> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("upsert_product", {
    p_id: input.id ?? null,
    p_nama: input.nama,
    p_operator: input.operator,
    p_harga_beli: input.hargaBeli,
    p_harga_jual: input.hargaJual,
  });
  if (error) raise(error);
  const id = text((data as Row)?.id);
  if (input.isActive !== undefined) {
    const current = await getProduct(actor, id);
    if (current && current.isActive !== input.isActive) {
      await supabase.rpc("toggle_product", { p_id: id, p_is_active: input.isActive });
    }
  }
  const product = await getProduct(actor, id);
  if (!product) throw new AppError("INTERNAL_ERROR", "Produk tersimpan tetapi gagal dibaca.");
  return product;
}

async function changeProductPrices(
  actor: SessionUser,
  input: {
    ids: string[];
    mode: "percent" | "nominal";
    jual: number;
    beli: number;
    effectiveFrom: string;
    rounding: "none" | "100" | "500" | "1000";
  },
): Promise<{ updated: number; products: Product[] }> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("change_product_prices", {
    p_ids: input.ids,
    p_mode: input.mode,
    p_jual: input.jual,
    p_beli: input.beli,
    p_effective_from: input.effectiveFrom,
    p_rounding: input.rounding,
  });
  if (error) raise(error);
  const products = (
    await Promise.all(input.ids.map((id) => getProduct(actor, id)))
  ).filter((product): product is Product => Boolean(product));
  return { updated: num((data as Row)?.updated) || products.length, products };
}

async function toggleProduct(actor: SessionUser, id: string, isActive: boolean): Promise<Product> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("toggle_product", { p_id: id, p_is_active: isActive });
  if (error) raise(error);
  const product = await getProduct(actor, id);
  if (!product) throw new AppError("NOT_FOUND", "Produk tidak ditemukan.");
  return product;
}

async function archiveProducts(actor: SessionUser, ids: string[]): Promise<{ archived: number }> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("archive_products", { p_ids: ids });
  if (error) raise(error);
  return { archived: num((data as Row)?.archived) };
}

async function restoreProducts(actor: SessionUser, ids: string[]): Promise<{ restored: number }> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("restore_products", { p_ids: ids });
  if (error) raise(error);
  return { restored: num((data as Row)?.restored) };
}

async function createSales(
  user: SessionUser,
  input: {
    items: { productId: string; qty: number }[];
    tanggal?: string;
    description?: string;
    clientRequestId: string;
    walletId?: string | null;
    sourceWalletId?: string | null;
    sourceCost?: number | null;
  },
): Promise<TransactionDetail[]> {
  if (user.role !== "admin" && user.role !== "karyawan") {
    throw new AppError("FORBIDDEN", "Role ini tidak bisa mencatat penjualan.");
  }
  const supabase = await createSupabaseServerClient();
  // Karyawan selalu memakai wallet default; hanya admin yang boleh memilih.
  const walletId = user.role === "admin" ? input.walletId ?? null : null;
  const { data, error } = await supabase.rpc("create_sales", {
    p_items: input.items.map((item) => ({ product_id: item.productId, qty: item.qty })),
    p_keterangan: input.description ?? null,
    p_tanggal: dateOnly(input.tanggal),
    p_batch_id: input.clientRequestId,
    p_source_wallet_id: input.sourceWalletId ?? null,
    p_source_cost: input.sourceCost ?? null,
    p_wallet_id: walletId,
  });
  if (error) raise(error);
  const rows = (data ?? []) as Row[];
  const ids = rows.map((row) => text(row.id));
  const txRows = await getTxRowsByIds(supabase, ids);
  const mapped = await mapTransactions(supabase, txRows, user.role === "admin");
  const byId = new Map(mapped.map((tx) => [tx.id, tx]));
  return ids.map((id) => byId.get(id)).filter((tx): tx is TransactionDetail => Boolean(tx));
}

async function createExpense(
  user: SessionUser,
  input: {
    tanggal: string;
    kategori: "operasional" | "gaji" | "deviden" | "lainnya";
    nominal: number;
    walletId?: string;
    description: string;
    clientRequestId?: string;
  },
): Promise<TransactionDetail> {
  if (user.role !== "admin" && user.role !== "karyawan") {
    throw new AppError("FORBIDDEN", "Role ini tidak bisa mencatat pengeluaran.");
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_expense", {
    p_wallet_id: user.role === "admin" ? input.walletId ?? null : null,
    p_nominal: input.nominal,
    p_kategori: input.kategori,
    p_keterangan: input.description,
    p_tanggal: dateOnly(input.tanggal),
    p_client_request_id: input.clientRequestId ?? null,
  });
  if (error) raise(error);
  const id = text((data as Row)?.id);
  const detail = await getTransactionDetail(user, id);
  if (!detail) throw new AppError("INTERNAL_ERROR", "Transaksi tersimpan tetapi gagal dibaca.");
  return detail;
}

async function transferWallet(
  actor: SessionUser,
  input: {
    fromWalletId: string;
    toWalletId: string;
    tanggal: string;
    nominal: number;
    description: string;
    clientRequestId: string;
  },
): Promise<TransactionSafe> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  if (input.tanggal > todayWib()) {
    throw new AppError("VALIDATION_ERROR", "Tanggal transfer tidak boleh melewati hari ini.");
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("transfer_wallet", {
    p_from_id: input.fromWalletId,
    p_to_id: input.toWalletId,
    p_nominal: input.nominal,
    p_keterangan: input.description,
    p_client_request_id: input.clientRequestId,
    p_tanggal: input.tanggal,
  });
  if (error) raise(error);
  const id = text((data as Row)?.id);
  const detail = await getTransactionDetail(actor, id);
  if (!detail) throw new AppError("INTERNAL_ERROR", "Transfer tersimpan tetapi gagal dibaca.");
  return toSafeTransaction(detail);
}

async function voidTransaction(user: SessionUser, id: string, reason: string): Promise<TransactionDetail> {
  if (user.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin yang bisa membatalkan transaksi.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("void_transaction", {
    p_transaction_id: id,
    p_reason: reason,
  });
  if (error) raise(error);
  const detail = await getTransactionDetail(user, id);
  if (!detail) throw new AppError("INTERNAL_ERROR", "Transaksi dibatalkan tetapi gagal dibaca.");
  return detail;
}

async function updateTransaction(
  actor: SessionUser,
  input: {
    id: string;
    tanggal: string;
    description?: string;
    productId?: string;
    qty?: number;
    nominal?: number;
    kategori?: "operasional" | "gaji" | "deviden" | "lainnya";
    fromWalletId?: string;
    toWalletId?: string;
    sourceWalletId?: string | null;
    /** true = wallet sumber diubah secara eksplisit (termasuk reset ke tanpa wallet sumber). */
    sourceWalletChanged?: boolean;
    sourceCost?: number | null;
  },
): Promise<TransactionSafe> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin yang bisa mengubah transaksi.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_transaction", {
    p_id: input.id,
    p_tanggal: dateOnly(input.tanggal),
    p_keterangan: input.description ?? null,
    p_product_id: input.productId ?? null,
    p_qty: input.qty ?? null,
    p_nominal: input.nominal ?? null,
    p_kategori: input.kategori ?? null,
    p_from_wallet_id: input.fromWalletId ?? null,
    p_to_wallet_id: input.toWalletId ?? null,
    // null artinya "jangan ubah" kecuali sourceWalletChanged = true,
    // yang dipakai untuk reset ke tanpa wallet sumber.
    p_source_wallet_id: input.sourceWalletChanged ? input.sourceWalletId ?? null : null,
    p_source_wallet_changed: Boolean(input.sourceWalletChanged),
    p_source_cost: input.sourceCost ?? null,
  });
  if (error) raise(error);
  const detail = await getTransactionDetail(actor, input.id);
  if (!detail) throw new AppError("INTERNAL_ERROR", "Transaksi diperbarui tetapi gagal dibaca.");
  return toSafeTransaction(detail);
}

async function deleteTransactions(actor: SessionUser, ids: string[]): Promise<{ deleted: number }> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin yang bisa menghapus transaksi.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("delete_transactions", { p_ids: ids });
  if (error) raise(error);
  return { deleted: num((data as Row)?.deleted) };
}

/* ── Stok voucher ──────────────────────────────────────────────── */

function mapVoucher(row: Row, maps: Awaited<ReturnType<typeof lookups>>): VoucherStock {
  const hargaBeli = num(row.harga_beli);
  const hargaJual = num(row.harga_jual);
  const productId = text(row.product_id);
  return {
    id: text(row.id),
    kode: text(row.kode_voucher),
    productId,
    productName: maps.productMap.get(productId) ?? null,
    walletId: text(row.wallet_id),
    walletName: maps.walletMap.get(text(row.wallet_id)) ?? null,
    status: (row.status as VoucherStock["status"]) ?? "available",
    hargaBeli,
    hargaJual,
    margin: hargaJual - hargaBeli,
    originTransactionId: row.origin_transaction_id ? text(row.origin_transaction_id) : null,
    saleTransactionId: row.sale_transaction_id ? text(row.sale_transaction_id) : null,
    convertedByName: row.converted_by ? maps.userMap.get(text(row.converted_by)) ?? null : null,
    convertedAt: text(row.converted_at),
    soldAt: row.sold_at ? text(row.sold_at) : null,
    soldByName: row.sold_by ? maps.userMap.get(text(row.sold_by)) ?? null : null,
  };
}

async function previewVoucherConversion(
  user: SessionUser,
  ids: string[],
): Promise<VoucherPreviewRow[]> {
  if (user.role !== "admin" && user.role !== "karyawan") {
    throw new AppError("FORBIDDEN", "Role ini tidak bisa mengonversi voucher.");
  }
  if (ids.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("voucher_convert_preview", { p_ids: ids });
  if (error) raise(error);
  return ((data ?? []) as Row[]).map((row) => ({
    transactionId: text(row.transaction_id),
    productId: row.product_id ? text(row.product_id) : null,
    productName: text(row.product_name) || null,
    tanggal: text(row.tanggal),
    nominal: num(row.nominal),
    unitCost: num(row.unit_cost),
    hargaJual: num(row.harga_jual),
    qty: row.qty == null ? 0 : num(row.qty),
    walletId: text(row.wallet_id),
    walletName: text(row.wallet_name) || null,
    sourceWalletId: row.source_wallet_id ? text(row.source_wallet_id) : null,
    sourceWalletName: text(row.source_wallet_name) || null,
    eligible: Boolean(row.eligible),
    reason: text(row.reason) || null,
  }));
}

async function convertSalesToVouchers(
  user: SessionUser,
  input: {
    items: { transactionId: string; kodes: string[] }[];
    walletId: string;
    clientRequestId: string;
    tanggal: string;
  },
): Promise<VoucherConversionResult> {
  if (user.role !== "admin" && user.role !== "karyawan") {
    throw new AppError("FORBIDDEN", "Role ini tidak bisa mengonversi voucher.");
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("convert_sales_to_vouchers", {
    p_items: input.items.map((item) => ({
      transaction_id: item.transactionId,
      kodes: item.kodes.map((kode) => kode.trim()),
    })),
    p_wallet_id: input.walletId,
    p_client_request_id: input.clientRequestId,
    p_tanggal: dateOnly(input.tanggal),
  });
  if (error) raise(error);
  const row = (data ?? {}) as Row;
  const vouchers = Array.isArray(row.vouchers) ? (row.vouchers as Row[]) : [];
  return {
    duplicate: Boolean(row.duplicate),
    totalCost: num(row.total_cost),
    vouchers: vouchers.map((item) => ({
      id: text(item.id),
      kode: text(item.kode),
      productId: text(item.product_id),
      productName: text(item.product_name) || null,
      walletName: text(item.wallet_name) || null,
      hargaBeli: num(item.harga_beli),
      hargaJual: num(item.harga_jual),
    })),
  };
}

async function listVouchers(
  user: SessionUser,
  filters: {
    status?: string;
    productId?: string;
    q?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<Paginated<VoucherStock>> {
  if (user.role !== "admin" && user.role !== "karyawan") {
    throw new AppError("FORBIDDEN", "Role ini tidak bisa melihat stok voucher.");
  }
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 25));
  let query = supabase.from("voucher_stocks").select("*", { count: "exact" });

  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.productId) query = query.eq("product_id", filters.productId);
  if (filters.q) {
    const term = filters.q.replace(/[,()]/g, " ");
    const maps = await lookups(supabase);
    const productIds = Array.from(maps.productMap.entries())
      .filter(([, nama]) => nama.toLowerCase().includes(term.toLowerCase()))
      .map(([id]) => id);
    const parts = [`kode_voucher.ilike.%${term}%`];
    if (productIds.length > 0) parts.push(`product_id.in.(${productIds.join(",")})`);
    query = query.or(parts.join(","));
  }
  query = query
    .order("converted_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await query;
  if (error) raise(error);
  const rows = (data ?? []) as Row[];
  const maps = await lookups(supabase);
  const total = count ?? rows.length;
  return {
    rows: rows.map((row) => mapVoucher(row, maps)),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

async function getVoucherSummary(user: SessionUser) {
  if (user.role !== "admin" && user.role !== "karyawan") {
    throw new AppError("FORBIDDEN", "Role ini tidak bisa melihat stok voucher.");
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("voucher_stocks")
    .select("harga_beli")
    .eq("status", "available");
  if (error) raise(error);
  const available = ((data ?? []) as Row[]).map((row) => num(row.harga_beli));
  return {
    available: available.length,
    totalCost: available.reduce((sum, value) => sum + value, 0),
  };
}

async function getVoucherByTransaction(
  user: SessionUser,
  transactionId: string,
): Promise<{ id: string; kode: string; status: "available" | "sold" | "void" } | null> {
  if (user.role !== "admin" && user.role !== "karyawan") return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("voucher_stocks")
    .select("id,kode_voucher,status")
    .eq("sale_transaction_id", transactionId)
    .maybeSingle();
  if (error) raise(error);
  if (!data) return null;
  const row = data as Row;
  return {
    id: text(row.id),
    kode: text(row.kode_voucher),
    status: (row.status as "available" | "sold" | "void") ?? "sold",
  };
}

async function sellVoucher(
  user: SessionUser,
  input: { id: string; walletId?: string; tanggal?: string },
): Promise<VoucherSaleResult> {
  if (user.role !== "admin" && user.role !== "karyawan") {
    throw new AppError("FORBIDDEN", "Role ini tidak bisa menjual voucher.");
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("sell_voucher", {
    p_voucher_id: input.id,
    p_wallet_id: user.role === "admin" ? input.walletId ?? null : null,
    p_tanggal: dateOnly(input.tanggal),
  });
  if (error) raise(error);
  const row = (data ?? {}) as Row;
  return {
    duplicate: Boolean(row.duplicate),
    voucherId: text(row.voucher_id),
    kode: text(row.kode),
    transactionId: text(row.transaction_id),
    nominal: num(row.nominal),
    margin: num(row.margin),
    walletName: text(row.wallet_name) || null,
  };
}

async function updateVoucher(
  user: SessionUser,
  input: {
    id: string;
    kode: string;
    productId: string;
    walletId: string;
    hargaBeli: number;
    hargaJual: number;
    tanggal: string;
  },
): Promise<VoucherStock> {
  if (user.role !== "admin") {
    throw new AppError("FORBIDDEN", "Hanya admin yang bisa mengedit voucher.");
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("update_voucher_stock", {
    p_id: input.id,
    p_kode: input.kode,
    p_product_id: input.productId,
    p_wallet_id: input.walletId,
    p_harga_beli: input.hargaBeli,
    p_harga_jual: input.hargaJual,
    p_tanggal: dateOnly(input.tanggal),
  });
  if (error) raise(error);
  const { data: row, error: readError } = await supabase
    .from("voucher_stocks")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (readError) raise(readError);
  if (!row) throw new AppError("NOT_FOUND", "Voucher tidak ditemukan.");
  void data;
  const maps = await lookups(supabase);
  return mapVoucher(row as Row, maps);
}

async function createWallet(
  actor: SessionUser,
  input: { nama: string; tipe: "cash" | "bank" | "digital"; saldoAwal: number; isDefault?: boolean },
): Promise<Wallet> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_wallet", {
    p_nama: input.nama,
    p_tipe: input.tipe,
    p_saldo_awal: input.saldoAwal,
    p_is_default: input.isDefault ?? false,
  });
  if (error) raise(error);
  const walletId = text((data as Row)?.id);
  if (walletId) {
    const { data: defaultRow } = await supabase
      .from("wallets")
      .select("id")
      .eq("is_default", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (!defaultRow) {
      await supabaseAdmin.from("wallets").update({ is_default: true }).eq("id", walletId);
    }
  }
  const { data: row, error: readError } = await supabase
    .from("wallets")
    .select("*")
    .eq("id", walletId)
    .maybeSingle();
  if (readError) raise(readError);
  if (!row) throw new AppError("INTERNAL_ERROR", "Wallet tersimpan tetapi gagal dibaca.");
  return mapWallet(row as Row);
}

async function updateWallet(
  actor: SessionUser,
  input: { id: string; nama: string; tipe: "cash" | "bank" | "digital"; saldo?: number; isDefault?: boolean },
): Promise<Wallet> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_wallet", {
    p_id: input.id,
    p_nama: input.nama,
    p_tipe: input.tipe,
    p_is_default: input.isDefault ?? false,
  });
  if (error) raise(error);
  if (input.saldo !== undefined) {
    const { data: current, error: readError } = await supabase
      .from("wallets")
      .select("saldo")
      .eq("id", input.id)
      .maybeSingle();
    if (readError) raise(readError);
    if (current && num((current as Row).saldo) !== input.saldo) {
      const { error: adjustError } = await supabase.rpc("adjust_wallet_balance", {
        p_wallet_id: input.id,
        p_new_balance: input.saldo,
        p_reason: "Penyesuaian dari form edit wallet",
      });
      if (adjustError) raise(adjustError);
    }
  }
  const { data: row, error: readError } = await supabase
    .from("wallets")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (readError) raise(readError);
  if (!row) throw new AppError("NOT_FOUND", "Wallet tidak ditemukan.");
  return mapWallet(row as Row);
}

async function toggleWallet(actor: SessionUser, id: string, isActive: boolean): Promise<Wallet> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("toggle_wallet", { p_id: id, p_is_active: isActive });
  if (error) raise(error);
  const { data, error: readError } = await supabase
    .from("wallets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readError) raise(readError);
  if (!data) throw new AppError("NOT_FOUND", "Wallet tidak ditemukan.");
  return mapWallet(data as Row);
}

async function deleteWallet(
  actor: SessionUser,
  id: string,
): Promise<{ deleted: true; defaultWalletName: string | null }> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("delete_wallet", { p_id: id });
  if (error) raise(error);
  const row = (data ?? {}) as Row;
  return {
    deleted: true,
    defaultWalletName: row.defaultWalletName ? text(row.defaultWalletName) : null,
  };
}

async function applyWalletAdjustment(
  actor: SessionUser,
  walletId: string,
  newBalance: number,
  reason: string,
): Promise<Wallet> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  if (!Number.isInteger(newBalance) || newBalance < 0) {
    throw new AppError("VALIDATION_ERROR", "Saldo baru harus ≥ 0.");
  }
  if (reason.trim().length < 10) {
    throw new AppError("VALIDATION_ERROR", "Alasan minimal 10 karakter.");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("adjust_wallet_balance", {
    p_wallet_id: walletId,
    p_new_balance: newBalance,
    p_reason: reason,
  });
  if (error) raise(error);
  const { data, error: readError } = await supabase
    .from("wallets")
    .select("*")
    .eq("id", walletId)
    .maybeSingle();
  if (readError) raise(readError);
  if (!data) throw new AppError("NOT_FOUND", "Wallet tidak ditemukan.");
  return mapWallet(data as Row);
}

/* ── Users & profil ────────────────────────────────────────────── */

async function countActiveAdmins(excludeIds: string[] = []): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true)
    .is("deleted_at", null);
  if (error) raise(error);
  return ((data ?? []) as Row[]).filter((row) => !excludeIds.includes(text(row.id))).length;
}

async function createUser(
  actor: SessionUser,
  input: {
    email: string;
    password: string;
    fullName: string;
    role: UserRole;
    defaultProfitShare: number;
  },
): Promise<UserSummary> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const email = input.email.trim().toLowerCase();
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existing) throw new AppError("CONFLICT", "Email sudah terdaftar.");

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName,
      role: input.role,
      default_profit_share: input.defaultProfitShare,
    },
  });
  if (error) {
    if (
      (error as { code?: string }).code === "email_exists" ||
      error.message.toLowerCase().includes("already")
    ) {
      throw new AppError("CONFLICT", "Email sudah terdaftar.");
    }
    throw new AppError("INTERNAL_ERROR", "Gagal membuat akun pengguna.");
  }
  const id = data.user?.id;
  if (!id) throw new AppError("INTERNAL_ERROR", "Akun dibuat tanpa profil pengguna.");

  const { data: row, error: readError } = await supabaseAdmin
    .from("users")
    .update({
      full_name: input.fullName,
      role: input.role,
      default_profit_share: input.defaultProfitShare,
      is_active: true,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (readError) {
    await supabaseAdmin.auth.admin.deleteUser(id, true);
    raise(readError);
  }
  if (!row) {
    await supabaseAdmin.auth.admin.deleteUser(id, true);
    throw new AppError("INTERNAL_ERROR", "Profil pengguna gagal dibuat.");
  }
  await auditAsAdmin("users", id, "create", actor.id, null, {
    email,
    role: input.role,
    fullName: input.fullName,
  });
  return mapUser(row as Row);
}

async function updateUser(
  actor: SessionUser,
  input: {
    id: string;
    fullName: string;
    role: UserRole;
    defaultProfitShare: number;
    isActive: boolean;
    password?: string;
  },
): Promise<UserSummary> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const { data: target, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (error) raise(error);
  if (!target) throw new AppError("NOT_FOUND", "User tidak ditemukan.");
  const row = target as Row;
  if (row.deleted_at) throw new AppError("NOT_FOUND", "User tidak ditemukan.");
  if (
    row.role === "admin" &&
    row.is_active &&
    (input.role !== "admin" || !input.isActive) &&
    (await countActiveAdmins([input.id])) === 0
  ) {
    throw new AppError("CONFLICT", "Admin terakhir tidak boleh diturunkan atau dinonaktifkan.");
  }
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("users")
    .update({
      full_name: input.fullName,
      role: input.role,
      default_profit_share: input.defaultProfitShare,
      is_active: input.isActive,
    })
    .eq("id", input.id)
    .select("*")
    .maybeSingle();
  if (updateError) raise(updateError);
  if (!updated) throw new AppError("NOT_FOUND", "User tidak ditemukan.");

  if (input.password) {
    const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(input.id, {
      password: input.password,
    });
    if (passwordError) {
      throw new AppError("INTERNAL_ERROR", "Profil tersimpan, tetapi password gagal diubah.");
    }
  }

  await auditAsAdmin("users", input.id, "update", actor.id, {
    role: row.role,
    fullName: row.full_name,
    defaultProfitShare: num(row.default_profit_share),
    isActive: row.is_active,
  }, {
    role: input.role,
    fullName: input.fullName,
    defaultProfitShare: input.defaultProfitShare,
    isActive: input.isActive,
    passwordChanged: Boolean(input.password),
  });
  return mapUser(updated as Row);
}

async function toggleUser(actor: SessionUser, id: string, isActive: boolean): Promise<UserSummary> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  if (actor.id === id && !isActive) {
    throw new AppError("CONFLICT", "Anda tidak bisa menonaktifkan akun sendiri.");
  }
  const { data: target, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) raise(error);
  if (!target) throw new AppError("NOT_FOUND", "User tidak ditemukan.");
  const row = target as Row;
  if (row.deleted_at) throw new AppError("NOT_FOUND", "User tidak ditemukan.");
  if (row.role === "admin" && row.is_active && !isActive && (await countActiveAdmins([id])) === 0) {
    throw new AppError("CONFLICT", "Admin terakhir tidak boleh dinonaktifkan.");
  }
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("users")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (updateError) raise(updateError);
  if (!updated) throw new AppError("NOT_FOUND", "User tidak ditemukan.");
  await auditAsAdmin("users", id, isActive ? "activate" : "deactivate", actor.id, null, { isActive });
  return mapUser(updated as Row);
}

async function deleteUsers(actor: SessionUser, ids: string[]): Promise<{ deleted: number }> {
  if (actor.role !== "admin") throw new AppError("FORBIDDEN", "Hanya admin.");
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.includes(actor.id)) {
    throw new AppError("CONFLICT", "Anda tidak bisa menghapus akun sendiri.");
  }
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .in("id", uniqueIds)
    .is("deleted_at", null);
  if (error) raise(error);
  const targets = (data ?? []) as Row[];
  if (targets.length === 0) throw new AppError("NOT_FOUND", "Pengguna tidak ditemukan.");
  const remainingAdmins = await countActiveAdmins(uniqueIds);
  if (targets.some((row) => row.role === "admin" && row.is_active) && remainingAdmins === 0) {
    throw new AppError("CONFLICT", "Admin terakhir tidak boleh dihapus. Tambahkan admin lain dulu.");
  }

  let deleted = 0;
  for (const target of targets) {
    const id = text(target.id);
    const deletedAt = new Date().toISOString();
    // Soft delete profil: baris tetap ada agar foreign key riwayat tidak rusak.
    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({ deleted_at: deletedAt, is_active: false })
      .eq("id", id)
      .is("deleted_at", null);
    if (updateError) raise(updateError);

    // Soft delete akun auth agar tidak bisa login lagi. Akun auth yang sudah
    // terhapus sebelumnya dianggap berhasil.
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id, true);
    if (authError && (authError as { code?: string }).code !== "user_not_found") {
      // Kembalikan profil supaya admin bisa mencoba lagi.
      await supabaseAdmin
        .from("users")
        .update({ deleted_at: null, is_active: target.is_active })
        .eq("id", id);
      raise(authError, "Gagal menonaktifkan akun login pengguna.");
    }

    await auditAsAdmin("users", id, "delete", actor.id, {
      email: target.email,
      fullName: target.full_name,
      role: target.role,
      isActive: target.is_active,
      defaultProfitShare: num(target.default_profit_share),
    }, { deletedAt, isActive: false });
    deleted += 1;
  }
  return { deleted };
}

async function updateProfile(
  user: SessionUser,
  input: { fullName: string; avatarUrl?: string | null },
): Promise<SessionUser> {
  if (input.fullName.length < 2 || input.fullName.length > 60) {
    throw new AppError("VALIDATION_ERROR", "Nama harus 2–60 karakter.");
  }
  const supabase = await createSupabaseServerClient();
  const patch: Row = { full_name: input.fullName };
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
  const { data, error } = await supabase.from("users").update(patch).eq("id", user.id).select("*").maybeSingle();
  if (error) raise(error);
  if (!data) throw new AppError("NOT_FOUND", "User tidak ditemukan.");
  return mapUser(data as Row);
}

async function updateTheme(user: SessionUser, theme: "light" | "dark" | "system"): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("users").update({ theme }).eq("id", user.id);
  if (error) raise(error);
}

async function updateNotification(user: SessionUser, enabled: boolean): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("users")
    .update({ notification_payout: enabled })
    .eq("id", user.id);
  if (error) raise(error);
}

async function changePassword(
  user: SessionUser,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    throw new AppError("VALIDATION_ERROR", "Password minimal 8 karakter, kombinasi huruf dan angka.");
  }
  const supabase = await createSupabaseServerClient();
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) throw new AppError("VALIDATION_ERROR", "Password lama tidak sesuai.");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new AppError("VALIDATION_ERROR", error.message);
}

async function setAvatar(user: SessionUser, avatarUrl: string | null): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("users").update({ avatar_url: avatarUrl }).eq("id", user.id);
  if (error) raise(error);
}

export const supabaseRepository: DataRepository = {
  listProductPrices,
  listTransactions,
  getTransactionDetail,
  listProducts,
  listAllProducts,
  getProduct,
  listWallets,
  listWalletOptions,
  listActiveWalletsForTransactions,
  getDefaultWalletLabel,
  hasActiveWallet,
  getWalletDetail,
  updatePayoutSettings,
  getPayoutSettings,
  previewPayout,
  listPayouts,
  getPayout,
  executePayout,
  getDashboardMetrics,
  listUsers,
  createUser,
  updateUser,
  toggleUser,
  deleteUsers,
  updateProfile,
  updateTheme,
  updateNotification,
  changePassword,
  setAvatar,
  listAuditLogs,
  getWalletAdjustments,
  applyWalletAdjustment,
  createSales,
  createExpense,
  voidTransaction,
  updateTransaction,
  deleteTransactions,
  previewVoucherConversion,
  convertSalesToVouchers,
  listVouchers,
  getVoucherSummary,
  getVoucherByTransaction,
  sellVoucher,
  updateVoucher,
  upsertProduct,
  changeProductPrices,
  toggleProduct,
  archiveProducts,
  restoreProducts,
  createWallet,
  updateWallet,
  toggleWallet,
  deleteWallet,
  transferWallet,
};
