"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id">
      <body
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          background: "#F7F8FC",
          color: "#101828",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Aplikasi gagal dimuat.</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#667085" }}>
            Coba muat ulang halaman. Jika masalah berlanjut, hubungi Admin.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              height: 44,
              padding: "0 20px",
              borderRadius: 8,
              border: 0,
              background: "#4F46E5",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Muat Ulang
          </button>
        </div>
      </body>
    </html>
  );
}
