import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { HospitalDataProvider } from "@/components/dashboard/hospital-data-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { fetchServerHospitalState } from "@/lib/server-auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const hospitalResponse = await fetchServerHospitalState();

  return (
    <AuthProvider initialSession={hospitalResponse.session}>
      <HospitalDataProvider
        initialState={hospitalResponse.state}
        initialMeta={hospitalResponse.meta}
      >
        <DashboardShell>{children}</DashboardShell>
      </HospitalDataProvider>
    </AuthProvider>
  );
}
