export type UserRole = "admin" | "karyawan" | "investor";
export type WalletType = "cash" | "bank" | "digital";
export type TransactionType = "income" | "expense" | "transfer" | "payout";
export type TransactionStatus = "active" | "void";
export type PayoutStatus = "processing" | "completed" | "failed";
export type PayoutCategory =
  | "admin_dividend"
  | "investor_dividend"
  | "employee_commission";
export type ThemeMode = "light" | "dark" | "system";
export type VoucherStatus = "available" | "sold" | "void";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  avatarUrl?: string | null;
  defaultProfitShare: number;
  theme: ThemeMode;
  notificationPayout: boolean;
}

export interface UserSummary extends SessionUser {
  createdAt: string;
  lastSeenAt?: string | null;
  deletedAt?: string | null;
}

export interface Product {
  id: string;
  nama: string;
  operator: string;
  hargaJual: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
  hargaBeli?: number;
}

export interface ProductPrice {
  id: string;
  productId: string;
  /** Tanggal efektif (YYYY-MM-DD, WIB). */
  effectiveFrom: string;
  hargaBeli: number;
  hargaJual: number;
  createdAt: string;
  createdBy: string;
}

export interface Wallet {
  id: string;
  nama: string;
  tipe: WalletType;
  saldo: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface TransactionSafe {
  id: string;
  tanggal: string;
  tipe: TransactionType;
  kategori: string;
  nominal: number;
  qty: number | null;
  unitPrice: number | null;
  walletId: string;
  walletName?: string;
  destinationWalletId?: string | null;
  destinationWalletName?: string | null;
  sourceWalletId?: string | null;
  sourceWalletName?: string | null;
  sourceCost?: number | null;
  productId?: string | null;
  productName?: string | null;
  userId: string;
  userName?: string;
  description: string;
  status: TransactionStatus;
  reversalOf?: string | null;
  payoutId?: string | null;
  importBatchId?: string | null;
  createdAt: string;
}

export interface TransactionDetail extends TransactionSafe {
  unitCost?: number | null;
  margin?: number | null;
  sourceCost?: number | null;
}

export interface PayoutSettings {
  retainedPct: number;
  adminPct: number;
  investorPct: number;
  employeePct: number;
  updatedAt: string;
}

export interface PayoutAllocations {
  retained: number;
  admin: number;
  investor: number;
  employee: number;
}

export interface PayoutItem {
  id: string;
  payoutId: string;
  userId: string;
  userName: string;
  role: UserRole;
  category: PayoutCategory;
  weightPct: number;
  amount: number;
  transactionId: string;
}

export interface PayoutRecord {
  id: string;
  startDate: string;
  endDate: string;
  grossMargin: number;
  operatingExpense: number;
  netProfit: number;
  retainedEarnings: number;
  totalDistributed: number;
  walletId: string;
  walletName?: string;
  status: PayoutStatus;
  allocations: PayoutAllocations;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  completedAt?: string | null;
  items: PayoutItem[];
}

export interface PayoutPreviewItem {
  userId: string;
  fullName: string;
  role: UserRole;
  category: PayoutCategory;
  weightPct: number;
  amount: number;
}

export interface PayoutPreview {
  startDate: string;
  endDate: string;
  grossMargin: number;
  operatingExpense: number;
  netProfit: number;
  allocations: PayoutAllocations;
  pools: {
    retained: number;
    admin: number;
    investor: number;
    employee: number;
  };
  retainedActual: number;
  items: PayoutPreviewItem[];
  warnings: string[];
}

export interface DashboardTransaction {
  id: string;
  tanggal: string;
  tipe: TransactionType;
  kategori: string;
  nominal: number;
  description: string;
  userName?: string;
}

export interface DashboardMetrics {
  role: UserRole;
  period: { start: string; end: string };
  grossMargin: number;
  operatingExpense: number;
  netProfit: number;
  totalAssets: number;
  transactionCount: number;
  series: { date: string; income: number; expense: number; profit: number }[];
  series30?: { date: string; income: number; expense: number; profit: number }[];
  recentTransactions: DashboardTransaction[];
  payoutReady: boolean;
  payoutPeriod: { start: string; end: string };
  payoutReadyNetProfit?: number;
  myTransactionCountToday?: number;
  mySalesToday?: number;
  myProductsSoldToday?: number;
  lastDividend?: number;
  payoutHistoryMini?: PayoutRecord[];
}

export interface ActionResult<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
  };
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditLog {
  id: string;
  tableName: string;
  recordId: string;
  action: string;
  actorId: string;
  actorName?: string;
  oldValues?: unknown;
  newValues?: unknown;
  createdAt: string;
}

export interface WalletAdjustment {
  id: string;
  walletId: string;
  actorId: string;
  oldBalance: number;
  newBalance: number;
  delta: number;
  reason: string;
  createdAt: string;
}

export interface VoucherStock {
  id: string;
  kode: string;
  productId: string;
  productName?: string | null;
  walletId: string;
  walletName?: string | null;
  status: VoucherStatus;
  hargaBeli: number;
  hargaJual: number;
  margin: number;
  originTransactionId?: string | null;
  saleTransactionId?: string | null;
  convertedByName?: string | null;
  convertedAt: string;
  soldAt?: string | null;
  soldByName?: string | null;
}

export interface VoucherPreviewRow {
  transactionId: string;
  productId?: string | null;
  productName?: string | null;
  tanggal: string;
  nominal: number;
  unitCost: number;
  hargaJual: number;
  qty: number;
  walletId: string;
  walletName?: string | null;
  sourceWalletId?: string | null;
  sourceWalletName?: string | null;
  eligible: boolean;
  reason?: string | null;
}

export interface VoucherConversionResult {
  duplicate: boolean;
  totalCost: number;
  vouchers: {
    id: string;
    kode: string;
    productId: string;
    productName?: string | null;
    walletName?: string | null;
    hargaBeli: number;
    hargaJual: number;
  }[];
}

export interface VoucherSaleResult {
  duplicate: boolean;
  voucherId: string;
  kode: string;
  transactionId: string;
  nominal: number;
  margin: number;
  walletName?: string | null;
}
