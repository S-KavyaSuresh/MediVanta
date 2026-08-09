import type { ReactNode } from "react";

import { HospitalDataProvider } from "@/components/dashboard/hospital-data-provider";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <HospitalDataProvider>
      <DashboardShell>{children}</DashboardShell>
    </HospitalDataProvider>
  );
}
