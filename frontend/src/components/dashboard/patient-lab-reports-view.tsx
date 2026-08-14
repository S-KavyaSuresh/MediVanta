"use client";

import { useMemo, useState } from "react";

import {
  downloadLabReport,
  LabReportViewModal,
} from "@/components/dashboard/lab-report-view-modal";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { LabReportRecord } from "@/lib/hospital-data";

type PatientReportCard = {
  id: string;
  testName: string;
  uploadedAt: string;
  report: LabReportRecord | null;
};

export function PatientLabReportsView() {
  const { state } = useHospitalData();
  const [selectedReport, setSelectedReport] = useState<LabReportRecord | null>(null);

  const reportCards = useMemo(() => {
    const reportsByRequestId = new Map(
      state.labReports.map((report) => [report.labRequestId, report] as const),
    );

    const availableReports: PatientReportCard[] = state.labReports.map((report) => ({
      id: report.id,
      testName: report.testName,
      uploadedAt: report.uploadedAt,
      report,
    }));

    const unavailableReports: PatientReportCard[] = state.labRequests
      .filter(
        (request) =>
          request.status === "Completed" && !reportsByRequestId.has(request.id),
      )
      .map((request) => ({
        id: request.id,
        testName: request.testName,
        uploadedAt:
          request.createdAt ?? `${request.requestedDate}T${request.requestedTime}:00.000Z`,
        report: null,
      }));

    return [...availableReports, ...unavailableReports].sort(
      (left, right) =>
        new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime(),
    );
  }, [state.labReports, state.labRequests]);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="My Dashboard"
        title="Lab Reports"
        description="Review completed laboratory reports linked to your account and download the released report file when available."
      />

      {reportCards.length > 0 ? (
        <div className="space-y-4">
          {reportCards.map((item) => (
            <Card key={item.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{item.testName}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                    {state.organization.name} · Completed{" "}
                    {new Intl.DateTimeFormat("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    }).format(new Date(item.uploadedAt))}
                  </p>
                  <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                    {item.report
                      ? item.report.attachment
                        ? "PDF report available"
                        : "Summary report available"
                      : "Report not available"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.report ? (
                    (() => {
                      const report = item.report;

                      return (
                        <>
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
                        </>
                      );
                    })()
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No completed lab reports yet"
          description="Completed laboratory reports will appear here after the laboratory team releases them."
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
