"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { useState } from "react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { RoleOnboarding } from "@/components/dashboard/role-onboarding";

export function DashboardShell({ children }: { children: ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[color:var(--background)] text-[color:var(--foreground)] lg:grid lg:h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
      <DashboardSidebar
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <div className="min-w-0 max-w-full lg:flex lg:min-h-0 lg:flex-col lg:overflow-y-auto">
        <Suspense fallback={null}>
          <DashboardHeader onOpenSidebar={() => setMobileSidebarOpen(true)} />
        </Suspense>
        <main className="min-w-0 max-w-full px-4 py-4 pb-8 sm:px-5 md:px-8 lg:flex-1">
          <div className="mx-auto min-w-0 max-w-full">{children}</div>
        </main>
      </div>
      <RoleOnboarding />
    </div>
  );
}
