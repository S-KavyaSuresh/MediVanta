import type { ReactNode } from "react";

import { requireServerPermission } from "@/lib/server-auth";

export default async function SearchRouteLayout({ children }: { children: ReactNode }) {
  await requireServerPermission("search:view");
  return children;
}
