import type { ReactNode } from "react";

import { requireServerRole } from "@/lib/server-auth";

export default async function PharmacyLayout({ children }: { children: ReactNode }) {
  await requireServerRole("pharmacist");
  return children;
}
