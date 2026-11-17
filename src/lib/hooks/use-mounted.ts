"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Mengembalikan false saat SSR/hydration dan true setelah komponen ter-mount di client.
 * Dipakai untuk menghindari hydration mismatch pada preferensi tema.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
