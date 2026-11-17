"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, HandCoins, ReceiptText, ShoppingCart, Ticket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTransactionsAction } from "@/actions/transactions";
import type { TransactionSafe } from "@/types/domain";
import { formatDateId, formatDateTimeId, todayWib, WIB_OFFSET_MS } from "@/lib/period";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable, Td } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { MoneyText } from "@/components/ui/money-text";
import { SelectAllCheckbox } from "@/components/ui/select-all-checkbox";
import { StatusBadge, TransactionBadge } from "@/components/ui/status-badge";
import { TransactionRowActions, type ProductOption } from "@/components/transactions/transaction-row-actions";
import { VoucherConvertDialog } from "@/components/transactions/voucher-convert-dialog";
import { walletFlow } from "@/lib/wallet-flow";
import { useTransactionsRealtime } from "@/lib/hooks/use-transactions-realtime";
import { cn } from "@/lib/utils";

function wibDate(iso: string): string {
  return new Date(new Date(iso).getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

function groupLabel(date: string): string {
  const today = todayWib();
  if (date === today) return `Hari ini · ${formatDateId(date)}`;
  const yesterday = new Date(Date.now() + WIB_OFFSET_MS - 86_400_000).toISOString().slice(0, 10);
  if (date === yesterday) return `Kemarin · ${formatDateId(date)}`;
  return formatDateId(date);
}

function txIcon(type: TransactionSafe["tipe"]) {
  if (type === "income") return <ShoppingCart className="size-5" />;
  if (type === "expense") return <ReceiptText className="size-5" />;
  if (type === "transfer") return <ArrowLeftRight className="size-5" />;
  return <HandCoins className="size-5" />;
}

function amountTone(type: TransactionSafe["tipe"]) {
  return type === "income" ? "income" : type === "expense" ? "expense" : type === "payout" ? "payout" : "transfer";
}

function canDeleteTransaction(tx: TransactionSafe, canManage: boolean): boolean {
  return canManage && tx.tipe !== "payout" && !tx.payoutId && !tx.importBatchId;
}

function canEditTransaction(tx: TransactionSafe, canManage: boolean): boolean {
  return canDeleteTransaction(tx, canManage) && tx.status === "active" && !tx.reversalOf;
}

/** Penjualan yang bisa dikirim ke pratinjau konversi voucher. Kelayakan per baris ditentukan dialog. */
function canPreviewConvertTransaction(tx: TransactionSafe): boolean {
  return tx.tipe === "income" && tx.kategori === "penjualan";
}

export function TransactionList({
  rows,
  canManage,
  canConvert,
  products,
  wallets,
  voucherWallets,
}: {
  rows: TransactionSafe[];
  canManage: boolean;
  canConvert: boolean;
  products: ProductOption[];
  wallets: { id: string; nama: string; saldo: number }[];
  voucherWallets: { id: string; nama: string; isDefault: boolean }[];
}) {
  const router = useRouter();
  useTransactionsRealtime(canManage);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTargets, setDeleteTargets] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);

  const selectableRows = useMemo(
    () =>
      rows.filter(
        (row) => canDeleteTransaction(row, canManage) || (canConvert && canPreviewConvertTransaction(row)),
      ),
    [rows, canManage, canConvert],
  );
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(row.id)),
    [rows, selectedIds],
  );
  const selectedDeletable = useMemo(
    () => selectedRows.filter((row) => canDeleteTransaction(row, canManage)),
    [selectedRows, canManage],
  );
  const selectedConvertible = useMemo(
    () => (canConvert ? selectedRows.filter((row) => canPreviewConvertTransaction(row)) : []),
    [selectedRows, canConvert],
  );
  const convertIds = useMemo(
    () => selectedConvertible.map((row) => row.id),
    [selectedConvertible],
  );
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selectedIds.has(row.id));
  const someSelected = selectedRows.length > 0 && !allSelected;
  const selectedCount = selectedRows.length;
  const selectedTotal = useMemo(
    () =>
      selectedRows.reduce(
        (sum, row) => sum + (row.tipe === "expense" ? -row.nominal : row.nominal),
        0,
      ),
    [selectedRows],
  );

  const grouped = useMemo(
    () =>
      rows.reduce<Record<string, TransactionSafe[]>>((acc, row) => {
        const key = wibDate(row.tanggal);
        acc[key] = [...(acc[key] ?? []), row];
        return acc;
      }, {}),
    [rows],
  );

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(selectableRows.map((row) => row.id)) : new Set());
  }

  function requestDelete(ids: string[]) {
    setDeleteError(null);
    setDeleteTargets(ids);
  }

  async function confirmDelete() {
    if (!deleteTargets || deleteTargets.length === 0) return;
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteTransactionsAction({ ids: deleteTargets });
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error?.message ?? "Gagal menghapus transaksi.");
      return;
    }
    const deleted = result.data?.deleted ?? 0;
    toast.success(deleted === 1 ? "Transaksi dihapus. Saldo wallet dikoreksi." : `${deleted} transaksi dihapus.`);
    setSelectedIds(new Set());
    setDeleteTargets(null);
    router.refresh();
  }

  const selectAllProps = {
    checked: allSelected,
    indeterminate: someSelected,
    onChange: toggleAll,
    disabled: selectableRows.length === 0,
  };

  const deletePreview = useMemo(() => {
    if (!deleteTargets) return { count: 0, includesPair: false };
    const ids = new Set(deleteTargets);
    let includesPair = false;
    for (const id of deleteTargets) {
      const row = rows.find((item) => item.id === id);
      if (!row) continue;
      if (row.status === "void") {
        includesPair = true;
        const reversal = rows.find((item) => item.reversalOf === id);
        if (reversal) ids.add(reversal.id);
      } else if (row.reversalOf) {
        includesPair = true;
        ids.add(row.reversalOf);
      }
    }
    return { count: ids.size, includesPair };
  }, [deleteTargets, rows]);

  return (
    <>
      {selectedCount > 0 ? (
        <div
          role="status"
          aria-live="polite"
          className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary-soft px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-xs font-semibold text-foreground">{selectedCount} transaksi dipilih</p>
            <p className="flex items-center gap-1 text-xs text-foreground-muted">
              Total
              <MoneyText
                value={selectedTotal}
                signed
                tone={selectedTotal < 0 ? "expense" : "income"}
                size="sm"
              />
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Batal pilih
            </Button>
            {selectedConvertible.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConvertOpen(true)}
                className="border-primary/30 bg-surface text-primary hover:bg-primary-soft"
              >
                <Ticket className="size-4" aria-hidden /> Voucher belum terjual
              </Button>
            ) : null}
            {selectedDeletable.length > 0 ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => requestDelete(selectedDeletable.map((row) => row.id))}
              >
                <Trash2 className="size-4" aria-hidden /> Hapus terpilih
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-4 md:hidden">
        {selectableRows.length > 0 ? (
          <label className="flex items-center gap-2 px-1 text-xs font-medium text-foreground-muted">
            <SelectAllCheckbox {...selectAllProps} label="Pilih semua transaksi" />
            Pilih semua
          </label>
        ) : null}
        {Object.entries(grouped).map(([date, groupRows]) => {
          const net = groupRows.reduce(
            (sum, row) => sum + (row.tipe === "income" ? row.nominal : row.tipe === "expense" ? -row.nominal : 0),
            0,
          );
          return (
            <section key={date}>
              <div className="mb-1.5 flex items-center justify-between px-1">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                  {groupLabel(date)}
                </h2>
                <MoneyText value={net} signed tone={net >= 0 ? "income" : "expense"} size="sm" />
              </div>
              <div className="space-y-1.5">
                {groupRows.map((row) => {
                  const deletable = canDeleteTransaction(row, canManage);
                  const editable = canEditTransaction(row, canManage);
                  const convertible = canConvert && canPreviewConvertTransaction(row);
                  const selected = selectedIds.has(row.id);
                  return (
                    <div
                      key={row.id}
                      className={cn(
                        "rounded-md border border-border bg-surface shadow-card",
                        selected && "border-primary/40 bg-primary-soft/30",
                      )}
                    >
                      <div className="flex items-start gap-3 p-3">
                        {deletable || convertible ? (
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(event) => toggleOne(row.id, event.target.checked)}
                            aria-label={`Pilih transaksi ${row.id}`}
                            className="mt-1 size-4 shrink-0 rounded border-input accent-primary"
                          />
                        ) : null}
                        <Link href={`/transactions/${row.id}`} className="block min-w-0 flex-1">
                          <div className="flex items-start gap-3">
                            <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-foreground-muted">
                              {txIcon(row.tipe)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-sm font-semibold">{row.productName ?? row.description}</p>
                                <MoneyText
                                  value={row.tipe === "expense" ? -row.nominal : row.nominal}
                                  signed={row.tipe === "income" || row.tipe === "expense"}
                                  tone={amountTone(row.tipe)}
                                />
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-foreground-muted">
                                <span>{formatDateTimeId(row.tanggal).split(", ")[1] ?? formatDateTimeId(row.tanggal)}</span>
                                {row.walletName ? <span>· {walletFlow(row)}</span> : null}
                                {canManage && row.userName ? <span>· {row.userName}</span> : null}
                                <TransactionBadge type={row.tipe} />
                                {row.status === "void" ? <StatusBadge status="void" /> : null}
                              </div>
                              {row.description && row.productName ? (
                                <p className="mt-1 truncate text-[11px] text-foreground-muted">{row.description}</p>
                              ) : null}
                            </div>
                          </div>
                        </Link>
                      </div>
                      {deletable ? (
                        <div className="flex items-center justify-end gap-1.5 border-t border-border px-3 py-2">
                          <TransactionRowActions
                            tx={row}
                            products={products}
                            wallets={wallets}
                            canEdit={editable}
                            onRequestDelete={requestDelete}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="hidden md:block">
        <DataTable
          caption="Daftar transaksi"
          dense
          head={[
            <SelectAllCheckbox
              key="select-all"
              {...selectAllProps}
              label="Pilih semua transaksi"
            />,
            "Tanggal",
            "Tipe",
            "Produk / Kategori",
            "Keterangan",
            "Wallet",
            "Nominal",
            "Dicatat oleh",
            "Status",
            {
              content: "Aksi",
              className: "sticky right-0 z-[2] border-l border-border bg-surface-muted",
            },
          ]}
        >
          {rows.map((row) => {
            const deletable = canDeleteTransaction(row, canManage);
            const editable = canEditTransaction(row, canManage);
            const convertible = canConvert && canPreviewConvertTransaction(row);
            const selected = selectedIds.has(row.id);
            return (
              <tr
                key={row.id}
                className={cn("hover:bg-surface-muted/40", selected && "bg-primary-soft/30")}
              >
                <Td className="w-10 pr-0">
                  {deletable || convertible ? (
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => toggleOne(row.id, event.target.checked)}
                      aria-label={`Pilih transaksi ${row.id}`}
                      className="size-4 rounded border-input accent-primary"
                    />
                  ) : (
                    <span className="inline-block size-4" aria-hidden />
                  )}
                </Td>
                <Td className="whitespace-nowrap text-xs text-foreground-muted">{formatDateTimeId(row.tanggal)}</Td>
                <Td><TransactionBadge type={row.tipe} /></Td>
                <Td className="max-w-[180px]"><span className="line-clamp-1">{row.productName ?? row.kategori}</span></Td>
                <Td className="max-w-[220px]">
                  <Link href={`/transactions/${row.id}`} className="line-clamp-1 hover:text-primary">
                    {row.description || "—"}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap text-xs">{walletFlow(row)}</Td>
                <Td>
                  <MoneyText
                    value={row.tipe === "expense" ? -row.nominal : row.nominal}
                    signed={row.tipe === "income" || row.tipe === "expense"}
                    tone={amountTone(row.tipe)}
                  />
                </Td>
                <Td className="text-xs">{row.userName ?? "—"}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge status={row.status} />
                    {row.reversalOf ? <span className="text-[10px] text-foreground-muted">reversal</span> : null}
                  </div>
                </Td>
                <Td className="sticky right-0 z-[1] border-l border-border bg-surface">
                  {deletable ? (
                    <div className="flex items-center gap-1.5">
                      <TransactionRowActions
                        tx={row}
                        products={products}
                        wallets={wallets}
                        canEdit={editable}
                        onRequestDelete={requestDelete}
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-foreground-muted">—</span>
                  )}
                </Td>
              </tr>
            );
          })}
        </DataTable>
      </div>

      <Modal
        open={deleteTargets !== null}
        onClose={() => {
          if (!deleting) setDeleteTargets(null);
        }}
        title={deletePreview.count > 1 ? `Hapus ${deletePreview.count} transaksi?` : "Hapus transaksi?"}
        description={
          deletePreview.includesPair
            ? "Transaksi void akan dihapus bersama jurnal baliknya. Saldo wallet tidak berubah untuk pasangan tersebut, dan aksi dicatat di audit log."
            : "Transaksi dihapus permanen, saldo wallet dikoreksi, dan aksi dicatat di audit log."
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setDeleteTargets(null)} disabled={deleting}>
              Batal
            </Button>
            <Button variant="danger" type="button" onClick={confirmDelete} loading={deleting}>
              <Trash2 className="size-4" aria-hidden /> Ya, hapus
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert tone="warning">
            Tindakan ini tidak bisa dibatalkan. Payout, transaksi hasil import, dan periode yang
            sudah dibayarkan otomatis ditolak.
            {deletePreview.includesPair ? (
              <span className="mt-1 block">
                Transaksi void dan jurnal baliknya dihapus berpasangan agar riwayat tetap konsisten.
              </span>
            ) : null}
          </Alert>
          {deleteError ? <Alert tone="error">{deleteError}</Alert> : null}
        </div>
      </Modal>

      {convertOpen ? (
        <VoucherConvertDialog
          transactionIds={convertIds}
          wallets={voucherWallets}
          onClose={() => setConvertOpen(false)}
          onConverted={() => {
            setConvertOpen(false);
            setSelectedIds(new Set());
          }}
        />
      ) : null}
    </>
  );
}
