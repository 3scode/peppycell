import type { LucideIcon } from "lucide-react";
import {
  HandCoins,
  LayoutDashboard,
  Package,
  ReceiptText,
  Settings,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import type { UserRole } from "@/types/domain";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  shortLabel?: string;
}

const dashboard: NavItem = { href: "/dashboard", label: "Dashboard", shortLabel: "Beranda", icon: LayoutDashboard };
const transactions: NavItem = { href: "/transactions", label: "Transaksi", icon: ReceiptText };
const products: NavItem = { href: "/products", label: "Produk", shortLabel: "Katalog", icon: Package };
const vouchers: NavItem = { href: "/vouchers", label: "Stok Voucher", shortLabel: "Voucher", icon: Ticket };
const wallets: NavItem = { href: "/wallets", label: "Wallet & Aset", icon: Wallet };
const profitSharing: NavItem = { href: "/profit-sharing", label: "Bagi Hasil", icon: HandCoins };
const dividends: NavItem = { href: "/profit-sharing/history", label: "Deviden", icon: HandCoins };
const users: NavItem = { href: "/users", label: "Pengguna", icon: Users };
const settings: NavItem = { href: "/settings", label: "Profil & Pengaturan", shortLabel: "Profil", icon: Settings };

export const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  admin: [dashboard, transactions, vouchers, products, wallets, profitSharing, users, settings],
  karyawan: [dashboard, vouchers, products, settings],
  investor: [dashboard, transactions, wallets, dividends, settings],
};

export const MOBILE_NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  admin: [dashboard, transactions, profitSharing],
  karyawan: [dashboard, vouchers],
  investor: [dashboard, transactions, dividends],
};

export const MORE_NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  admin: [vouchers, products, wallets, users, settings],
  karyawan: [products, settings],
  investor: [wallets, settings],
};

export const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/transactions": "Transaksi",
  "/transactions/new": "Catat Transaksi",
  "/vouchers": "Stok Voucher",
  "/products": "Produk",
  "/wallets": "Wallet & Aset",
  "/wallets/transfer": "Mutasi Aset",
  "/profit-sharing": "Bagi Hasil",
  "/profit-sharing/new": "Wizard Bagi Hasil",
  "/profit-sharing/history": "Riwayat Payout",
  "/users": "Pengguna",
  "/settings": "Profil & Pengaturan",
};

export function pageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]!;
  const sorted = Object.keys(PAGE_TITLES).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (pathname.startsWith(`${key}/`)) return PAGE_TITLES[key]!;
  }
  return "PeppyCell";
}
