"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const isDark = mounted && resolvedTheme === "dark";
  const label = mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme";

  return (
    <Button
      variant="secondary"
      size="sm"
      type="button"
      disabled={!mounted}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      {mounted ? (
        isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />
      ) : (
        <span className="h-4 w-4 rounded-full bg-[color:var(--surface-strong)]" aria-hidden="true" />
      )}
      <span className="inline-block min-w-20 text-left">{label}</span>
    </Button>
  );
}
