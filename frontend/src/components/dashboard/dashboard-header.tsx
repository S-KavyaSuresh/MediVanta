"use client";

import { Bell, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DashboardHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeQuery = searchParams.get("q") ?? "";

  return (
    <div className="flex flex-col gap-4 border-b border-[color:var(--border)] bg-[color:color-mix(in_oklab,var(--surface)_90%,transparent)] px-4 py-4 backdrop-blur md:flex-row md:items-center md:justify-between md:px-8">
      <form
        key={`${pathname}-${activeQuery}`}
        className="flex min-w-0 w-full max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const query = String(formData.get("dashboard-search") ?? "");
          const trimmed = query.trim();

          if (!trimmed) {
            if (pathname === "/dashboard/search") {
              router.push("/dashboard");
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
      <div className="flex min-w-0 flex-wrap items-center gap-3 md:justify-end">
        <ThemeToggle />
        <div className="hidden items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-xs font-medium text-[color:var(--muted-foreground)] sm:inline-flex">
          <Bell className="h-4 w-4 text-[color:var(--accent)]" />
          Live hospital workspace
        </div>
      </div>
    </div>
  );
}
