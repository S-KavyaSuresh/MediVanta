"use client";

import { useMemo, useState } from "react";

import {
  downloadLabReport,
  LabReportViewModal,
} from "@/components/dashboard/lab-report-view-modal";
import { LabRequestFormModal } from "@/components/dashboard/lab-request-form-modal";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { LabReportRecord } from "@/lib/hospital-data";

export function PatientLabTestsView() {
  const { session } = useAuth();
  const { createLabRequest, getDepartmentName, meta, state } = useHospitalData();
  const [open, setOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<LabReportRecord | null>(null);

  const reportsByRequestId = useMemo(
    () => new Map(state.labReports.map((report) => [report.labRequestId, report] as const)),
    [state.labReports],
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Patient Dashboard"
        title="Lab Tests"
        description="Request a new lab test, book for a linked family member when needed, and track the status of your laboratory requests."
        action={
          <Button type="button" onClick={() => setOpen(true)}>
            Book Lab Test
          </Button>
        }
      />
      {state.labRequests.length > 0 ? (
        <div className="space-y-4">
          {state.labRequests.map((request) => {
            const report = reportsByRequestId.get(request.id);
            const familyMemberName = request.familyMemberId
              ? state.familyMembers?.find((member) => member.id === request.familyMemberId)?.fullName
              : null;

            return (
              <Card key={request.id} className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={request.status} />
                  <p className="text-sm text-[color:var(--muted-foreground)]">
                    {request.requestedDate} at {request.requestedTime}
                  </p>
                </div>
                <p className="text-lg font-semibold">{request.testName}</p>
                <div className="space-y-1 text-sm text-[color:var(--muted-foreground)]">
                  <p>{state.organization.name}</p>
                  <p>{getDepartmentName(request.departmentId)} · {request.id}</p>
                  {familyMemberName ? <p>Request for {familyMemberName}</p> : null}
                </div>
                {request.status === "Completed" ? (
                  report ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setSelectedReport(report)}
                      >
                        View Report
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          void downloadLabReport(report, state.organization.name);
                        }}
                      >
                        Download Report
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-[color:var(--muted-foreground)]">
                      Report not available
                    </p>
                  )
                ) : null}
              </Card>
            );
          })}
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
        bookingCapacity={state.bookingCapacity}
        labSlotLoads={meta?.labSlotLoads ?? []}
        labTests={state.labTests}
        existingRequests={state.labRequests}
        patientName={session.user.patientName ?? session.user.displayName}
        familyMembers={state.familyMembers}
        onClose={() => setOpen(false)}
        onSubmit={createLabRequest}
      />
      <LabReportViewModal
        open={Boolean(selectedReport)}
        report={selectedReport}
        organizationName={state.organization.name}
        onClose={() => setSelectedReport(null)}
      />
    </div>
  );
}
