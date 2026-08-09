import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { HospitalDataProvider } from "@/components/dashboard/hospital-data-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { fetchServerHospitalState, requireServerSession } from "@/lib/server-auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [session, hospitalResponse] = await Promise.all([
    requireServerSession(),
    fetchServerHospitalState(),
  ]);

  return (
    <AuthProvider initialSession={session}>
      <HospitalDataProvider
        initialState={hospitalResponse.state}
        initialMeta={hospitalResponse.meta}
      >
        <DashboardShell>{children}</DashboardShell>
      </HospitalDataProvider>
    </AuthProvider>
  );
}
