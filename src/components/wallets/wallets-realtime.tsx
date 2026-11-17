"use client";

import { useWalletsRealtime } from "@/lib/hooks/use-wallets-realtime";

export function WalletsRealtime({ enabled = true }: { enabled?: boolean }) {
  useWalletsRealtime(enabled);
  return null;
}
