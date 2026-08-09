"use client";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export default function LaboratoryRequestsPage() {
  const { state } = useHospitalData();

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Laboratory Workspace"
        title="Laboratory Requests"
        description="Review incoming patient lab requests and track their current request status."
      />
      {state.labRequests.length > 0 ? (
        <div className="space-y-4">
          {state.labRequests.map((request) => (
            <Card key={request.id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={request.status} />
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  {request.requestedDate} at {request.requestedTime}
                </p>
              </div>
              <p className="text-lg font-semibold">{request.testName}</p>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                {request.patientName} · {request.id}
              </p>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No laboratory requests yet"
          description="New patient lab requests will appear here as soon as they are submitted."
        />
      )}
    </div>
  );
}
