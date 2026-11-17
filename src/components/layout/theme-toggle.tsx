"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMounted } from "@/lib/hooks/use-mounted";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) {
    return <div className={cn("h-10 w-[120px] rounded-sm bg-surface-muted", compact && "size-11")} aria-hidden />;
  }

  if (compact) {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label={next === "dark" ? "Aktifkan mode gelap" : "Aktifkan mode terang"}
        className="flex size-11 items-center justify-center rounded-sm text-foreground-muted hover:bg-surface-muted hover:text-foreground"
      >
        {resolvedTheme === "dark" ? (
          <Sun className="size-5" aria-hidden />
        ) : (
          <Moon className="size-5" aria-hidden />
        )}
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema tampilan"
      className="grid grid-cols-3 gap-1 rounded-sm bg-surface-muted p-1"
    >
      {[
        { value: "light", label: "Terang", icon: Sun },
        { value: "dark", label: "Gelap", icon: Moon },
        { value: "system", label: "Auto", icon: Monitor },
      ].map((item) => {
        const Icon = item.icon;
        const active = theme === item.value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(item.value)}
            className={cn(
              "flex h-10 items-center justify-center gap-1.5 rounded-[6px] px-2 text-xs font-semibold transition-colors",
              active
                ? "bg-surface text-foreground shadow-card"
                : "text-foreground-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
