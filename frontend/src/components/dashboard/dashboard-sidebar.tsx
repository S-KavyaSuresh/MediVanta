"use client";

import { Menu, Stethoscope, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { dashboardNav } from "@/lib/sample-data";
import { cn } from "@/lib/utils";

export function DashboardSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border-b border-[color:var(--border)] p-4 lg:hidden">
        <Link href="/" className="flex items-center gap-3">
          <span className="rounded-2xl bg-[color:var(--accent)]/10 p-2 text-[color:var(--accent)]">
            <Stethoscope className="h-5 w-5" />
          </span>
          <span className="font-semibold">MediVanta</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="rounded-xl border border-[color:var(--border)] p-2"
          aria-expanded={open}
          aria-label="Toggle sidebar"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <aside
        className={cn(
          "max-w-full border-r border-[color:var(--border)] bg-[color:var(--surface)] lg:block lg:w-72",
          open ? "block" : "hidden lg:block",
        )}
      >
        <div className="hidden border-b border-[color:var(--border)] p-6 lg:block">
          <Link href="/" className="flex items-center gap-3">
            <span className="rounded-2xl bg-[color:var(--accent)]/10 p-2 text-[color:var(--accent)]">
              <Stethoscope className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold">MediVanta</p>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Hospital Workspace
              </p>
            </div>
          </Link>
        </div>

        <div className="space-y-8 p-4 sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
              Navigation
            </p>
            <nav className="mt-4 space-y-2">
              {dashboardNav.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "block rounded-xl px-4 py-3 text-sm transition",
                    item.active
                      ? "bg-[color:var(--accent)] text-white"
                      : "text-[color:var(--muted-foreground)] hover:bg-[color:var(--surface-muted)] hover:text-[color:var(--foreground)]",
                  )}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </aside>
    </>
  );
}
