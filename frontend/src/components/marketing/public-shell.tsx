import type { ReactNode } from "react";

import { LandingHeader } from "@/components/marketing/landing-header";
import { PublicFooter } from "@/components/marketing/public-footer";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <LandingHeader />
      <main>{children}</main>
      <PublicFooter />
    </div>
  );
}
