import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { DevAgentation } from "@/components/providers/dev-agentation";

export const metadata: Metadata = {
  title: {
    default: "PeppyCell — Control Room Keuangan Konter",
    template: "%s · PeppyCell",
  },
  description:
    "Mini ERP untuk konter pulsa & kuota: catat penjualan, kelola aset, dan bagi hasil mingguan secara aman per role.",
  applicationName: "PeppyCell",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8FC" },
    { media: "(prefers-color-scheme: dark)", color: "#0C111D" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <AppProviders>{children}</AppProviders>
        <DevAgentation />
      </body>
    </html>
  );
}
