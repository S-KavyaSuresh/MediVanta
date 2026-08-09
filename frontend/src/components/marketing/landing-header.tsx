"use client";

import { Menu, Stethoscope, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { publicNavItems } from "@/lib/sample-data";
import { cn } from "@/lib/utils";

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--border)] bg-[color:color-mix(in_oklab,var(--background)_90%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <span className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-2 text-[color:var(--accent)] shadow-sm">
            <Stethoscope className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight">MediVanta</p>
            <p className="truncate text-xs text-[color:var(--muted-foreground)]">
              Smarter Hospitals. Seamless Care.
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {publicNavItems.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  active
                    ? "bg-[color:var(--surface)] text-[color:var(--foreground)] shadow-sm"
                    : "text-[color:var(--muted-foreground)] hover:bg-[color:var(--surface)] hover:text-[color:var(--foreground)]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <ThemeToggle />
          <Button variant="primary" onClick={() => router.push("/dashboard")}>
            Open Dashboard
          </Button>
        </div>

        <button
          type="button"
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-2 lg:hidden"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label="Toggle navigation"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div className={cn("border-t border-[color:var(--border)] lg:hidden", open ? "block" : "hidden")}>
        <nav className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 sm:px-6">
          {publicNavItems.map((item) => {
            const active = pathname === item.href;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  active
                    ? "bg-[color:var(--surface)] text-[color:var(--foreground)]"
                    : "text-[color:var(--muted-foreground)] hover:bg-[color:var(--surface)] hover:text-[color:var(--foreground)]",
                )}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
          <div className="mt-2 flex flex-col gap-2">
            <ThemeToggle />
            <Button
              variant="primary"
              onClick={() => {
                setOpen(false);
                router.push("/dashboard");
              }}
            >
              Open Dashboard
            </Button>
          </div>
        </nav>
      </div>
    </header>
  );
}
