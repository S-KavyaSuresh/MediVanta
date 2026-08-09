"use client";

import { useState } from "react";

import { LabRequestFormModal } from "@/components/dashboard/lab-request-form-modal";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function PatientLabTestsView() {
  const { createLabRequest, getDepartmentName, state } = useHospitalData();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Patient Dashboard"
        title="Lab Tests"
        description="Request a new lab test and track the status of your existing laboratory requests."
        action={
          <Button type="button" onClick={() => setOpen(true)}>
            Book Lab Test
          </Button>
        }
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
                {getDepartmentName(request.departmentId)} · {request.id}
              </p>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No lab tests requested yet"
          description="Request a lab test to keep your upcoming diagnostic visits in one place."
        />
      )}
      <LabRequestFormModal
        open={open}
        organizationName={state.organization.name}
        labTests={state.labTests}
        existingRequests={state.labRequests}
        onClose={() => setOpen(false)}
        onSubmit={createLabRequest}
      />
    </div>
  );
}
