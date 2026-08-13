"use client";

import { Badge } from "@/components/ui/badge";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function DoctorQueueView() {
  const { activeQueueEntries } = useHospitalData();

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Doctor Workspace"
        title="Consultation Queue"
        description="Track the patients currently moving through consultations assigned to your workspace."
      />
      {activeQueueEntries.length > 0 ? (
        <div className="space-y-4">
          {activeQueueEntries.map((entry) => (
            <Card key={entry.id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={entry.status} />
                <Badge
                  variant={
                    entry.priority === "Emergency"
                      ? "danger"
                      : entry.priority === "Priority"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {entry.priority ?? "Normal"}
                </Badge>
                <p className="text-sm text-[color:var(--muted-foreground)]">{entry.id}</p>
              </div>
              <p className="text-lg font-semibold">{entry.patientName}</p>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Checked in {entry.createdAt} · Updated {entry.updatedAt}
              </p>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No active queue entries"
          description="Queue activity linked to your appointments will appear here."
        />
      )}
    </div>
  );
}
