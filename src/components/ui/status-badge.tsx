import type { ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  HandCoins,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PayoutStatus,
  TransactionStatus,
  TransactionType,
  UserRole,
} from "@/types/domain";

type Variant =
  | "income"
  | "expense"
  | "transfer"
  | "payout"
  | "neutral"
  | "success"
  | "warning"
  | "error"
  | "role-admin"
  | "role-karyawan"
  | "role-investor";

const styles: Record<Variant, string> = {
  income: "bg-success-soft text-success-text",
  expense: "bg-error-soft text-error-text",
  transfer: "bg-transfer-soft text-transfer-text",
  payout: "bg-payout-soft text-payout-text",
  neutral: "bg-surface-muted text-foreground-muted",
  success: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  error: "bg-error-soft text-error-text",
  "role-admin": "bg-payout-soft text-payout-text",
  "role-karyawan": "bg-transfer-soft text-transfer-text",
  "role-investor": "bg-secondary-soft text-secondary",
};

const icons: Partial<Record<Variant, ReactNode>> = {
  income: <ArrowDownLeft aria-hidden className="size-3.5" />,
  expense: <ArrowUpRight aria-hidden className="size-3.5" />,
  transfer: <ArrowLeftRight aria-hidden className="size-3.5" />,
  payout: <HandCoins aria-hidden className="size-3.5" />,
  neutral: <Minus aria-hidden className="size-3.5" />,
  success: <CircleCheck aria-hidden className="size-3.5" />,
  warning: <CircleDashed aria-hidden className="size-3.5" />,
  error: <CircleX aria-hidden className="size-3.5" />,
};

export function Badge({
  variant = "neutral",
  children,
  className,
  dot = false,
}: {
  variant?: Variant;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-[18px]",
        styles[variant],
        className,
      )}
    >
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : icons[variant]}
      {children}
    </span>
  );
}

const txLabel: Record<TransactionType, string> = {
  income: "Masuk",
  expense: "Keluar",
  transfer: "Transfer",
  payout: "Payout",
};

const txVariant: Record<TransactionType, Variant> = {
  income: "income",
  expense: "expense",
  transfer: "transfer",
  payout: "payout",
};

export function TransactionBadge({ type }: { type: TransactionType }) {
  return <Badge variant={txVariant[type]}>{txLabel[type]}</Badge>;
}

export function StatusBadge({ status }: { status: TransactionStatus }) {
  return status === "active" ? (
    <Badge variant="success" dot>
      Aktif
    </Badge>
  ) : (
    <Badge variant="neutral" dot>
      Dibatalkan
    </Badge>
  );
}

const payoutLabel: Record<PayoutStatus, string> = {
  processing: "Diproses",
  completed: "Selesai",
  failed: "Gagal",
};

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const variant: Variant =
    status === "completed" ? "success" : status === "processing" ? "warning" : "error";
  return <Badge variant={variant} dot>{payoutLabel[status]}</Badge>;
}

const roleLabel: Record<UserRole, string> = {
  admin: "Admin",
  karyawan: "Karyawan",
  investor: "Investor",
};

export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge variant={`role-${role}` as Variant}>{roleLabel[role]}</Badge>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="success" dot>
      Aktif
    </Badge>
  ) : (
    <Badge variant="neutral" dot>
      Nonaktif
    </Badge>
  );
}

export function ProductStatusBadge({ active, archived }: { active: boolean; archived?: boolean }) {
  return archived ? (
    <Badge variant="warning" dot>
      Diarsipkan
    </Badge>
  ) : (
    <ActiveBadge active={active} />
  );
}
