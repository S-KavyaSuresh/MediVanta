import type { ReactNode } from "react";

import { requireServerPermission } from "@/lib/server-auth";

export default async function AppointmentsRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireServerPermission("appointment:view");
  return children;
}
