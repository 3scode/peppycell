import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "error";

const toneStyles: Record<Tone, string> = {
  info: "border-primary/20 bg-primary-soft text-foreground",
  success: "border-success/20 bg-success-soft text-foreground",
  warning: "border-warning/25 bg-warning-soft text-foreground",
  error: "border-error/20 bg-error-soft text-foreground",
};

const icons: Record<Tone, ReactNode> = {
  info: <Info aria-hidden className="size-4 text-primary" />,
  success: <CheckCircle2 aria-hidden className="size-4 text-success-text" />,
  warning: <AlertTriangle aria-hidden className="size-4 text-warning-text" />,
  error: <XCircle aria-hidden className="size-4 text-error-text" />,
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
  role,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  return (
    <div
      role={role ?? (tone === "error" ? "alert" : "status")}
      className={cn("flex items-start gap-2 rounded-sm border px-3 py-2.5 text-xs leading-5", toneStyles[tone], className)}
    >
      <span className="mt-0.5 shrink-0">{icons[tone]}</span>
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "text-foreground-muted")}>{children}</div> : null}
      </div>
    </div>
  );
}
