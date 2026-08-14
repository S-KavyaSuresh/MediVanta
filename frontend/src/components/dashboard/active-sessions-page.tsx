"use client";

import { useRouter } from "next/navigation";

import { ActiveSessionsView } from "@/components/dashboard/active-sessions-view";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export function ActiveSessionsPage({ eyebrow }: { eyebrow: string }) {
  const router = useRouter();

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow={eyebrow}
        title="Active Sessions"
        description="Devices currently signed in to your account."
      />
      <Button type="button" variant="ghost" onClick={() => router.back()}>
        ← Back to Profile
      </Button>
      <ActiveSessionsView />
    </div>
  );
}
