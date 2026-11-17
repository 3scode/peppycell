"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { updateThemeAction } from "@/actions/settings";
import type { ThemeMode } from "@/types/domain";
import { useMounted } from "@/lib/hooks/use-mounted";
import { cn } from "@/lib/utils";

const options: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Terang", icon: Sun },
  { value: "dark", label: "Gelap", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

export function ThemePreference({ initialTheme }: { initialTheme: ThemeMode }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const activeTheme: ThemeMode =
    mounted && (theme === "light" || theme === "dark" || theme === "system")
      ? theme
      : initialTheme;

  async function choose(next: ThemeMode) {
    setTheme(next);
    const result = await updateThemeAction({ theme: next });
    if (!result.ok) {
      toast.error(result.error?.message ?? "Gagal menyimpan preferensi tema.");
    }
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Tema tampilan"
        className="grid grid-cols-3 gap-1.5 rounded-sm bg-surface-muted p-1.5"
      >
        {options.map((option) => {
          const Icon = option.icon;
          const active = activeTheme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(option.value)}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[6px] px-2 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "bg-surface text-foreground shadow-card"
                  : "text-foreground-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-foreground-muted">
        Preferensi tema tersimpan di profil dan berlaku saat Anda login kembali.
      </p>
    </div>
  );
}
