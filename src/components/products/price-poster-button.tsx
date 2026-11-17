"use client";

import { useState } from "react";
import { ImageDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, FieldHint } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";

export interface PosterProduct {
  id: string;
  nama: string;
}

function fileNameFrom(response: Response, fallback: string) {
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

async function downloadPoster(
  productIds: string[],
  options: { title?: string; subtitle?: string; note?: string; contact?: string },
) {
  const params = new URLSearchParams();
  if (productIds.length > 0) params.set("ids", productIds.join(","));
  if (options.title) params.set("title", options.title);
  if (options.subtitle) params.set("subtitle", options.subtitle);
  if (options.note) params.set("note", options.note);
  if (options.contact) params.set("contact", options.contact);

  const response = await fetch(`/api/products/poster?${params.toString()}`);
  if (!response.ok) {
    let message = "Gagal membuat poster.";
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      if (payload.error?.message) message = payload.error.message;
    } catch {
      // pesan default
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileNameFrom(response, "poster-harga-peppycell.png");
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PricePosterButton({
  productIds,
  scopeLabel,
}: {
  productIds: string[];
  scopeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("Daftar Harga Voucher Data");
  const [subtitle, setSubtitle] = useState("Murah, Cepat & Terlengkap!");
  const [note, setNote] = useState(
    "Kode voucher dikirim lewat WhatsApp. Hubungi kami atau datang langsung ke Peppy Cell.",
  );
  const [contact, setContact] = useState("Peppy Cell · Melayani setiap hari");

  async function onDownload() {
    setLoading(true);
    try {
      await downloadPoster(productIds, { title, subtitle, note, contact });
      toast.success("Poster harga diunduh.");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal membuat poster.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-11" onClick={() => setOpen(true)}>
        <ImageDown className="size-4" aria-hidden /> Buat Poster
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (!loading) setOpen(false);
        }}
        title="Buat poster daftar harga"
        description={scopeLabel}
        size="lg"
        footer={
          <>
            <Button variant="outline" type="button" onClick={() => setOpen(false)} disabled={loading}>
              Batal
            </Button>
            <Button type="button" onClick={onDownload} loading={loading}>
              <ImageDown className="size-4" aria-hidden />
              {loading ? "Membuat poster…" : "Unduh Poster PNG"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-sm border border-border bg-surface-muted/60 p-3 text-xs text-foreground-muted">
            Poster berisi semua produk aktif sesuai cakupan di atas, dikelompokkan per operator dengan
            kolom masa aktif, kuota, dan harga. Masa aktif & kuota diambil otomatis dari nama produk
            (contoh: <span className="font-semibold text-foreground">Telkomsel 7 Hari 7GB</span>).
          </div>

          <div>
            <Label htmlFor="poster-title">Judul poster</Label>
            <Input
              id="poster-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={60}
              placeholder="Daftar Harga Voucher Data"
            />
            <FieldHint>Baris kedua judul otomatis diberi warna kuning.</FieldHint>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="poster-subtitle">Subjudul</Label>
              <Input
                id="poster-subtitle"
                value={subtitle}
                onChange={(event) => setSubtitle(event.target.value)}
                maxLength={60}
              />
            </div>
            <div>
              <Label htmlFor="poster-contact">Kontak / footer</Label>
              <Input
                id="poster-contact"
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                maxLength={80}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="poster-note">Keterangan</Label>
            <Input
              id="poster-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={160}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
