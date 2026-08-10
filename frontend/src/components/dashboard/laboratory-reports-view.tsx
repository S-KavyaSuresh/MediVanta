"use client";

import { useMemo, useState } from "react";

import { LabReportViewModal } from "@/components/dashboard/lab-report-view-modal";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { LabReportRecord } from "@/lib/hospital-data";

export function LaboratoryReportsView() {
  const { state } = useHospitalData();
  const [selectedReport, setSelectedReport] = useState<LabReportRecord | null>(null);

  const completedReports = useMemo(
    () =>
      [...state.labReports].sort(
        (left, right) =>
          new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime(),
      ),
    [state.labReports],
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Laboratory Workspace"
        title="Lab Reports"
        description="Review completed laboratory reports, confirm release details, and download the attached PDF file or summary export."
      />

      {completedReports.length > 0 ? (
        <div className="space-y-4">
          {completedReports.map((report) => (
            <Card key={report.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{report.testName}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                    {report.reportTitle} ·{" "}
                    {new Intl.DateTimeFormat("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    }).format(new Date(report.uploadedAt))}
                  </p>
                  <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                    Uploaded by {report.uploadedBy.name}
                  </p>
                </div>
                <Button type="button" variant="secondary" onClick={() => setSelectedReport(report)}>
                  View Report
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No completed reports yet"
          description="Completed laboratory reports will appear here once the laboratory team releases them."
        />
      )}

      <LabReportViewModal
        open={Boolean(selectedReport)}
        report={selectedReport}
        organizationName={state.organization.name}
        onClose={() => setSelectedReport(null)}
      />
    </div>
  );
}
