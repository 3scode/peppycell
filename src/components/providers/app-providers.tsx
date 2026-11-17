"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

export function AppProviders({ children }: { children: React.ReactNode }) {
  // next-themes merender <script> anti-flash di dalam provider. Script itu hanya
  // perlu dieksekusi dari HTML hasil SSR; saat React membuatnya ulang di client
  // (remount provider), React 19 mencatat error "Encountered a script tag".
  // Di server biarkan bertipe JS agar tetap berjalan, di client jadikan data
  // block supaya React tidak menganggapnya script yang harus dieksekusi.
  const scriptType = typeof window === "undefined" ? "text/javascript" : "application/json";

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      scriptProps={{ type: scriptType }}
    >
      {children}
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{
          style: {
            background: "var(--surface)",
            color: "var(--foreground)",
            border: "1px solid var(--border)",
          },
        }}
      />
    </ThemeProvider>
  );
}
