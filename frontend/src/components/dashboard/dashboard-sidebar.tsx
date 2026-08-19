"use client";

import { X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { UserAvatar } from "@/components/dashboard/user-avatar";
import { dashboardNavByRole, roleTitles } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function DashboardSidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const { session } = useAuth();
  const navItems = dashboardNavByRole[session.user.role];

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseMobile();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden"
          aria-label="Close navigation drawer"
          onClick={onCloseMobile}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(18rem,calc(100vw-1.5rem))] max-w-full flex-col border-r border-[color:var(--border)] bg-[color:var(--surface)] shadow-[0_24px_60px_-30px_rgba(15,23,42,0.55)] transition-transform lg:static lg:z-auto lg:w-72 lg:translate-x-0 lg:shadow-none",
          mobileOpen ? "translate-x-0" : "-translate-x-[105%] lg:translate-x-0",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border)] p-5 lg:p-6">
          <Link
            href="/"
            className="flex items-center gap-3"
            data-tour="dashboard-home-link"
            aria-label="Go to MediVanta Home"
            title="Go to MediVanta Home"
            onClick={onCloseMobile}
          >
            <Image
              src="/medivanta-icon.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-xl object-contain"
            />
            <div>
              <p className="font-semibold">MediVanta</p>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Home
              </p>
              <p className="text-xs text-[color:var(--muted-foreground)]">
                {session.organization.name}
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-xl border border-[color:var(--border)] p-2 lg:hidden"
            aria-label="Close navigation drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-8 overflow-y-auto p-4 sm:p-6">
          <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3">
            <UserAvatar name={session.user.displayName} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{session.user.displayName}</p>
              <p className="truncate text-xs uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                {roleTitles[session.user.role]}
              </p>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
              Navigation
            </p>
            <nav className="mt-4 space-y-2">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  data-tour={`nav-${item.id}`}
                  className={cn(
                    "block rounded-xl px-4 py-3 text-sm transition",
                    pathname === item.href
                      ? "bg-[color:var(--accent)] text-white"
                      : "text-[color:var(--muted-foreground)] hover:bg-[color:var(--surface-muted)] hover:text-[color:var(--foreground)]",
                  )}
                  onClick={onCloseMobile}
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
