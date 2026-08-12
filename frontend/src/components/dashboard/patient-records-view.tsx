"use client";

import { useMemo, useState } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ClinicalAttachmentDraft,
  MedicalHistoryEntryDraft,
} from "@/lib/hospital-data";

function formatRecordDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function PatientRecordsView() {
  const { createClinicalAttachment, createMedicalHistoryEntry, state } = useHospitalData();
  const [historyDraft, setHistoryDraft] = useState<MedicalHistoryEntryDraft>({
    category: "Vaccination" as const,
    title: "",
    details: "",
    recordedDate: "",
    familyMemberId: "",
  });
  const [attachmentDraft, setAttachmentDraft] = useState<ClinicalAttachmentDraft>({
    label: "",
    fileName: "",
    contentType: "application/pdf" as const,
    fileSize: 0,
    contentBase64: "",
    familyMemberId: "",
    medicalRecordId: "",
  });
  const [message, setMessage] = useState<string | null>(null);

  const records = useMemo(
    () =>
      [...state.medicalRecords].sort((left, right) =>
        `${right.visitDate}${right.createdAt}`.localeCompare(`${left.visitDate}${left.createdAt}`),
      ),
    [state.medicalRecords],
  );
  const historyEntries = useMemo(
    () =>
      [...(state.medicalHistoryEntries ?? [])].sort((left, right) =>
        `${right.recordedDate}${right.createdAt}`.localeCompare(`${left.recordedDate}${left.createdAt}`),
      ),
    [state.medicalHistoryEntries],
  );
  const attachments = useMemo(
    () =>
      [...(state.clinicalAttachments ?? [])].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
    [state.clinicalAttachments],
  );

  async function handleAttachmentFile(file: File | null) {
    if (!file) {
      return;
    }

    const contentBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result ?? "");
        resolve(value.includes(",") ? value.split(",")[1] ?? "" : value);
      };
      reader.onerror = () => reject(new Error("Unable to read the file."));
      reader.readAsDataURL(file);
    });

    setAttachmentDraft((current) => ({
      ...current,
      fileName: file.name,
      fileSize: file.size,
      contentType:
        file.type === "image/png" || file.type === "image/jpeg"
          ? (file.type as "image/png" | "image/jpeg")
          : "application/pdf",
      contentBase64,
    }));
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Patient Dashboard"
        title="My Health Records"
        description="Review clinical notes, surgeries, vaccinations, attachments, lab reports, and treatment advice shared as part of your care journey."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {records.length > 0 ? (
            <div className="space-y-4">
              {records.map((record) => (
                <Card key={record.id} className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold">{record.diagnosis}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                        {record.familyMemberId
                          ? `For ${(state.familyMembers ?? []).find((member) => member.id === record.familyMemberId)?.fullName ?? record.patientName}`
                          : "For self"}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                        {record.doctorName} · {formatRecordDate(record.visitDate)}
                      </p>
                    </div>
                    <p className="text-xs font-medium uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                      {record.id}
                    </p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                      <p className="text-sm font-semibold">Clinical Notes</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[color:var(--muted-foreground)]">
                        {record.clinicalNotes}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                      <p className="text-sm font-semibold">Treatment / Advice</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[color:var(--muted-foreground)]">
                        {record.treatmentAdvice}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No medical records yet"
              description="Clinical records shared with your account will appear here after your doctor completes a visit note."
            />
          )}

          <Card className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Medical Reports / Attachments</h2>
              <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                Keep your medical files in one place for future consultations.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium">Label</label>
                <Input
                  value={attachmentDraft.label}
                  onChange={(event) =>
                    setAttachmentDraft((current) => ({ ...current, label: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Linked record</label>
                <Select
                  value={attachmentDraft.medicalRecordId}
                  onChange={(event) =>
                    setAttachmentDraft((current) => ({
                      ...current,
                      medicalRecordId: event.target.value,
                    }))
                  }
                >
                  <option value="">No linked record</option>
                  {records.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.id} · {record.diagnosis}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Family Member</label>
                <Select
                  value={attachmentDraft.familyMemberId}
                  onChange={(event) =>
                    setAttachmentDraft((current) => ({
                      ...current,
                      familyMemberId: event.target.value,
                    }))
                  }
                >
                  <option value="">Self</option>
                  {(state.familyMembers ?? []).map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.fullName}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium">Attachment</label>
                <Input
                  type="file"
                  accept=".pdf,image/png,image/jpeg"
                  onChange={(event) => {
                    void handleAttachmentFile(event.target.files?.[0] ?? null);
                  }}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={async () => {
                  const result = await createClinicalAttachment({
                    ...attachmentDraft,
                    familyMemberId: attachmentDraft.familyMemberId || undefined,
                    medicalRecordId: attachmentDraft.medicalRecordId || undefined,
                  });
                  setMessage(
                    result.ok
                      ? "Attachment uploaded."
                      : result.message ?? "The attachment could not be uploaded.",
                  );
                }}
              >
                Upload Attachment
              </Button>
            </div>

            {attachments.length > 0 ? (
              <div className="space-y-3">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4"
                  >
                    <p className="font-semibold">{attachment.label}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      {attachment.fileName} · {Math.round(attachment.fileSize / 1024)} KB
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Surgeries and Vaccinations</h2>
              <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                Add your personal medical history to help your care team review it quickly.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={historyDraft.category}
                  onChange={(event) =>
                    setHistoryDraft((current) => ({
                      ...current,
                      category: event.target.value as "Vaccination" | "Surgery",
                    }))
                  }
                >
                  <option value="Vaccination">Vaccination</option>
                  <option value="Surgery">Surgery</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={historyDraft.recordedDate}
                  onChange={(event) =>
                    setHistoryDraft((current) => ({
                      ...current,
                      recordedDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={historyDraft.title}
                  onChange={(event) =>
                    setHistoryDraft((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Family Member</label>
                <Select
                  value={historyDraft.familyMemberId}
                  onChange={(event) =>
                    setHistoryDraft((current) => ({
                      ...current,
                      familyMemberId: event.target.value,
                    }))
                  }
                >
                  <option value="">Self</option>
                  {(state.familyMembers ?? []).map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.fullName}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium">Details</label>
                <Textarea
                  value={historyDraft.details}
                  onChange={(event) =>
                    setHistoryDraft((current) => ({ ...current, details: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={async () => {
                  const result = await createMedicalHistoryEntry({
                    ...historyDraft,
                    details: historyDraft.details || undefined,
                    familyMemberId: historyDraft.familyMemberId || undefined,
                  });
                  setMessage(
                    result.ok
                      ? "Medical history saved."
                      : result.message ?? "The medical history entry could not be saved.",
                  );
                }}
              >
                Save History
              </Button>
            </div>

            {message ? <p className="text-sm text-[color:var(--muted-foreground)]">{message}</p> : null}
          </Card>

          <Card className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Structured History</h2>
              <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                Previous surgeries and vaccination records appear here.
              </p>
            </div>

            {historyEntries.length > 0 ? (
              <div className="space-y-3">
                {historyEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4"
                  >
                    <p className="font-semibold">{entry.title}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      {entry.category} · {entry.recordedDate}
                    </p>
                    {entry.details ? (
                      <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                        {entry.details}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No structured history yet"
                description="Vaccinations and surgeries that you add will appear here."
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
