"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ActiveBadge } from "@/components/ui/status-badge";
import { formatRupiah } from "@/lib/money";
import { cn } from "@/lib/utils";

interface ImportRowError {
  rowNumber: number;
  nama?: string;
  message: string;
}

interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  total: number;
  errors: ImportRowError[];
  truncated: boolean;
}

interface ImportPreviewRow {
  rowNumber: number;
  nama: string;
  operator: string;
  hargaBeli: number;
  hargaJual: number;
  isActive: boolean;
}

interface ImportPreview {
  preview: true;
  rows: ImportPreviewRow[];
  skipped: number;
  total: number;
  errors: ImportRowError[];
  truncated: boolean;
}

interface ImportPayload {
  success: boolean;
  data: ImportSummary | ImportPreview | null;
  error?: { message?: string } | null;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "error";
}) {
  return (
    <div className="px-3 py-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-bold tabular-nums",
          tone === "success" && "text-success-text",
          tone === "error" && "text-error-text",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ProductExcelActions({ exportQuery }: { exportQuery: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewSeq = useRef(0);

  const exportHref = exportQuery ? `/api/products/export?${exportQuery}` : "/api/products/export";

  function closeDialog() {
    if (loading) return;
    setOpen(false);
  }

  function resetState() {
    previewSeq.current += 1;
    setFile(null);
    setError(null);
    setSummary(null);
    setPreview(null);
    setPreviewLoading(false);
    setInputKey((key) => key + 1);
  }

  async function loadPreview(selected: File) {
    const seq = ++previewSeq.current;
    setPreview(null);
    setPreviewLoading(true);
    setError(null);

    const body = new FormData();
    body.append("file", selected);
    body.append("preview", "1");

    try {
      const response = await fetch("/api/products/import", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as ImportPayload | null;
      if (seq !== previewSeq.current) return;

      const data = payload?.data;
      if (!response.ok || !payload?.success || !data || !("rows" in data)) {
        setError(payload?.error?.message ?? "Gagal membaca file. Coba lagi.");
        return;
      }
      setPreview(data);
    } catch {
      if (seq === previewSeq.current) {
        setError("Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.");
      }
    } finally {
      if (seq === previewSeq.current) setPreviewLoading(false);
    }
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    previewSeq.current += 1;
    setSummary(null);
    setError(null);
    setPreview(null);
    setPreviewLoading(false);

    if (!selected) {
      setFile(null);
      return;
    }
    if (!/\.(xls|xlsx|xlsm)$/i.test(selected.name)) {
      setFile(null);
      setError("Format file harus .xls, .xlsx, atau .xlsm.");
      event.target.value = "";
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setFile(null);
      setError("Ukuran file maksimal 2 MB.");
      event.target.value = "";
      return;
    }
    setFile(selected);
    void loadPreview(selected);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || loading) return;

    setLoading(true);
    setError(null);
    setSummary(null);

    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch("/api/products/import", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as ImportPayload | null;

      const data = payload?.data;
      if (!response.ok || !payload?.success || !data || "rows" in data) {
        setError(payload?.error?.message ?? "Import gagal. Coba lagi.");
        return;
      }

      setSummary(data);
      setPreview(null);
      if (data.created + data.updated > 0) router.refresh();

      const skippedNote =
        data.skipped > 0 ? ` ${data.skipped} baris duplikat dilewati.` : "";

      if (data.failed === 0) {
        toast.success(
          `${data.created} produk ditambahkan, ${data.updated} diperbarui.${skippedNote}`,
        );
      } else {
        toast.warning(
          `${data.created + data.updated} baris diproses, ${data.failed} baris gagal.${skippedNote}`,
        );
      }
    } catch {
      setError("Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-11" onClick={() => setOpen(true)}>
        <Upload className="size-4" aria-hidden /> Import
      </Button>
      <Button asChild variant="outline" size="sm" className="h-11">
        <a href="/api/products/template" download>
          <FileSpreadsheet className="size-4" aria-hidden /> Download Template
        </a>
      </Button>
      <Button asChild variant="outline" size="sm" className="h-11">
        <a href={exportHref} download>
          <Download className="size-4" aria-hidden /> Export
        </a>
      </Button>

      <Modal
        open={open}
        onClose={closeDialog}
        title="Import produk dari Excel"
        description="Tambah produk baru atau perbarui produk yang sudah ada sekaligus. Mendukung .xls, .xlsx, dan .xlsm."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={closeDialog} disabled={loading}>
              Tutup
            </Button>
            <Button
              type="submit"
              form="product-import-form"
              loading={loading}
              disabled={!file || previewLoading || !preview || preview.rows.length === 0}
            >
              Import Produk
            </Button>
          </>
        }
      >
        <form id="product-import-form" onSubmit={onSubmit} className="space-y-4">
          <Alert tone="info" title="Format yang didukung">
            Kolom wajib: Nama Produk (atau Voucher), Operator (atau Provider), Harga Beli, Harga
            Jual. Status opsional. Laporan transaksi dengan kolom Voucher/Provider juga bisa
            langsung diimpor; margin dihitung otomatis.{" "}
            <a
              href="/api/products/template"
              className="font-semibold text-primary underline underline-offset-2"
            >
              Download template
            </a>
            .
          </Alert>

          <div>
            <label
              htmlFor="product-import-file"
              className="mb-1.5 block text-[11px] font-semibold text-foreground-muted"
            >
              File Excel (.xls, .xlsx, .xlsm)
            </label>
            <input
              key={inputKey}
              id="product-import-file"
              name="file"
              type="file"
              accept=".xls,.xlsx,.xlsm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onFileChange}
              className="block w-full cursor-pointer rounded-sm border border-border bg-surface px-3 py-2 text-xs text-foreground-muted file:mr-3 file:cursor-pointer file:rounded-sm file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary hover:bg-surface-muted"
            />
            <p className="mt-1.5 text-[11px] leading-4 text-foreground-muted">
              Maksimal 2 MB dan 1.000 baris. Format .xls lama juga didukung. Produk dengan nama
              sama akan diperbarui; nama baru akan ditambahkan.
            </p>
          </div>

          {error ? (
            <Alert tone="error" role="alert">
              {error}
            </Alert>
          ) : null}

          {previewLoading ? (
            <p className="text-[11px] text-foreground-muted">Membaca file…</p>
          ) : null}

          {preview ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-foreground-muted">
                <span>
                  <span className="font-semibold text-foreground">{preview.rows.length} produk</span>{" "}
                  siap diimpor
                  {preview.skipped > 0
                    ? ` · ${preview.skipped} baris duplikat digabung (nama sama)`
                    : ""}
                </span>
                <span>Total {preview.total} baris terbaca</span>
              </div>
              <div className="overflow-hidden rounded-sm border border-border">
                <div className="scrollbar-thin max-h-72 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 z-[1] bg-surface-muted/90 backdrop-blur">
                      <tr className="text-[10px] uppercase tracking-wide text-foreground-muted">
                        <th className="px-3 py-2 font-semibold">Nama Produk</th>
                        <th className="px-3 py-2 font-semibold">Operator</th>
                        <th className="px-3 py-2 text-right font-semibold">Harga Beli</th>
                        <th className="px-3 py-2 text-right font-semibold">Harga Jual</th>
                        <th className="px-3 py-2 text-right font-semibold">Margin</th>
                        <th className="px-3 py-2 text-center font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.rows.map((row) => {
                        const margin = row.hargaJual - row.hargaBeli;
                        const pct = row.hargaJual > 0 ? (margin / row.hargaJual) * 100 : 0;
                        return (
                          <tr key={`${row.rowNumber}-${row.nama}`} className="hover:bg-surface-muted/40">
                            <td className="max-w-[220px] truncate px-3 py-2 font-medium">{row.nama}</td>
                            <td className="max-w-[160px] truncate px-3 py-2 text-foreground-muted">
                              {row.operator}
                            </td>
                            <td className="money whitespace-nowrap px-3 py-2 text-right">
                              {formatRupiah(row.hargaBeli)}
                            </td>
                            <td className="money whitespace-nowrap px-3 py-2 text-right">
                              {formatRupiah(row.hargaJual)}
                            </td>
                            <td
                              className={cn(
                                "money whitespace-nowrap px-3 py-2 text-right font-semibold",
                                margin >= 0 ? "text-success-text" : "text-error-text",
                              )}
                            >
                              {formatRupiah(margin)}
                              <span className="ml-1 font-normal text-foreground-muted">
                                ({pct.toFixed(1).replace(".", ",")}%)
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <ActiveBadge active={row.isActive} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {preview.errors.length > 0 ? (
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-sm border border-error/20 bg-error-soft/40 p-2.5 text-[11px] leading-4">
                  <p className="font-semibold text-error-text">
                    {preview.errors.length} baris tidak valid dan akan dilewati
                  </p>
                  {preview.errors.map((row) => (
                    <p key={`${row.rowNumber}-${row.message}`} className="text-foreground-muted">
                      <span className="font-semibold text-foreground">Baris {row.rowNumber}</span>
                      {row.nama ? <span> · {row.nama}</span> : null}
                      <span className="block">{row.message}</span>
                    </p>
                  ))}
                  {preview.truncated ? (
                    <p className="font-semibold text-foreground-muted">
                      Masih ada error lain yang tidak ditampilkan.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-[11px] text-foreground-muted">Semua baris valid.</p>
              )}
            </div>
          ) : null}

          {summary ? (
            <div className="overflow-hidden rounded-sm border border-border">
              <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
                <SummaryStat label="Ditambahkan" value={summary.created} tone="success" />
                <SummaryStat label="Diperbarui" value={summary.updated} />
                <SummaryStat label="Gagal" value={summary.failed} tone="error" />
              </div>
              {summary.skipped > 0 ? (
                <p className="border-b border-border bg-surface-muted/40 px-3 py-2 text-[11px] leading-4 text-foreground-muted">
                  {summary.skipped} baris duplikat dilewati karena nama produk sudah muncul lebih
                  awal di file.
                </p>
              ) : null}
              {summary.errors.length > 0 ? (
                <div className="max-h-44 space-y-1.5 overflow-y-auto p-3 text-[11px] leading-4">
                  {summary.errors.map((row) => (
                    <p key={`${row.rowNumber}-${row.message}`} className="text-foreground-muted">
                      <span className="font-semibold text-foreground">Baris {row.rowNumber}</span>
                      {row.nama ? <span> · {row.nama}</span> : null}
                      <span className="block">{row.message}</span>
                    </p>
                  ))}
                  {summary.truncated ? (
                    <p className="font-semibold text-foreground-muted">
                      Masih ada error lain. Perbaiki file lalu import ulang.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="px-3 py-2.5 text-[11px] text-foreground-muted">
                  Tidak ada baris yang gagal.
                </p>
              )}
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetState}
              disabled={loading || previewLoading || (!file && !summary && !error && !preview)}
            >
              Reset
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
