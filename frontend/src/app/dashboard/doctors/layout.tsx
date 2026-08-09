import type { ReactNode } from "react";

import { requireServerPermission } from "@/lib/server-auth";

export default async function DoctorsRouteLayout({ children }: { children: ReactNode }) {
  await requireServerPermission("doctor:view");
  return children;
}
