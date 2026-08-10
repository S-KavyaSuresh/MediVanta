"use client";

import { type FormEvent, useMemo, useState } from "react";

import {
  LabReportViewModal,
  downloadLabReport,
} from "@/components/dashboard/lab-report-view-modal";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  AppointmentRecord,
  LabReportRecord,
  MedicalRecordDraft,
  MedicalRecordRecord,
} from "@/lib/hospital-data";
import { getCurrentLocalDateIso } from "@/lib/hospital-data";

function formatVisitDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function canEditRecord(record: MedicalRecordRecord) {
  const createdAt = new Date(record.createdAt).getTime();

  if (Number.isNaN(createdAt)) {
    return false;
  }

  return Date.now() - createdAt <= 3 * 60 * 60 * 1000;
}

export function DoctorRecordsView() {
  const { createMedicalRecord, state, updateMedicalRecord } = useHospitalData();
  const [selectedReport, setSelectedReport] = useState<LabReportRecord | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    diagnosis: "",
    clinicalNotes: "",
    treatmentAdvice: "",
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editMessage, setEditMessage] = useState<string | null>(null);

  const patientOptions = useMemo(() => {
    const grouped = new Map<string, { patientId: string; patientName: string; appointments: AppointmentRecord[] }>();

    for (const appointment of state.appointments) {
      const patientId =
        appointment.patientId ?? `external:${appointment.patientName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const existing = grouped.get(patientId);

      if (existing) {
        existing.appointments.push(appointment);
        continue;
      }

      grouped.set(patientId, {
        patientId,
        patientName: appointment.patientName,
        appointments: [appointment],
      });
    }

    return [...grouped.values()];
  }, [state.appointments]);

  const [draft, setDraft] = useState<MedicalRecordDraft>({
    patientId: "",
    appointmentId: "",
    visitDate: getCurrentLocalDateIso(),
    diagnosis: "",
    clinicalNotes: "",
    treatmentAdvice: "",
  });
  const activePatientId =
    draft.patientId && patientOptions.some((patient) => patient.patientId === draft.patientId)
      ? draft.patientId
      : (patientOptions[0]?.patientId ?? "");
  const selectedPatient = patientOptions.find((patient) => patient.patientId === activePatientId);
  const activeAppointmentId =
    draft.appointmentId &&
    selectedPatient?.appointments.some((appointment) => appointment.id === draft.appointmentId)
      ? draft.appointmentId
      : (selectedPatient?.appointments[0]?.id ?? "");
  const records = useMemo(
    () =>
      [...state.medicalRecords].sort((left, right) =>
        `${right.visitDate}${right.createdAt}`.localeCompare(`${left.visitDate}${left.createdAt}`),
      ),
    [state.medicalRecords],
  );
  const linkedLabReports = useMemo(() => {
    const requestsById = new Map(state.labRequests.map((request) => [request.id, request]));

    return [...state.labReports]
      .map((report) => ({
        report,
        request: requestsById.get(report.labRequestId),
      }))
      .sort(
        (left, right) =>
          new Date(right.report.uploadedAt).getTime() - new Date(left.report.uploadedAt).getTime(),
      );
  }, [state.labReports, state.labRequests]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const result = await createMedicalRecord({
      ...draft,
      patientId: activePatientId,
      appointmentId: activeAppointmentId || undefined,
    });

    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      setMessage(result.message ?? "The medical record could not be saved.");
      return;
    }

    setFieldErrors({});
    setMessage("Medical record saved.");
    setDraft((current) => ({
      ...current,
      diagnosis: "",
      clinicalNotes: "",
      treatmentAdvice: "",
    }));
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Doctor Workspace"
        title="Medical Records"
        description="Document visit outcomes for patients already in your care and review the records linked to your consultations."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)]">
        <Card className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Create medical record</h2>
            <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
              Only patients from your assigned consultation list can be selected here.
            </p>
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="record-patient">
                Patient
              </label>
              <Select
                id="record-patient"
                value={activePatientId}
                onChange={(event) => {
                  const nextPatient = patientOptions.find(
                    (patient) => patient.patientId === event.target.value,
                  );
                  setDraft((current) => ({
                    ...current,
                    patientId: event.target.value,
                    appointmentId: nextPatient?.appointments[0]?.id ?? "",
                  }));
                }}
              >
                {patientOptions.map((patient) => (
                  <option key={patient.patientId} value={patient.patientId}>
                    {patient.patientName}
                  </option>
                ))}
              </Select>
              {fieldErrors.patientId ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">{fieldErrors.patientId}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="record-appointment">
                Linked appointment
              </label>
              <Select
                id="record-appointment"
                value={activeAppointmentId}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, appointmentId: event.target.value }))
                }
              >
                <option value="">No linked appointment</option>
                {selectedPatient?.appointments.map((appointment) => (
                  <option key={appointment.id} value={appointment.id}>
                    {appointment.id} · {appointment.appointmentDate} {appointment.appointmentTime}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="record-date">
                Visit date
              </label>
              <Input
                id="record-date"
                type="date"
                value={draft.visitDate}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, visitDate: event.target.value }))
                }
              />
              {fieldErrors.visitDate ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">{fieldErrors.visitDate}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="record-diagnosis">
                Diagnosis
              </label>
              <Input
                id="record-diagnosis"
                value={draft.diagnosis}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, diagnosis: event.target.value }))
                }
              />
              {fieldErrors.diagnosis ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">{fieldErrors.diagnosis}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="record-notes">
                Clinical notes
              </label>
              <Textarea
                id="record-notes"
                value={draft.clinicalNotes}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, clinicalNotes: event.target.value }))
                }
              />
              {fieldErrors.clinicalNotes ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">
                  {fieldErrors.clinicalNotes}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="record-advice">
                Treatment / advice
              </label>
              <Textarea
                id="record-advice"
                value={draft.treatmentAdvice}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, treatmentAdvice: event.target.value }))
                }
              />
              {fieldErrors.treatmentAdvice ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">
                  {fieldErrors.treatmentAdvice}
                </p>
              ) : null}
            </div>

            {message ? (
              <p className="text-sm text-[color:var(--muted-foreground)]">{message}</p>
            ) : null}

            <Button type="submit" disabled={!patientOptions.length}>
              Save Record
            </Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Recent records</h2>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                {records.length} record{records.length === 1 ? "" : "s"}
              </p>
            </div>

            {records.length > 0 ? (
              <div className="space-y-3">
                {records.map((record) => {
                  const editable = canEditRecord(record);
                  const isEditing = editingRecordId === record.id;

                  return (
                    <div
                      key={record.id}
                      className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-base font-semibold">{record.patientName}</p>
                          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                            {record.diagnosis} · {formatVisitDate(record.visitDate)}
                          </p>
                          <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                            Created {formatDateTime(record.createdAt)}
                            {record.updatedAt ? ` · Edited ${formatDateTime(record.updatedAt)}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <p className="text-xs font-medium uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                            {record.id}
                          </p>
                          {editable ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setEditingRecordId(record.id);
                                setEditDraft({
                                  diagnosis: record.diagnosis,
                                  clinicalNotes: record.clinicalNotes,
                                  treatmentAdvice: record.treatmentAdvice,
                                });
                                setEditErrors({});
                                setEditMessage(null);
                              }}
                            >
                              Edit
                            </Button>
                          ) : (
                            <p className="text-xs text-[color:var(--muted-foreground)]">
                              Editing period ended
                            </p>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="mt-3 space-y-3">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Diagnosis</label>
                            <Input
                              value={editDraft.diagnosis}
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  diagnosis: event.target.value,
                                }))
                              }
                            />
                            {editErrors.diagnosis ? (
                              <p className="text-sm text-rose-600 dark:text-rose-300">
                                {editErrors.diagnosis}
                              </p>
                            ) : null}
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Clinical notes</label>
                            <Textarea
                              value={editDraft.clinicalNotes}
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  clinicalNotes: event.target.value,
                                }))
                              }
                            />
                            {editErrors.clinicalNotes ? (
                              <p className="text-sm text-rose-600 dark:text-rose-300">
                                {editErrors.clinicalNotes}
                              </p>
                            ) : null}
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Treatment / advice</label>
                            <Textarea
                              value={editDraft.treatmentAdvice}
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  treatmentAdvice: event.target.value,
                                }))
                              }
                            />
                            {editErrors.treatmentAdvice ? (
                              <p className="text-sm text-rose-600 dark:text-rose-300">
                                {editErrors.treatmentAdvice}
                              </p>
                            ) : null}
                          </div>
                          {editMessage ? (
                            <p className="text-sm text-[color:var(--muted-foreground)]">{editMessage}</p>
                          ) : null}
                          <div className="flex flex-wrap justify-end gap-3">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setEditingRecordId(null);
                                setEditErrors({});
                                setEditMessage(null);
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={async () => {
                                const result = await updateMedicalRecord(record.id, editDraft);

                                if (!result.ok) {
                                  setEditErrors(result.fieldErrors ?? {});
                                  setEditMessage(
                                    result.message ?? "The medical record could not be updated.",
                                  );
                                  return;
                                }

                                setEditErrors({});
                                setEditMessage(null);
                                setEditingRecordId(null);
                              }}
                            >
                              Save Changes
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[color:var(--muted-foreground)]">
                            {record.clinicalNotes}
                          </p>
                          <p className="mt-3 text-sm">
                            <span className="font-medium">Advice:</span> {record.treatmentAdvice}
                          </p>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No medical records yet"
                description="New records you create for patients in your scope will appear here."
              />
            )}
          </Card>

          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Linked lab reports</h2>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Scoped to your current patient list
              </p>
            </div>

            {linkedLabReports.length > 0 ? (
              <div className="space-y-3">
                {linkedLabReports.map(({ report, request }) => (
                  <div
                    key={report.id}
                    className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4"
                  >
                    <p className="font-semibold">{report.testName}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      {request?.patientName ?? "Linked patient"} ·{" "}
                      {new Intl.DateTimeFormat("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      }).format(new Date(report.uploadedAt))}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Button type="button" variant="secondary" onClick={() => setSelectedReport(report)}>
                        View Report
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => downloadLabReport(report, state.organization.name)}
                      >
                        Download Report
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No linked lab reports yet"
                description="Completed laboratory reports for patients in your current scope will appear here."
              />
            )}
          </Card>
        </div>
      </div>

      <LabReportViewModal
        open={Boolean(selectedReport)}
        report={selectedReport}
        organizationName={state.organization.name}
        onClose={() => setSelectedReport(null)}
      />
    </div>
  );
}
