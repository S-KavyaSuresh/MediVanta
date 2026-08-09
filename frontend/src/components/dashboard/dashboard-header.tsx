import { Bell, Search } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DashboardHeader() {
  return (
    <div className="flex flex-col gap-4 border-b border-[color:var(--border)] bg-[color:color-mix(in_oklab,var(--surface)_90%,transparent)] px-4 py-4 backdrop-blur md:flex-row md:items-center md:justify-between md:px-8">
      <div className="relative min-w-0 w-full max-w-xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-foreground)]" />
        <Input
          aria-label="Search dashboard"
          placeholder="Search queues, doctors, departments, or updates"
          className="pl-10"
        />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <ThemeToggle />
        <Button variant="secondary" size="sm">
          <Bell className="h-4 w-4" />
          Alerts
        </Button>
      </div>
    </div>
  );
}
