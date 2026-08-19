"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { UserAvatar } from "@/components/dashboard/user-avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";
import { apiRequest } from "@/lib/api";
import type { AuthSession } from "@/lib/auth";
import { profilePathByRole } from "@/lib/auth";
import { publicNavItems } from "@/lib/sample-data";
import { cn } from "@/lib/utils";

export function LandingHeader({ session }: { session: AuthSession | null }) {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { pushToast } = useToast();
  const profileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!profileOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!profileRef.current?.contains(target)) {
        setProfileOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [profileOpen]);

  const handleLogout = async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } catch (error) {
      pushToast(
        "Unable to sign out",
        error instanceof Error
          ? error.message
          : "MediVanta could not complete sign out right now.",
      );
    } finally {
      setProfileOpen(false);
      setOpen(false);
    }
  };

  const guestActions = (
    <>
      <Button variant="ghost" onClick={() => router.push("/login")}>
        Sign In
      </Button>
    </>
  );

  const authenticatedActions = session ? (
    <div className="relative" ref={profileRef}>
      <button
        type="button"
        className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2"
        onClick={() => setProfileOpen((current) => !current)}
        aria-expanded={profileOpen}
      >
        <UserAvatar name={session.user.displayName} className="h-9 w-9 text-xs" />
        <div className="min-w-0 text-left">
          <p className="max-w-[10rem] truncate text-sm font-semibold">
            {session.user.displayName}
          </p>
          <p className="max-w-[10rem] truncate text-xs text-[color:var(--muted-foreground)]">
            {session.organization.name}
          </p>
        </div>
        <ChevronDown className="h-4 w-4 text-[color:var(--muted-foreground)]" />
      </button>
      {profileOpen ? (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-2 shadow-xl">
          <Link
            href="/dashboard"
            className="block rounded-xl px-4 py-3 text-sm hover:bg-[color:var(--surface-muted)]"
            onClick={() => setProfileOpen(false)}
          >
            Dashboard
          </Link>
          <Link
            href={profilePathByRole[session.user.role]}
            className="block rounded-xl px-4 py-3 text-sm hover:bg-[color:var(--surface-muted)]"
            onClick={() => setProfileOpen(false)}
          >
            Profile
          </Link>
          <button
            type="button"
            className="block w-full rounded-xl px-4 py-3 text-left text-sm hover:bg-[color:var(--surface-muted)]"
            onClick={() => void handleLogout()}
          >
            Logout
          </button>
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--border)] bg-[color:color-mix(in_oklab,var(--background)_90%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Image
            src="/medivanta-icon.png"
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-xl object-contain"
            priority
          />
          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight">MediVanta</p>
            <p className="truncate text-xs text-[color:var(--muted-foreground)]">
              Connected care platform
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
          {session ? authenticatedActions : guestActions}
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
            {session ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setOpen(false);
                    router.push("/dashboard");
                  }}
                >
                  Dashboard
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setOpen(false);
                    router.push(profilePathByRole[session.user.role]);
                  }}
                >
                  Profile
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void handleLogout()}
                >
                  Logout
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  router.push("/login");
                }}
              >
                Sign In
              </Button>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
