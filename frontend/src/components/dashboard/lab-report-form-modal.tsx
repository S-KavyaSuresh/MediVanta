"use client";

import type { ChangeEvent } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import type { LabReportDraft, LabRequestRecord } from "@/lib/hospital-data";

type LabReportFormModalProps = {
  open: boolean;
  request: LabRequestRecord | null;
  onClose: () => void;
  onSubmit: (
    labRequestId: string,
    draft: LabReportDraft,
  ) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Partial<Record<keyof LabReportDraft, string>>;
  }>;
};

const emptyDraft: LabReportDraft = {
  reportTitle: "",
  resultSummary: "",
};

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.readAsDataURL(file);
  });
}

export function LabReportFormModal({
  open,
  request,
  onClose,
  onSubmit,
}: LabReportFormModalProps) {
  const [draft, setDraft] = useState<LabReportDraft>(emptyDraft);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof LabReportDraft, string>>>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!request) {
    return null;
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setDraft(emptyDraft);
        setFile(null);
        setErrors({});
        setMessage("");
        onClose();
      }}
      title={`Add Report for ${request.testName}`}
      description="Enter a patient-facing result summary and optionally attach a PDF report for download."
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          setErrors({});
          setMessage("");

          try {
            const nextDraft: LabReportDraft = {
              ...draft,
            };

            if (file) {
              nextDraft.attachment = {
                fileName: file.name,
                contentType: "application/pdf",
                fileSize: file.size,
                contentBase64: await readFileAsBase64(file),
              };
            }

            const result = await onSubmit(request.id, nextDraft);
            setSubmitting(false);
            setErrors(result.fieldErrors ?? {});

            if (result.ok) {
              setDraft(emptyDraft);
              setFile(null);
              onClose();
              return;
            }

            setMessage(result.message ?? "The laboratory report could not be saved.");
          } catch (error) {
            setSubmitting(false);
            setMessage(
              error instanceof Error
                ? error.message
                : "The selected report file could not be prepared.",
            );
          }
        }}
      >
        <div>
          <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
            Report title
          </label>
          <Input
            value={draft.reportTitle}
            onChange={(event) =>
              setDraft((current) => ({ ...current, reportTitle: event.target.value }))
            }
            placeholder="Example: CBC Summary Report"
          />
          {errors.reportTitle ? (
            <p className="mt-2 text-sm text-[color:var(--danger)]">{errors.reportTitle}</p>
          ) : null}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
            Result summary
          </label>
          <Textarea
            value={draft.resultSummary}
            onChange={(event) =>
              setDraft((current) => ({ ...current, resultSummary: event.target.value }))
            }
            placeholder="Add observations and a concise result summary for the patient record."
          />
          {errors.resultSummary ? (
            <p className="mt-2 text-sm text-[color:var(--danger)]">{errors.resultSummary}</p>
          ) : null}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
            Optional PDF report
          </label>
          <Input
            type="file"
            accept="application/pdf"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setFile(event.target.files?.[0] ?? null)
            }
          />
          <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
            PDF only, up to 2 MB.
          </p>
          {errors.attachment ? (
            <p className="mt-2 text-sm text-[color:var(--danger)]">{errors.attachment}</p>
          ) : null}
        </div>

        {message ? (
          <p className="rounded-2xl border border-[color:var(--danger)]/20 bg-[color:var(--danger)]/8 px-4 py-3 text-sm text-[color:var(--danger)]">
            {message}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save Report"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
