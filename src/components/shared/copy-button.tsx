"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

export function CopyButton({ value, label = "Salin ID" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success("ID disalin");
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Gagal menyalin ID");
        }
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border px-2.5 text-[11px] font-semibold text-foreground-muted hover:text-foreground"
    >
      {copied ? <Check className="size-3.5 text-success-text" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? "Tersalin" : label}
    </button>
  );
}
