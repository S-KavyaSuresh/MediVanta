import type { ReactNode } from "react";

import { requireServerRole } from "@/lib/server-auth";

export default async function ReceptionDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireServerRole("receptionist");
  return children;
}
