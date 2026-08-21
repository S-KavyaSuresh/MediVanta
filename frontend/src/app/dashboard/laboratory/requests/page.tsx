"use client";

import { useMemo, useState } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { LabReportFormModal } from "@/components/dashboard/lab-report-form-modal";
import { LabReportViewModal } from "@/components/dashboard/lab-report-view-modal";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  getLabSlotCapacityStatus,
  type LabReportRecord,
  type LabRequestRecord,
} from "@/lib/hospital-data";

const nextStatusLabels: Record<LabRequestRecord["status"], LabRequestRecord["status"] | null> = {
  Requested: "Scheduled",
  Scheduled: "Sample Collected",
  "Sample Collected": "Processing",
  Processing: null,
  Completed: null,
  Missed: null,
};

export default function LaboratoryRequestsPage() {
  const { createLabReport, state, updateLabRequestStatus } = useHospitalData();
  const [activeRequest, setActiveRequest] = useState<LabRequestRecord | null>(null);
  const [selectedReport, setSelectedReport] = useState<LabReportRecord | null>(null);
  const [message, setMessage] = useState("");
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const reportsByRequestId = useMemo(
    () => new Map(state.labReports.map((report) => [report.labRequestId, report] as const)),
    [state.labReports],
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Laboratory Workspace"
        title="Laboratory Requests"
        description="Review incoming patient lab requests, advance each request through the laboratory workflow, and release reports when processing is complete."
      />

      {message ? (
        <p className="rounded-2xl border border-[color:var(--danger)]/20 bg-[color:var(--danger)]/8 px-4 py-3 text-sm text-[color:var(--danger)]">
          {message}
        </p>
      ) : null}

      {state.labRequests.length > 0 ? (
        <div className="space-y-4">
          {[...state.labRequests]
            .sort((left, right) =>
              `${right.requestedDate}${right.requestedTime}`.localeCompare(
                `${left.requestedDate}${left.requestedTime}`,
              ),
            )
            .map((request) => {
              const nextStatus = nextStatusLabels[request.status];
              const existingReport = reportsByRequestId.get(request.id);
              const canAddReport =
                request.status === "Sample Collected" ||
                request.status === "Processing" ||
                request.status === "Completed";
              const slotLoad = getLabSlotCapacityStatus(
                state,
                request.requestedDate,
                request.requestedTime,
              );

              return (
                <Card key={request.id} className="space-y-4">
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
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  Slot load: {request.requestedTime} - {slotLoad.detail} {slotLoad.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {nextStatus ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={submittingId === request.id}
                      onClick={async () => {
                        setSubmittingId(request.id);
                        setMessage("");
                        const result = await updateLabRequestStatus(request.id, nextStatus);
                        setSubmittingId(null);

                        if (!result.ok) {
                          setMessage(
                            result.message ?? "The laboratory request could not be updated.",
                          );
                        }
                      }}
                    >
                      {submittingId === request.id ? "Updating..." : `Mark ${nextStatus}`}
                    </Button>
                  ) : null}

                  {canAddReport ? (
                    existingReport ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setSelectedReport(existingReport)}
                      >
                        View Report
                      </Button>
                    ) : (
                      <Button type="button" onClick={() => setActiveRequest(request)}>
                        Add Report
                      </Button>
                    )
                  ) : null}
                </div>
                </Card>
              );
            })}
        </div>
      ) : (
        <EmptyState
          title="No laboratory requests yet"
          description="New patient lab requests will appear here as soon as they are submitted."
        />
      )}

      <LabReportFormModal
        open={Boolean(activeRequest)}
        request={activeRequest}
        onClose={() => setActiveRequest(null)}
        onSubmit={createLabReport}
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
