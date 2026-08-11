"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { apiRequest } from "@/lib/api";
import type { LabReportRecord } from "@/lib/hospital-data";

type LabReportViewModalProps = {
  open: boolean;
  report: LabReportRecord | null;
  organizationName: string;
  onClose: () => void;
};

function decodeBase64(base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function saveLabReportDownload(report: LabReportRecord, organizationName: string) {
  const formattedDate = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(report.uploadedAt));

  if (report.attachment?.contentBase64) {
    const bytes = decodeBase64(report.attachment.contentBase64);
    downloadBlob(
      report.attachment.fileName,
      new Blob([bytes], { type: report.attachment.contentType }),
    );
    return;
  }

  const fallbackContents = [
    `Report: ${report.reportTitle}`,
    `Test: ${report.testName}`,
    `Hospital: ${organizationName}`,
    `Uploaded: ${formattedDate}`,
    `Uploaded by: ${report.uploadedBy.name}`,
    "",
    report.resultSummary,
  ].join("\n");

  downloadBlob(
    `${report.reportTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`,
    new Blob([fallbackContents], { type: "text/plain;charset=utf-8" }),
  );
}

async function resolveReportForDownload(report: LabReportRecord) {
  if (report.attachment?.contentBase64) {
    return report;
  }

  const payload = await apiRequest<{ report: LabReportRecord }>(
    `/api/hospital/lab-reports/${report.id}`,
  );
  return payload.report;
}

export async function downloadLabReport(report: LabReportRecord, organizationName: string) {
  const fullReport = await resolveReportForDownload(report);
  saveLabReportDownload(fullReport, organizationName);
}

export function LabReportViewModal({
  open,
  report,
  organizationName,
  onClose,
}: LabReportViewModalProps) {
  const [downloading, setDownloading] = useState(false);
  const formattedDate = useMemo(() => {
    if (!report) {
      return "";
    }

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(report.uploadedAt));
  }, [report]);

  if (!report) {
    return null;
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={report.reportTitle}
      description="Review the released laboratory report details and download the report file when available."
    >
      <div className="space-y-4">
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="font-semibold">Test</p>
              <p className="text-[color:var(--muted-foreground)]">{report.testName}</p>
            </div>
            <div>
              <p className="font-semibold">Hospital</p>
              <p className="text-[color:var(--muted-foreground)]">{organizationName}</p>
            </div>
            <div>
              <p className="font-semibold">Uploaded</p>
              <p className="text-[color:var(--muted-foreground)]">{formattedDate}</p>
            </div>
            <div>
              <p className="font-semibold">Uploaded by</p>
              <p className="text-[color:var(--muted-foreground)]">{report.uploadedBy.name}</p>
            </div>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <p className="font-semibold">Result Summary</p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-[color:var(--muted-foreground)]">
            {report.resultSummary}
          </p>
        </Card>

        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={downloading}
            onClick={async () => {
              setDownloading(true);

              try {
                await downloadLabReport(report, organizationName);
              } finally {
                setDownloading(false);
              }
            }}
          >
            {downloading ? "Downloading..." : "Download Report"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
