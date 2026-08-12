"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { useEffect, useRef, useState } from "react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { RoleOnboarding } from "@/components/dashboard/role-onboarding";

export function DashboardShell({ children }: { children: ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [compactHeader, setCompactHeader] = useState(false);
  const headerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateLayout = () => {
      setCompactHeader(window.innerWidth < 1024);
      setHeaderHeight(headerRef.current?.offsetHeight ?? 0);
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => updateLayout())
        : null;

    if (observer && headerRef.current) {
      observer.observe(headerRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateLayout);
      observer?.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[color:var(--background)] text-[color:var(--foreground)] lg:grid lg:h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
      <DashboardSidebar
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <div className="min-w-0 max-w-full lg:flex lg:min-h-0 lg:flex-col lg:overflow-y-auto">
        <div
          ref={headerRef}
          className="fixed inset-x-0 top-0 z-30 lg:sticky lg:inset-x-auto lg:top-0"
        >
          <Suspense fallback={null}>
            <DashboardHeader onOpenSidebar={() => setMobileSidebarOpen(true)} />
          </Suspense>
        </div>
        <main
          className="min-w-0 max-w-full px-4 py-4 pb-8 sm:px-5 md:px-8 lg:flex-1"
          style={compactHeader ? { paddingTop: `${headerHeight + 16}px` } : undefined}
        >
          <div className="mx-auto min-w-0 max-w-full">{children}</div>
        </main>
      </div>
      <RoleOnboarding />
    </div>
  );
}
