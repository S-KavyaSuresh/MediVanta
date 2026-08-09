"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function AdminProfilePage() {
  const { session } = useAuth();

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Profile"
        description="Review the account identity currently linked to your administration workspace."
      />
      <Card className="space-y-3">
        <p className="text-lg font-semibold">{session.user.displayName}</p>
        <p className="text-sm text-[color:var(--muted-foreground)]">{session.user.email}</p>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Organization: {session.organization.name}
        </p>
      </Card>
    </div>
  );
}
