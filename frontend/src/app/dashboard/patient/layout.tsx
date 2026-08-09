import type { ReactNode } from "react";

import { requireServerRole } from "@/lib/server-auth";

export default async function PatientDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireServerRole("patient");
  return children;
}
