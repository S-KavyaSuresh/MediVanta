import type { ReactNode } from "react";

import { requireServerRole } from "@/lib/server-auth";

export default async function LaboratoryLayout({ children }: { children: ReactNode }) {
  await requireServerRole("laboratory");
  return children;
}
