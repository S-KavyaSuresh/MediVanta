import type { ReactNode } from "react";

import { requireServerRole } from "@/lib/server-auth";

export default async function DoctorDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireServerRole("doctor");
  return children;
}
