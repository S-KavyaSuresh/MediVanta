"use client";

import { Bell, HelpCircle, LogOut, Menu, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/components/providers/auth-provider";
import { UserAvatar } from "@/components/dashboard/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSafeLandingPath, roleTitles } from "@/lib/auth";

export function DashboardHeader({
  onOpenSidebar,
}: {
  onOpenSidebar: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeQuery = searchParams.get("q") ?? "";
  const { hasCapability, logout, session } = useAuth();
  const canSearch = hasCapability("search:view");
  return (
    <div
      className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--surface)]/95 px-4 py-4 backdrop-blur md:px-8"
    >
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between xl:items-center">
        <div className="flex min-w-0 w-full items-start gap-3 lg:min-w-[18rem] lg:flex-1">
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 lg:hidden"
            onClick={onOpenSidebar}
            aria-label="Open dashboard navigation"
          >
            <Menu className="h-4 w-4" />
          </Button>
          {canSearch ? (
            <form
              key={`${pathname}-${activeQuery}`}
              className="flex min-w-0 w-full max-w-xl gap-2"
              data-tour="dashboard-global-search"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const query = String(formData.get("dashboard-search") ?? "");
                const trimmed = query.trim();

                if (!trimmed) {
                  if (pathname === "/dashboard/search") {
                    router.push(getSafeLandingPath(session.user.role, session.landingPath));
                  }

                  return;
                }

                router.push(`/dashboard/search?q=${encodeURIComponent(trimmed)}`);
              }}
            >
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-foreground)]" />
                <Input
                  name="dashboard-search"
                  aria-label="Search dashboard"
                  placeholder="Search patients, doctors, departments, or queue records"
                  className="pl-10"
                  defaultValue={activeQuery}
                />
              </div>
              <Button
                type="submit"
                variant="secondary"
                className="shrink-0 px-4"
                aria-label="Search hospital workspace"
              >
                <Search className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            <div className="min-w-0 max-w-full flex-1 lg:min-w-[16rem]">
              <p className="text-sm font-semibold leading-6">{roleTitles[session.user.role]}</p>
              <p className="mt-1 text-sm leading-6 text-[color:var(--muted-foreground)] [overflow-wrap:anywhere] sm:break-words">
                {session.organization.name}
              </p>
            </div>
          )}
        </div>
        <div className="flex min-w-0 w-full flex-wrap items-start gap-3 lg:w-auto lg:max-w-full lg:justify-end">
          <div className="shrink-0">
            <ThemeToggle />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => window.dispatchEvent(new CustomEvent("medivanta-tour:restart"))}
          >
            <HelpCircle className="h-4 w-4" />
            Take a tour
          </Button>
          <div className="hidden items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs font-medium text-[color:var(--muted-foreground)] lg:inline-flex">
            <Bell className="h-4 w-4 text-[color:var(--accent)]" />
            {roleTitles[session.user.role]}
          </div>
          <div
            className="flex min-w-[15.5rem] w-full items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 basis-full shrink-0 sm:min-w-[18rem] md:w-auto md:max-w-[22rem] md:basis-auto"
            data-tour="dashboard-profile-control"
          >
            <UserAvatar name={session.user.displayName} className="h-9 w-9 text-xs" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{session.user.displayName}</p>
              <p className="text-xs leading-5 text-[color:var(--muted-foreground)] [overflow-wrap:anywhere] md:truncate">
                {session.organization.name}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void logout()} aria-label="Logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
