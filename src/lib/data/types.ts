import type {
  AuditLog,
  DashboardMetrics,
  Paginated,
  PayoutAllocations,
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

export interface VoucherFilters {
  status?: string;
  productId?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface TransactionFilters {
  type?: string;
  from?: string;
  to?: string;
  walletId?: string;
  userId?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface DataRepository {
  listProductPrices(productIds?: string[]): Promise<ProductPrice[]>;
  listTransactions(user: SessionUser, filters?: TransactionFilters): Promise<Paginated<TransactionSafe>>;
  getTransactionDetail(user: SessionUser, id: string): Promise<TransactionDetail | null>;

  listProducts(
    user: SessionUser,
    filters?: { q?: string; operator?: string; page?: number; limit?: number; archived?: boolean },
  ): Promise<Paginated<Product>>;
  listAllProducts(
    user: SessionUser,
    filters?: { q?: string; operator?: string },
  ): Promise<Product[]>;
  getProduct(user: SessionUser, id: string): Promise<Product | null>;

  listWallets(user: SessionUser): Promise<{ wallets: Wallet[]; totalAssets: number }>;
  listWalletOptions(user: SessionUser): Promise<{ id: string; nama: string; isDefault: boolean }[]>;
  listActiveWalletsForTransactions(user: SessionUser): Promise<{ id: string; nama: string; saldo: number }[]>;
  getDefaultWalletLabel(): Promise<string>;
  hasActiveWallet(): Promise<boolean>;
  getWalletDetail(user: SessionUser, id: string): Promise<{
    wallet: Wallet;
    transactions: TransactionDetail[];
    adjustments: WalletAdjustment[];
    monthlyIn: number;
    monthlyOut: number;
  } | null>;

  updatePayoutSettings(user: SessionUser, input: PayoutSettings): Promise<PayoutSettings>;
  getPayoutSettings(): Promise<PayoutSettings>;
  previewPayout(
    user: SessionUser,
    start: string,
    end: string,
    allocations?: PayoutAllocations | null,
  ): Promise<PayoutPreview>;
  listPayouts(
    user: SessionUser,
    filters?: { status?: string; year?: string; month?: string; page?: number; limit?: number },
  ): Promise<Paginated<PayoutRecord>>;
  getPayout(user: SessionUser, id: string): Promise<PayoutRecord | null>;
  executePayout(
    user: SessionUser,
    input: {
      startDate: string;
      endDate: string;
      walletId: string;
      allocations: PayoutAllocations;
      idempotencyKey: string;
    },
  ): Promise<PayoutRecord>;

  getDashboardMetrics(user: SessionUser, start?: string, end?: string): Promise<DashboardMetrics>;

  listUsers(user: SessionUser): Promise<UserSummary[]>;
  createUser(
    actor: SessionUser,
    input: {
      email: string;
      password: string;
      fullName: string;
      role: UserRole;
      defaultProfitShare: number;
    },
  ): Promise<UserSummary>;
  updateUser(
    actor: SessionUser,
    input: {
      id: string;
      fullName: string;
      role: UserRole;
      defaultProfitShare: number;
      isActive: boolean;
      password?: string;
    },
  ): Promise<UserSummary>;
  toggleUser(actor: SessionUser, id: string, isActive: boolean): Promise<UserSummary>;
  deleteUsers(actor: SessionUser, ids: string[]): Promise<{ deleted: number }>;

  updateProfile(user: SessionUser, input: { fullName: string; avatarUrl?: string | null }): Promise<SessionUser>;
  updateTheme(user: SessionUser, theme: "light" | "dark" | "system"): Promise<void>;
  updateNotification(user: SessionUser, enabled: boolean): Promise<void>;
  changePassword(user: SessionUser, currentPassword: string, newPassword: string): Promise<void>;
  setAvatar(user: SessionUser, avatarUrl: string | null): Promise<void>;
  listAuditLogs(user: SessionUser): Promise<AuditLog[]>;
  getWalletAdjustments(user: SessionUser): Promise<WalletAdjustment[]>;
  applyWalletAdjustment(
    actor: SessionUser,
    walletId: string,
    newBalance: number,
    reason: string,
  ): Promise<Wallet>;

  createSales(
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
  ): Promise<TransactionDetail[]>;
  createExpense(
    user: SessionUser,
    input: {
      tanggal: string;
      kategori: "operasional" | "gaji" | "deviden" | "lainnya";
      nominal: number;
      walletId?: string;
      description: string;
      clientRequestId?: string;
    },
  ): Promise<TransactionDetail>;
  voidTransaction(user: SessionUser, id: string, reason: string): Promise<TransactionDetail>;
  updateTransaction(
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
  ): Promise<TransactionSafe>;
  deleteTransactions(actor: SessionUser, ids: string[]): Promise<{ deleted: number }>;

  previewVoucherConversion(user: SessionUser, ids: string[]): Promise<VoucherPreviewRow[]>;
  convertSalesToVouchers(
    user: SessionUser,
    input: {
      items: { transactionId: string; kodes: string[] }[];
      walletId: string;
      clientRequestId: string;
      tanggal: string;
    },
  ): Promise<VoucherConversionResult>;
  listVouchers(
    user: SessionUser,
    filters?: VoucherFilters,
  ): Promise<Paginated<VoucherStock>>;
  getVoucherSummary(user: SessionUser): Promise<{
    available: number;
    totalCost: number;
  }>;
  getVoucherByTransaction(
    user: SessionUser,
    transactionId: string,
  ): Promise<{ id: string; kode: string; status: "available" | "sold" | "void" } | null>;
  sellVoucher(
    user: SessionUser,
    input: { id: string; walletId?: string; tanggal?: string },
  ): Promise<VoucherSaleResult>;
  updateVoucher(
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
  ): Promise<VoucherStock>;

  upsertProduct(
    actor: SessionUser,
    input: {
      id?: string;
      nama: string;
      operator: string;
      hargaBeli: number;
      hargaJual: number;
      isActive?: boolean;
    },
  ): Promise<Product>;
  changeProductPrices(
    actor: SessionUser,
    input: {
      ids: string[];
      mode: "percent" | "nominal";
      jual: number;
      beli: number;
      effectiveFrom: string;
      rounding: "none" | "100" | "500" | "1000";
    },
  ): Promise<{ updated: number; products: Product[] }>;
  toggleProduct(actor: SessionUser, id: string, isActive: boolean): Promise<Product>;
  archiveProducts(actor: SessionUser, ids: string[]): Promise<{ archived: number }>;
  restoreProducts(actor: SessionUser, ids: string[]): Promise<{ restored: number }>;

  createWallet(
    actor: SessionUser,
    input: { nama: string; tipe: "cash" | "bank" | "digital"; saldoAwal: number; isDefault?: boolean },
  ): Promise<Wallet>;
  updateWallet(
    actor: SessionUser,
    input: { id: string; nama: string; tipe: "cash" | "bank" | "digital"; saldo?: number; isDefault?: boolean },
  ): Promise<Wallet>;
  toggleWallet(actor: SessionUser, id: string, isActive: boolean): Promise<Wallet>;
  deleteWallet(actor: SessionUser, id: string): Promise<{ deleted: true; defaultWalletName: string | null }>;
  transferWallet(
    actor: SessionUser,
    input: {
      fromWalletId: string;
      toWalletId: string;
      tanggal: string;
      nominal: number;
      description: string;
      clientRequestId: string;
    },
  ): Promise<TransactionSafe>;
}
