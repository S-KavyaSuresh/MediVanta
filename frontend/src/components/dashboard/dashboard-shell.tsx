"use client";

import type { CSSProperties, ReactNode } from "react";
import { Suspense } from "react";
import { useState } from "react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { RoleOnboarding } from "@/components/dashboard/role-onboarding";

export function DashboardShell({ children }: { children: ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileHeaderHeight, setMobileHeaderHeight] = useState(0);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[color:var(--background)] text-[color:var(--foreground)] lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
      <DashboardSidebar
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <div className="min-w-0 max-w-full">
        <Suspense fallback={null}>
          <DashboardHeader
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            onHeightChange={setMobileHeaderHeight}
          />
        </Suspense>
        <main
          className="min-w-0 max-w-full px-4 pb-8 pt-[calc(var(--dashboard-mobile-header-height,0px)+1rem)] sm:px-5 md:px-8 lg:pt-8"
          style={
            mobileHeaderHeight
              ? ({
                  "--dashboard-mobile-header-height": `${mobileHeaderHeight}px`,
                } as CSSProperties)
              : undefined
          }
        >
          <div className="mx-auto min-w-0 max-w-full">{children}</div>
        </main>
      </div>
      <RoleOnboarding />
    </div>
  );
}
