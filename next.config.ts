import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["xlsx"],
  experimental: {
    // Halaman di app ini dynamic (query Supabase), jadi default 0 detik berarti
    // setiap kembali ke halaman yang baru dibuka selalu refetch penuh.
    // 30 detik membuat navigasi bolak-balik terasa instan; realtime hook tetap
    // menyegarkan data saat ada perubahan dari perangkat lain.
    staleTimes: {
      dynamic: 30,
    },
  },
  outputFileTracingIncludes: {
    "/api/products/poster": ["./assets/fonts/**/*"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
