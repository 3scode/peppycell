"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Menyegarkan data halaman saat tabel yang dipantau berubah dari tab atau
 * perangkat lain. Event realtime hanya memicu router.refresh(), jadi state
 * client (filter, pencarian, dialog) tetap utuh.
 */
export function useRealtimeRefresh(
  channelName: string,
  tables: readonly string[],
  enabled = true,
): void {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    const supabase = createSupabaseBrowserClient();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const scheduleRefresh = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => router.refresh(), 300);
    };

    let channel = supabase.channel(channelName);
    for (const table of tables) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        scheduleRefresh,
      );
    }
    channel.subscribe();

    return () => {
      clearTimeout(timeout);
      void supabase.removeChannel(channel);
    };
  }, [channelName, enabled, router, tables]);
}
