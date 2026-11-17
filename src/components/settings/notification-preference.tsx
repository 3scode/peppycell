"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateNotificationAction } from "@/actions/settings";
import { Switch } from "@/components/ui/switch";

export function NotificationPreference({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  function onChange(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    startTransition(async () => {
      const result = await updateNotificationAction({ enabled: next });
      if (!result.ok) {
        setEnabled(previous);
        toast.error(result.error?.message ?? "Gagal menyimpan preferensi notifikasi.");
        return;
      }
      toast.success(next ? "Pengingat payout diaktifkan." : "Pengingat payout dimatikan.");
    });
  }

  return (
    <div className="rounded-sm border border-border p-3">
      <Switch
        id="notification-payout"
        checked={enabled}
        onCheckedChange={onChange}
        disabled={pending}
        label="Pengingat payout mingguan"
        description="Tampilkan banner periode siap diproses di dashboard dan menu bagi hasil."
      />
    </div>
  );
}
