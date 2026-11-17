import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Default: dev server lokal untuk emulator Android (10.0.2.2 = host).
 * Ganti saat build untuk staging/production:
 *   CAPACITOR_SERVER_URL=https://app.example.com bun run apk:debug
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() || "http://10.0.2.2:3000";

const config: CapacitorConfig = {
  appId: "com.peppycell.app",
  appName: "PeppyCell",
  webDir: "public",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
  },
};

export default config;
