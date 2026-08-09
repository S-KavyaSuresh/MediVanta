import type { ReactNode } from "react";

import { requireServerPermission } from "@/lib/server-auth";

export default async function DepartmentsRouteLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireServerPermission("department:view");
  return children;
}
