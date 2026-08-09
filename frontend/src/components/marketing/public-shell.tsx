import type { ReactNode } from "react";

import { LandingHeader } from "@/components/marketing/landing-header";
import { PublicFooter } from "@/components/marketing/public-footer";
import { getOptionalServerSession } from "@/lib/server-auth";

export async function PublicShell({ children }: { children: ReactNode }) {
  const session = await getOptionalServerSession();

  return (
    <div className="min-h-screen">
      <LandingHeader session={session} />
      <main>{children}</main>
      <PublicFooter />
    </div>
  );
}
