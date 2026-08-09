"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function DoctorProfilePage() {
  const { session } = useAuth();

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Doctor Workspace"
        title="Profile"
        description="Review the account identity currently linked to your doctor workspace."
      />
      <Card className="space-y-3">
        <p className="text-lg font-semibold">{session.user.displayName}</p>
        <p className="text-sm text-[color:var(--muted-foreground)]">{session.user.email}</p>
        <p className="text-sm text-[color:var(--muted-foreground)]">Role: Doctor</p>
      </Card>
    </div>
  );
}
