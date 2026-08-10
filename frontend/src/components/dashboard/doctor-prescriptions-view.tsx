"use client";

import { type FormEvent, useMemo, useState } from "react";

import { StatusBadge } from "@/components/dashboard/status-badge";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AppointmentRecord, PrescriptionDraft } from "@/lib/hospital-data";

const emptyMedicine = {
  medicineName: "",
  dosage: "",
  frequency: "",
  duration: "",
};

function validatePrescriptionDraft(
  draft: PrescriptionDraft,
  patientId: string,
) {
  const errors: Record<string, string> = {};

  if (!patientId) {
    errors.patientId = "Select a valid patient.";
  }

  let activeMedicineRows = 0;

  for (const [index, medicine] of draft.medicines.entries()) {
    const normalizedMedicine = {
      medicineName: medicine.medicineName.trim(),
      dosage: medicine.dosage.trim(),
      frequency: medicine.frequency.trim(),
      duration: medicine.duration.trim(),
    };

    if (!Object.values(normalizedMedicine).some((value) => value.length > 0)) {
      continue;
    }

    activeMedicineRows += 1;

    if (!normalizedMedicine.medicineName) {
      errors[`medicines.${index}.medicineName`] = "Enter the medicine name.";
    }

    if (!normalizedMedicine.dosage) {
      errors[`medicines.${index}.dosage`] = "Enter the dosage.";
    }

    if (!normalizedMedicine.frequency) {
      errors[`medicines.${index}.frequency`] = "Enter the frequency.";
    }

    if (!normalizedMedicine.duration) {
      errors[`medicines.${index}.duration`] = "Enter the duration.";
    }
  }

  if (activeMedicineRows === 0) {
    errors.medicines = "Add at least one medicine to continue.";
  }

  if (draft.instructions.trim().length < 6) {
    errors.instructions = "Enter clear prescription instructions.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
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

export function DoctorPrescriptionsView() {
  const { createPrescription, meta, state } = useHospitalData();
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
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

    for (const profile of meta?.patientProfiles ?? []) {
      if (profile.role !== "patient") {
        continue;
      }

      const patientId = profile.id;
      const existing = grouped.get(patientId);

      if (existing) {
        continue;
      }

      grouped.set(patientId, {
        patientId,
        patientName: profile.patientName ?? profile.displayName,
        appointments: [],
      });
    }

    return [...grouped.values()];
  }, [meta?.patientProfiles, state.appointments]);

  const [draft, setDraft] = useState<PrescriptionDraft>({
    patientId: "",
    appointmentId: "",
    medicines: [emptyMedicine],
    instructions: "",
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
  const prescriptions = useMemo(
    () =>
      [...state.prescriptions].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      ),
    [state.prescriptions],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const validation = validatePrescriptionDraft(draft, activePatientId);
    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      setMessage("Please review the prescription details provided.");
      setSubmitting(false);
      return;
    }

    const normalizedMedicines = draft.medicines
      .map((medicine) => ({
        medicineName: medicine.medicineName.trim(),
        dosage: medicine.dosage.trim(),
        frequency: medicine.frequency.trim(),
        duration: medicine.duration.trim(),
      }))
      .filter((medicine) =>
        Object.values(medicine).some((value) => value.length > 0),
      );

    setFieldErrors({});

    const result = await createPrescription({
      ...draft,
      patientId: activePatientId,
      appointmentId: activeAppointmentId || undefined,
      medicines: normalizedMedicines,
      instructions: draft.instructions.trim(),
    });
    setSubmitting(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      setMessage(result.message ?? "The prescription could not be saved.");
      return;
    }

    setFieldErrors({});
    setMessage("Prescription issued.");
    setDraft((current) => ({
      ...current,
      medicines: [emptyMedicine],
      instructions: "",
    }));
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Doctor Workspace"
        title="Prescriptions"
        description="Issue prescriptions for patients already within your scoped consultation list and review the prescriptions you have issued."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)]">
        <Card className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Create prescription</h2>
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="prescription-patient">
                Patient
              </label>
              <Select
                id="prescription-patient"
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
              <label className="text-sm font-medium" htmlFor="prescription-appointment">
                Linked appointment
              </label>
              <Select
                id="prescription-appointment"
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

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium">Medicines</label>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      medicines: [...current.medicines, emptyMedicine],
                    }))
                  }
                >
                  Add medicine
                </Button>
              </div>

              {draft.medicines.map((medicine, index) => (
                <div
                  key={`medicine-${index}`}
                  className="space-y-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">Medicine {index + 1}</p>
                    {draft.medicines.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            medicines: current.medicines.filter((_, itemIndex) => itemIndex !== index),
                          }))
                        }
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <Input
                    placeholder="Medicine name (e.g. Aspirin)"
                    value={medicine.medicineName}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        medicines: current.medicines.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, medicineName: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                  {fieldErrors[`medicines.${index}.medicineName`] ? (
                    <p className="text-sm text-rose-600 dark:text-rose-300">
                      {fieldErrors[`medicines.${index}.medicineName`]}
                    </p>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input
                      placeholder="Dosage (e.g. 1 tab)"
                      value={medicine.dosage}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          medicines: current.medicines.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, dosage: event.target.value } : item,
                          ),
                        }))
                      }
                    />
                    {fieldErrors[`medicines.${index}.dosage`] ? (
                      <p className="text-sm text-rose-600 dark:text-rose-300 sm:col-span-3">
                        {fieldErrors[`medicines.${index}.dosage`]}
                      </p>
                    ) : null}
                    <Input
                      placeholder="Frequency (e.g. 2x daily)"
                      value={medicine.frequency}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          medicines: current.medicines.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, frequency: event.target.value } : item,
                          ),
                        }))
                      }
                    />
                    {fieldErrors[`medicines.${index}.frequency`] ? (
                      <p className="text-sm text-rose-600 dark:text-rose-300 sm:col-span-3">
                        {fieldErrors[`medicines.${index}.frequency`]}
                      </p>
                    ) : null}
                    <Input
                      placeholder="Duration (e.g. 3 days)"
                      value={medicine.duration}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          medicines: current.medicines.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, duration: event.target.value } : item,
                          ),
                        }))
                      }
                    />
                    {fieldErrors[`medicines.${index}.duration`] ? (
                      <p className="text-sm text-rose-600 dark:text-rose-300 sm:col-span-3">
                        {fieldErrors[`medicines.${index}.duration`]}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
              {fieldErrors.medicines ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">{fieldErrors.medicines}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="prescription-instructions">
                Instructions
              </label>
              <Textarea
                id="prescription-instructions"
                placeholder="Instructions (e.g. Take after meals)"
                value={draft.instructions}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, instructions: event.target.value }))
                }
              />
              {fieldErrors.instructions ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">
                  {fieldErrors.instructions}
                </p>
              ) : null}
            </div>

            {message ? (
              <p className="text-sm text-[color:var(--muted-foreground)]">{message}</p>
            ) : null}

            <Button type="submit" disabled={!patientOptions.length || submitting}>
              {submitting ? "Issuing..." : "Issue Prescription"}
            </Button>
          </form>
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Issued prescriptions</h2>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              {prescriptions.length} prescription{prescriptions.length === 1 ? "" : "s"}
            </p>
          </div>

          {prescriptions.length > 0 ? (
            <div className="space-y-3">
              {prescriptions.map((prescription) => (
                <div
                  key={prescription.id}
                  className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold">{prescription.patientName}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                        {formatDateTime(prescription.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={prescription.status} />
                  </div>
                  <div className="mt-3 space-y-2">
                    {prescription.medicines.map((medicine, index) => (
                      <p key={`${prescription.id}-${index}`} className="text-sm">
                        <span className="font-medium">{medicine.medicineName}</span>: {medicine.dosage} ·{" "}
                        {medicine.frequency} · {medicine.duration}
                      </p>
                    ))}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[color:var(--muted-foreground)]">
                    {prescription.instructions}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No prescriptions yet"
              description="New prescriptions you issue for patients in your current scope will appear here."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
