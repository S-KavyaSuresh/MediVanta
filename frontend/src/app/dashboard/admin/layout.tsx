import type { ReactNode } from "react";

import { requireServerRole } from "@/lib/server-auth";

export default async function AdminDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireServerRole("administrator");
  return children;
}
