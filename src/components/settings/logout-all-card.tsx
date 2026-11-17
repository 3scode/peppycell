"use client";

import { useState, useTransition } from "react";
import { LogOut } from "lucide-react";
import { logoutAllAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Alert } from "@/components/ui/alert";

export function LogoutAllCard() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-error/20 bg-error-soft/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-foreground">Keluar dari semua perangkat</p>
        <p className="mt-0.5 text-[11px] text-foreground-muted">
          Semua sesi aktif dicabut. Anda perlu login ulang di setiap perangkat.
        </p>
      </div>
      <Button
        type="button"
        variant="danger"
        size="sm"
        onClick={() => setOpen(true)}
        className="shrink-0"
      >
        <LogOut className="size-3.5" aria-hidden /> Keluar Semua
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Keluar dari semua perangkat?"
        description="Sesi ini dan semua sesi lain akan diakhiri."
        size="sm"
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              variant="danger-solid"
              type="button"
              loading={pending}
              onClick={() => startTransition(() => logoutAllAction())}
            >
              Ya, Keluar Semua
            </Button>
          </>
        }
      >
        <Alert tone="warning">
          Pastikan pekerjaan sudah tersimpan. Setelah keluar, Anda diarahkan ke halaman login.
        </Alert>
      </Modal>
    </div>
  );
}
