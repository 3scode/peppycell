import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, ReceiptText, Ticket } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getTransactionDetail, getVoucherByTransaction } from "@/lib/data/repository";
import { formatDateTimeId } from "@/lib/period";
import { formatRupiah } from "@/lib/money";
import { walletFlow } from "@/lib/wallet-flow";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money-text";
import { StatusBadge, TransactionBadge } from "@/components/ui/status-badge";
import { Alert } from "@/components/ui/alert";
import { CopyButton } from "@/components/shared/copy-button";
import { VoidDialog } from "@/components/transactions/void-dialog";

export const metadata = { title: "Detail Transaksi" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <dt className="text-xs text-foreground-muted">{label}</dt>
      <dd className="text-sm font-medium text-foreground sm:text-right">{children}</dd>
    </div>
  );
}

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("admin", "investor");
  const { id } = await params;
  const tx = await getTransactionDetail(user, id);
  if (!tx) notFound();
  const voucher = await getVoucherByTransaction(user, tx.id);

  const canVoid =
    user.role === "admin" &&
    tx.status === "active" &&
    !tx.reversalOf &&
    tx.tipe !== "payout" &&
    !tx.importBatchId &&
    !tx.payoutId;

  const signedValue = tx.tipe === "expense" ? -tx.nominal : tx.nominal;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Detail Transaksi"
        backHref="/transactions"
        description="Rincian jurnal dan jejak pencatatan."
        actions={<CopyButton value={tx.id} />}
      />

      {tx.status === "void" ? (
        <Alert tone="warning" className="mb-4" title="Transaksi dibatalkan">
          Jurnal balik sudah dibuat. Transaksi asli tetap tersimpan untuk audit.
        </Alert>
      ) : null}
      {tx.reversalOf ? (
        <Alert tone="info" className="mb-4" title="Ini adalah jurnal pembatalan">
          Pembatalan untuk{" "}
          <Link href={`/transactions/${tx.reversalOf}`} className="font-semibold text-primary underline">
            transaksi {tx.reversalOf}
          </Link>
          .
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-border bg-gradient-to-br from-primary-soft/60 to-surface p-5 text-center sm:p-6">
          <div className="flex justify-center">
            <TransactionBadge type={tx.tipe} />
          </div>
          <div className="mt-2">
            <MoneyText
              value={signedValue}
              signed={tx.tipe === "income" || tx.tipe === "expense"}
              tone={tx.tipe === "income" ? "income" : tx.tipe === "expense" ? "expense" : tx.tipe === "payout" ? "payout" : "transfer"}
              size="display"
            />
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">{tx.productName ?? tx.kategori}</p>
          <p className="mt-0.5 text-xs text-foreground-muted">{tx.description || "—"}</p>
        </div>

        <CardContent className="pt-2">
          <dl className="divide-y divide-border">
            <Row label="Status"><StatusBadge status={tx.status} /></Row>
            <Row label="Tanggal">{formatDateTimeId(tx.tanggal)} WIB</Row>
            <Row label="Kategori">{tx.kategori}</Row>
            <Row label="Wallet">{walletFlow(tx)}</Row>
            {voucher ? (
              <Row label="Kode voucher">
                <Link href="/vouchers" className="inline-flex items-center gap-1 text-primary hover:underline">
                  <Ticket className="size-3" aria-hidden /> {voucher.kode}
                </Link>
              </Row>
            ) : null}
            {user.role === "admin" && tx.sourceCost != null ? (
              <Row label="Biaya modal (sumber)">
                <MoneyText value={-tx.sourceCost} tone="expense" />
              </Row>
            ) : null}
            <Row label="Dicatat oleh">{tx.userName ?? "—"}</Row>
            {tx.qty != null ? <Row label="Jumlah">{tx.qty} unit</Row> : null}
            {tx.unitPrice != null ? <Row label="Harga jual satuan">{formatRupiah(tx.unitPrice)}</Row> : null}
            {user.role === "admin" && tx.unitCost != null ? (
              <Row label="Harga beli satuan (admin)">
                <span className="inline-flex items-center gap-1 text-foreground-muted">
                  <Lock className="size-3" aria-hidden /> {formatRupiah(tx.unitCost)}
                </span>
              </Row>
            ) : null}
            {user.role === "admin" && tx.margin != null ? (
              <Row label="Margin (admin)">
                <MoneyText value={tx.margin} tone={tx.margin >= 0 ? "income" : "expense"} />
              </Row>
            ) : null}
            <Row label="ID Transaksi">
              <span className="money break-all text-xs">{tx.id}</span>
            </Row>
            {tx.reversalOf ? <Row label="Membatalkan"><Link href={`/transactions/${tx.reversalOf}`} className="text-primary hover:underline">{tx.reversalOf}</Link></Row> : null}
            {tx.payoutId ? <Row label="Payout"><Link href={`/profit-sharing/history/${tx.payoutId}`} className="text-primary hover:underline">{tx.payoutId}</Link></Row> : null}
          </dl>
        </CardContent>
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/transactions"
          className="inline-flex h-11 items-center gap-1.5 rounded-sm border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-muted"
        >
          <ArrowLeft className="size-4" aria-hidden /> Kembali
        </Link>
        {canVoid ? (
          <VoidDialog
            transactionId={tx.id}
            amountLabel={formatRupiah(tx.nominal)}
          />
        ) : null}
      </div>

      {!canVoid && user.role === "admin" && tx.status === "active" ? (
        <p className="mt-3 text-right text-[11px] text-foreground-muted">
          Transaksi payout, hasil import, dan jurnal pembatalan tidak dapat dibatalkan.
        </p>
      ) : null}

      {user.role === "investor" ? (
        <div className="mt-4 rounded-sm border border-border bg-surface-muted/60 p-3 text-[11px] leading-5 text-foreground-muted">
          <ReceiptText className="mr-1 inline size-3.5" aria-hidden />
          Mode read-only. Anda dapat melihat rincian transaksi, tetapi data modal, harga beli,
          dan margin tidak ditampilkan.
        </div>
      ) : null}
    </div>
  );
}
