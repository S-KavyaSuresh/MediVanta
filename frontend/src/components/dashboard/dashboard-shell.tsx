import type { ReactNode } from "react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[color:var(--background)] text-[color:var(--foreground)] lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
      <DashboardSidebar />
      <div className="min-w-0 max-w-full">
        <DashboardHeader />
        <main className="min-w-0 max-w-full px-4 py-6 sm:px-5 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
