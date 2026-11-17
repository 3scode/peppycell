"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteWalletAction } from "@/actions/wallets";
import type { Wallet } from "@/types/domain";
import { formatRupiah } from "@/lib/money";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ActiveBadge } from "@/components/ui/status-badge";

function typeLabel(tipe: Wallet["tipe"]) {
  return tipe === "bank" ? "Rekening bank" : tipe === "digital" ? "Saldo digital" : "Cash / tunai";
}

export function WalletDeleteDialog({
  wallet,
  isLastActiveWallet = false,
}: {
  wallet: Wallet;
  /** True jika ini satu-satunya wallet aktif yang tersisa. */
  isLastActiveWallet?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsAcknowledgement = wallet.saldo > 0;

  function openDialog() {
    setAcknowledged(false);
    setError(null);
    setOpen(true);
  }

  function close() {
    if (deleting) return;
    setOpen(false);
    setError(null);
    setAcknowledged(false);
  }

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteWalletAction({ id: wallet.id });
    setDeleting(false);
    if (!result.ok) {
      setError(result.error?.message ?? "Gagal menghapus wallet.");
      return;
    }
    const nextDefault = result.data?.defaultWalletName;
    toast.success(
      nextDefault
        ? `Wallet dihapus. Default dipindahkan ke ${nextDefault}.`
        : "Wallet dihapus.",
    );
    setOpen(false);
    if (pathname !== "/wallets") {
      router.replace("/wallets");
      router.refresh();
    } else {
      router.refresh();
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="danger"
        size="sm"
        onClick={openDialog}
        aria-label={`Hapus wallet ${wallet.nama}`}
      >
        <Trash2 className="size-4" aria-hidden /> Hapus
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Hapus wallet?"
        description="Tindakan ini tidak bisa dibatalkan."
        size="sm"
        footer={
          <>
            <Button variant="outline" type="button" onClick={close} disabled={deleting}>
              Batal
            </Button>
            <Button
              variant="danger-solid"
              type="button"
              onClick={confirmDelete}
              loading={deleting}
              disabled={needsAcknowledgement && !acknowledged}
            >
              <Trash2 className="size-4" aria-hidden />
              {deleting ? "Menghapus…" : "Hapus Wallet"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <div className="rounded-sm border border-border bg-surface-muted/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{wallet.nama}</p>
                <p className="text-[11px] text-foreground-muted">
                  {typeLabel(wallet.tipe)}
                  {wallet.isDefault ? " · default" : ""}
                </p>
              </div>
              <ActiveBadge active={wallet.isActive} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2 text-xs">
              <span className="text-foreground-muted">Saldo</span>
              <span className="money font-semibold">{formatRupiah(wallet.saldo)}</span>
            </div>
          </div>

          {needsAcknowledgement ? (
            <>
              <Alert tone="warning" title="Saldo akan hilang dari total aset">
                Mutasi saldo ke wallet lain terlebih dahulu jika dana tersebut masih ada.
              </Alert>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-sm border border-warning/25 bg-warning-soft p-3">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
                />
                <span className="text-xs leading-5">
                  Saya paham saldo {formatRupiah(wallet.saldo)} akan dihapus dari total aset.
                </span>
              </label>
            </>
          ) : null}

          {isLastActiveWallet ? (
            <Alert tone="warning" title="Ini wallet aktif terakhir">
              Setelah dihapus tidak ada wallet tersisa. Transaksi dan payout tidak bisa dicatat
              sampai kamu membuat wallet baru.
            </Alert>
          ) : wallet.isDefault ? (
            <Alert tone="info" title="Wallet default">
              Setelah dihapus, wallet aktif lain otomatis dijadikan default.
            </Alert>
          ) : null}

          <Alert tone="info">
            Riwayat transaksi dan payout tetap tersimpan karena nama wallet disimpan sebagai
            snapshot.
          </Alert>
        </div>
      </Modal>
    </>
  );
}
