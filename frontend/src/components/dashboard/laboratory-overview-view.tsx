"use client";

import { FlaskConical, FileText, TestTubeDiagonal, TimerReset } from "lucide-react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/dashboard/status-badge";

export function LaboratoryOverviewView() {
  const { state } = useHospitalData();

  const requestedCount = state.labRequests.filter((request) => request.status === "Requested").length;
  const processingCount = state.labRequests.filter((request) =>
    request.status === "Scheduled" ||
    request.status === "Sample Collected" ||
    request.status === "Processing",
  ).length;
  const completedCount = state.labRequests.filter((request) => request.status === "Completed").length;
  const releasedReports = state.labReports.length;

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Laboratory Workspace"
        title="Laboratory intake and reporting"
        description="Track incoming test requests, monitor active processing, and keep completed reports moving back into patient care."
      />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="New Requests" value={String(requestedCount)} delta="Awaiting scheduling or sample intake" icon={FlaskConical} />
        <StatCard label="In Progress" value={String(processingCount)} delta="Scheduled, collected, or processing" icon={TimerReset} />
        <StatCard label="Completed Tests" value={String(completedCount)} delta="Finished laboratory requests" icon={TestTubeDiagonal} />
        <StatCard label="Released Reports" value={String(releasedReports)} delta="Reports available to the care journey" icon={FileText} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">Recent requests</h2>
          {state.labRequests.length > 0 ? (
            <div className="space-y-3">
              {[...state.labRequests]
                .sort((left, right) =>
                  `${right.requestedDate}${right.requestedTime}`.localeCompare(
                    `${left.requestedDate}${left.requestedTime}`,
                  ),
                )
                .slice(0, 6)
                .map((request) => (
                  <div
                    key={request.id}
                    className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge status={request.status} />
                      <p className="text-sm text-[color:var(--muted-foreground)]">
                        {request.requestedDate} at {request.requestedTime}
                      </p>
                    </div>
                    <p className="mt-3 font-semibold">{request.testName}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      {request.patientName} · {request.id}
                    </p>
                  </div>
                ))}
            </div>
          ) : (
            <EmptyState
              title="No laboratory requests yet"
              description="New patient requests will appear here as soon as they are submitted."
            />
          )}
        </Card>

        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">Recent report activity</h2>
          {state.labReports.length > 0 ? (
            <div className="space-y-3">
              {[...state.labReports]
                .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))
                .slice(0, 6)
                .map((report) => (
                  <div
                    key={report.id}
                    className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
                  >
                    <p className="font-semibold">{report.reportTitle}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      {report.testName} · {report.uploadedBy.name}
                    </p>
                    <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                      Uploaded {new Intl.DateTimeFormat("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(report.uploadedAt))}
                    </p>
                  </div>
                ))}
            </div>
          ) : (
            <EmptyState
              title="No reports released yet"
              description="Completed laboratory reports will appear here once they are uploaded."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
