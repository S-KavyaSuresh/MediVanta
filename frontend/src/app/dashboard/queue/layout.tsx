import type { ReactNode } from "react";

import { requireServerPermission } from "@/lib/server-auth";

export default async function QueueRouteLayout({ children }: { children: ReactNode }) {
  await requireServerPermission("queue:view");
  return children;
}
