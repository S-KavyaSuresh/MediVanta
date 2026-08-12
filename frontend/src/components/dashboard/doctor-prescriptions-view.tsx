"use client";

import Link from "next/link";
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
import {
  formatPrescriptionDose,
  formatPrescriptionDuration,
  formatPrescriptionMedicineName,
  type AppointmentRecord,
  type MedicineCatalogRecord,
  type PrescriptionDraft,
} from "@/lib/hospital-data";

const frequencyOptions = [
  "Once daily",
  "Twice daily",
  "Three times daily",
  "Four times daily",
  "Weekly",
  "As needed",
] as const;

const durationUnits = ["days", "weeks", "months"] as const;

const emptyMedicine = {
  medicineId: "",
  medicineName: "",
  strength: "",
  doseQuantity: 1,
  doseUnit: "",
  dosage: "",
  frequency: "Once daily",
  durationValue: 1,
  durationUnit: "days",
  duration: "",
  totalQuantity: 1,
  instructions: "",
} satisfies PrescriptionDraft["medicines"][number];

type CatalogOption = {
  medicine: MedicineCatalogRecord;
  stockQuantity: number;
  stockLabel: string;
  stockToneClassName: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getAdministrationsPerDay(frequency: string) {
  const normalized = frequency.trim().toLowerCase();

  if (normalized.includes("once")) {
    return 1;
  }

  if (normalized.includes("twice")) {
    return 2;
  }

  if (normalized.includes("three")) {
    return 3;
  }

  if (normalized.includes("four")) {
    return 4;
  }

  return 1;
}

function requiresManualTotalQuantity(
  frequency: string,
  durationUnit?: string,
) {
  const normalizedFrequency = frequency.trim().toLowerCase();
  const normalizedDurationUnit = durationUnit?.trim().toLowerCase() ?? "";

  return (
    normalizedFrequency.includes("as needed") ||
    normalizedDurationUnit.startsWith("month")
  );
}

function calculateTotalQuantity(
  medicine: PrescriptionDraft["medicines"][number],
) {
  const doseQuantity =
    medicine.doseQuantity && medicine.doseQuantity > 0
      ? Math.max(1, Math.round(medicine.doseQuantity))
      : undefined;
  const durationValue =
    medicine.durationValue && medicine.durationValue > 0
      ? Math.max(1, Math.round(medicine.durationValue))
      : undefined;
  const normalizedFrequency = medicine.frequency.trim().toLowerCase();
  const normalizedDurationUnit = medicine.durationUnit?.trim().toLowerCase() ?? "";

  if (!doseQuantity || !durationValue) {
    return undefined;
  }

  if (requiresManualTotalQuantity(medicine.frequency, medicine.durationUnit)) {
    return medicine.totalQuantity && medicine.totalQuantity > 0
      ? Math.max(1, Math.round(medicine.totalQuantity))
      : undefined;
  }

  if (normalizedFrequency.includes("weekly")) {
    if (normalizedDurationUnit.startsWith("week")) {
      return doseQuantity * durationValue;
    }

    if (normalizedDurationUnit.startsWith("day")) {
      return doseQuantity * Math.max(1, Math.ceil(durationValue / 7));
    }
  }

  const durationDays = normalizedDurationUnit.startsWith("week")
    ? durationValue * 7
    : durationValue;
  return doseQuantity * getAdministrationsPerDay(medicine.frequency) * durationDays;
}

function buildDisplayMedicine(
  medicine: PrescriptionDraft["medicines"][number],
): PrescriptionDraft["medicines"][number] {
  const totalQuantity = calculateTotalQuantity(medicine);

  return {
    ...medicine,
    dosage: `${medicine.doseQuantity ?? 1} ${medicine.doseUnit ?? ""}`.trim(),
    duration: `${medicine.durationValue ?? 1} ${medicine.durationUnit ?? ""}`.trim(),
    totalQuantity:
      requiresManualTotalQuantity(medicine.frequency, medicine.durationUnit)
        ? medicine.totalQuantity
        : totalQuantity,
  };
}

function validatePrescriptionDraft(draft: PrescriptionDraft, patientId: string) {
  const errors: Record<string, string> = {};

  if (!patientId) {
    errors.patientId = "Select a valid patient.";
  }

  if (draft.medicines.length === 0) {
    errors.medicines = "Add at least one medicine to continue.";
  }

  for (const [index, medicine] of draft.medicines.entries()) {
    if (!medicine.medicineId?.trim()) {
      errors[`medicines.${index}.medicineId`] =
        "Select a medicine from the hospital catalog.";
    }

    if (!medicine.doseQuantity || medicine.doseQuantity <= 0) {
      errors[`medicines.${index}.doseQuantity`] = "Enter the dose quantity.";
    }

    if (!medicine.doseUnit?.trim()) {
      errors[`medicines.${index}.doseUnit`] = "Select a valid catalog medicine.";
    }

    if (!medicine.frequency.trim()) {
      errors[`medicines.${index}.frequency`] = "Select the frequency.";
    }

    if (!medicine.durationValue || medicine.durationValue <= 0) {
      errors[`medicines.${index}.durationValue`] = "Enter the duration.";
    }

    if (!medicine.durationUnit?.trim()) {
      errors[`medicines.${index}.durationUnit`] = "Select the duration unit.";
    }

    if (requiresManualTotalQuantity(medicine.frequency, medicine.durationUnit)) {
      if (!medicine.totalQuantity || medicine.totalQuantity <= 0) {
        errors[`medicines.${index}.totalQuantity`] =
          "Enter the total quantity for this medicine.";
      }
    } else if (!calculateTotalQuantity(medicine)) {
      errors[`medicines.${index}.totalQuantity`] =
        "The total quantity could not be calculated.";
    }
  }

  if (draft.instructions.trim().length < 6) {
    errors.instructions = "Enter clear prescription instructions.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function DoctorPrescriptionsView() {
  const { createPrescription, meta, state } = useHospitalData();
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [openMedicineIndex, setOpenMedicineIndex] = useState<number | null>(null);
  const patientOptions = useMemo(() => {
    const grouped = new Map<
      string,
      { patientId: string; patientName: string; appointments: AppointmentRecord[] }
    >();

    for (const appointment of state.appointments) {
      const patientId =
        appointment.patientId ??
        `external:${appointment.patientName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
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
      if (profile.role !== "patient" || grouped.has(profile.id)) {
        continue;
      }

      grouped.set(profile.id, {
        patientId: profile.id,
        patientName: profile.patientName ?? profile.displayName,
        appointments: [],
      });
    }

    return [...grouped.values()];
  }, [meta?.patientProfiles, state.appointments]);

  const catalogOptions = useMemo(() => {
    const stockByMedicineId = new Map<string, number>();

    for (const item of state.inventoryItems) {
      if (!item.medicineId) {
        continue;
      }

      stockByMedicineId.set(
        item.medicineId,
        (stockByMedicineId.get(item.medicineId) ?? 0) + item.quantityInStock,
      );
    }

    return [...state.medicineCatalog]
      .filter((medicine) => medicine.active)
      .map((medicine) => {
        const stockQuantity = stockByMedicineId.get(medicine.id) ?? 0;

        return {
          medicine,
          stockQuantity,
          stockLabel:
            stockQuantity <= 0
              ? "Out of Stock"
              : stockQuantity <= 12
                ? `Low Stock: ${stockQuantity}`
                : `In Stock: ${stockQuantity}`,
          stockToneClassName:
            stockQuantity <= 0
              ? "text-rose-600 dark:text-rose-300"
              : stockQuantity <= 12
                ? "text-amber-600 dark:text-amber-300"
                : "text-emerald-600 dark:text-emerald-300",
        } satisfies CatalogOption;
      })
      .sort((left, right) =>
        `${left.medicine.name} ${left.medicine.strength ?? ""}`.localeCompare(
          `${right.medicine.name} ${right.medicine.strength ?? ""}`,
        ),
      );
  }, [state.inventoryItems, state.medicineCatalog]);

  const [draft, setDraft] = useState<PrescriptionDraft>({
    patientId: "",
    appointmentId: "",
    medicines: [emptyMedicine],
    instructions: "",
  });
  const [medicineSearch, setMedicineSearch] = useState<string[]>([""]);

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
  const recentPrescriptions = prescriptions.slice(0, 5);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const normalizedMedicines = draft.medicines.map((medicine) =>
      buildDisplayMedicine(medicine),
    );
    const validation = validatePrescriptionDraft(
      {
        ...draft,
        medicines: normalizedMedicines,
      },
      activePatientId,
    );

    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      setMessage("Please correct the highlighted prescription fields.");
      setSubmitting(false);
      return;
    }

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
    setDraft({
      patientId: activePatientId,
      appointmentId: activeAppointmentId,
      medicines: [emptyMedicine],
      instructions: "",
    });
    setMedicineSearch([""]);
    setOpenMedicineIndex(null);
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Doctor Workspace"
        title="Prescriptions"
        description="Issue prescriptions for patients already within your scoped consultation list and keep recent medication orders easy to review."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)]">
        <Card className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">New prescription</h2>
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
                <p className="text-sm text-rose-600 dark:text-rose-300">
                  {fieldErrors.patientId}
                </p>
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
                    {appointment.id} - {appointment.appointmentDate} {appointment.appointmentTime}
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
                  onClick={() => {
                    setDraft((current) => ({
                      ...current,
                      medicines: [...current.medicines, emptyMedicine],
                    }));
                    setMedicineSearch((current) => [...current, ""]);
                  }}
                >
                  Add medicine
                </Button>
              </div>

              {draft.medicines.map((medicine, index) => {
                const searchValue = medicineSearch[index] ?? "";
                const filteredOptions = catalogOptions.filter((option) =>
                  [
                    option.medicine.name,
                    option.medicine.strength ?? "",
                    option.medicine.genericName ?? "",
                    option.medicine.unit,
                  ]
                    .join(" ")
                    .toLowerCase()
                    .includes(searchValue.trim().toLowerCase()),
                );
                const selectedOption = medicine.medicineId
                  ? catalogOptions.find((option) => option.medicine.id === medicine.medicineId)
                  : undefined;
                const autoQuantity = calculateTotalQuantity(medicine);
                const manualQuantity = requiresManualTotalQuantity(
                  medicine.frequency,
                  medicine.durationUnit,
                );

                return (
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
                          onClick={() => {
                            setDraft((current) => ({
                              ...current,
                              medicines: current.medicines.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            }));
                            setMedicineSearch((current) =>
                              current.filter((_, itemIndex) => itemIndex !== index),
                            );
                            setOpenMedicineIndex((current) =>
                              current === index ? null : current,
                            );
                          }}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Medicine</label>
                      <div className="relative">
                        <Input
                          placeholder="Search hospital medicines"
                          value={searchValue}
                          onFocus={() => setOpenMedicineIndex(index)}
                          onBlur={() => {
                            window.setTimeout(() => {
                              setOpenMedicineIndex((current) =>
                                current === index ? null : current,
                              );
                            }, 120);
                          }}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setMedicineSearch((current) => {
                              const next = [...current];
                              next[index] = nextValue;
                              return next;
                            });
                            setDraft((current) => ({
                              ...current,
                              medicines: current.medicines.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      medicineId: "",
                                      medicineName: "",
                                      strength: "",
                                      doseUnit: "",
                                    }
                                  : item,
                              ),
                            }));
                            setOpenMedicineIndex(index);
                          }}
                        />
                        {openMedicineIndex === index ? (
                          <div className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-2 shadow-2xl">
                            {filteredOptions.length > 0 ? (
                              filteredOptions.map((option) => (
                                <button
                                  key={option.medicine.id}
                                  type="button"
                                  className="w-full rounded-xl px-3 py-3 text-left transition hover:bg-[color:var(--surface-muted)]"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    setDraft((current) => ({
                                      ...current,
                                      medicines: current.medicines.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? buildDisplayMedicine({
                                              ...item,
                                              medicineId: option.medicine.id,
                                              medicineName: option.medicine.name,
                                              strength: option.medicine.strength ?? "",
                                              doseUnit: option.medicine.unit,
                                            })
                                          : item,
                                      ),
                                    }));
                                    setMedicineSearch((current) => {
                                      const next = [...current];
                                      next[index] = formatPrescriptionMedicineName({
                                        medicineName: option.medicine.name,
                                        strength: option.medicine.strength,
                                      });
                                      return next;
                                    });
                                    setOpenMedicineIndex(null);
                                  }}
                                >
                                  <p className="font-medium">
                                    {formatPrescriptionMedicineName({
                                      medicineName: option.medicine.name,
                                      strength: option.medicine.strength,
                                    })}
                                  </p>
                                  <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                                    {option.medicine.unit}
                                    {option.medicine.genericName
                                      ? ` · ${option.medicine.genericName}`
                                      : ""}
                                  </p>
                                  <p className={`mt-1 text-xs font-medium ${option.stockToneClassName}`}>
                                    {option.stockLabel}
                                  </p>
                                </button>
                              ))
                            ) : (
                              <p className="px-3 py-2 text-sm text-[color:var(--muted-foreground)]">
                                No matching medicines found.
                              </p>
                            )}
                          </div>
                        ) : null}
                      </div>
                      {selectedOption ? (
                        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-3 text-sm">
                          <p className="font-medium">
                            {formatPrescriptionMedicineName({
                              medicineName: selectedOption.medicine.name,
                              strength: selectedOption.medicine.strength,
                            })}
                          </p>
                          <p className="mt-1 text-[color:var(--muted-foreground)]">
                            Unit: {selectedOption.medicine.unit}
                          </p>
                          <p className={`mt-1 text-xs font-medium ${selectedOption.stockToneClassName}`}>
                            {selectedOption.stockLabel}
                          </p>
                        </div>
                      ) : null}
                      {fieldErrors[`medicines.${index}.medicineId`] ? (
                        <p className="text-sm text-rose-600 dark:text-rose-300">
                          {fieldErrors[`medicines.${index}.medicineId`]}
                        </p>
                      ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Dose quantity</label>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={medicine.doseQuantity ?? ""}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              medicines: current.medicines.map((item, itemIndex) =>
                                itemIndex === index
                                  ? buildDisplayMedicine({
                                      ...item,
                                      doseQuantity: Number(event.target.value) || 0,
                                    })
                                  : item,
                              ),
                            }))
                          }
                        />
                        {fieldErrors[`medicines.${index}.doseQuantity`] ? (
                          <p className="text-sm text-rose-600 dark:text-rose-300">
                            {fieldErrors[`medicines.${index}.doseQuantity`]}
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Unit</label>
                        <Input value={medicine.doseUnit ?? ""} disabled />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Frequency</label>
                        <Select
                          value={medicine.frequency}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              medicines: current.medicines.map((item, itemIndex) =>
                                itemIndex === index
                                  ? buildDisplayMedicine({
                                      ...item,
                                      frequency: event.target.value,
                                    })
                                  : item,
                              ),
                            }))
                          }
                        >
                          {frequencyOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Select>
                        {fieldErrors[`medicines.${index}.frequency`] ? (
                          <p className="text-sm text-rose-600 dark:text-rose-300">
                            {fieldErrors[`medicines.${index}.frequency`]}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Duration</label>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={medicine.durationValue ?? ""}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              medicines: current.medicines.map((item, itemIndex) =>
                                itemIndex === index
                                  ? buildDisplayMedicine({
                                      ...item,
                                      durationValue: Number(event.target.value) || 0,
                                    })
                                  : item,
                              ),
                            }))
                          }
                        />
                        {fieldErrors[`medicines.${index}.durationValue`] ? (
                          <p className="text-sm text-rose-600 dark:text-rose-300">
                            {fieldErrors[`medicines.${index}.durationValue`]}
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Duration unit</label>
                        <Select
                          value={medicine.durationUnit ?? ""}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              medicines: current.medicines.map((item, itemIndex) =>
                                itemIndex === index
                                  ? buildDisplayMedicine({
                                      ...item,
                                      durationUnit: event.target.value,
                                    })
                                  : item,
                              ),
                            }))
                          }
                        >
                          {durationUnits.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </Select>
                        {fieldErrors[`medicines.${index}.durationUnit`] ? (
                          <p className="text-sm text-rose-600 dark:text-rose-300">
                            {fieldErrors[`medicines.${index}.durationUnit`]}
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Total quantity</label>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={manualQuantity ? (medicine.totalQuantity ?? "") : (autoQuantity ?? "")}
                          disabled={!manualQuantity}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              medicines: current.medicines.map((item, itemIndex) =>
                                itemIndex === index
                                  ? buildDisplayMedicine({
                                      ...item,
                                      totalQuantity: Number(event.target.value) || 0,
                                    })
                                  : item,
                              ),
                            }))
                          }
                        />
                        <p className="text-xs text-[color:var(--muted-foreground)]">
                          {manualQuantity
                            ? "Enter the total quantity to issue."
                            : "Calculated automatically from dose, frequency, and duration."}
                        </p>
                        {fieldErrors[`medicines.${index}.totalQuantity`] ? (
                          <p className="text-sm text-rose-600 dark:text-rose-300">
                            {fieldErrors[`medicines.${index}.totalQuantity`]}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Medicine notes</label>
                      <Textarea
                        placeholder="Optional notes for this medicine"
                        value={medicine.instructions ?? ""}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            medicines: current.medicines.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    instructions: event.target.value,
                                  }
                                : item,
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>
                );
              })}

              {fieldErrors.medicines ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">
                  {fieldErrors.medicines}
                </p>
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
                  setDraft((current) => ({
                    ...current,
                    instructions: event.target.value,
                  }))
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
            <div>
              <h2 className="text-xl font-semibold">Recent prescriptions</h2>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                Latest medication orders from your workspace.
              </p>
            </div>
            <Link
              href="/dashboard/doctor/history?tab=prescriptions"
              className="inline-flex items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2.5 text-sm font-semibold text-[color:var(--foreground)] transition hover:bg-[color:var(--surface-muted)]"
            >
              View All History
            </Link>
          </div>

          {recentPrescriptions.length > 0 ? (
            <div className="space-y-3">
              {recentPrescriptions.map((prescription) => (
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
                  <div className="mt-3 space-y-3">
                    {prescription.medicines.map((medicine, index) => (
                      <div
                        key={`${prescription.id}-${index}`}
                        className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-sm"
                      >
                        <p className="font-medium">
                          {formatPrescriptionMedicineName(medicine)}
                        </p>
                        <p className="mt-1 text-[color:var(--muted-foreground)]">
                          {formatPrescriptionDose(medicine)} - {medicine.frequency} -{" "}
                          {formatPrescriptionDuration(medicine)}
                        </p>
                        <p className="mt-1 text-[color:var(--muted-foreground)]">
                          Total quantity: {medicine.totalQuantity ?? "-"}
                        </p>
                        {medicine.instructions ? (
                          <p className="mt-1 text-[color:var(--muted-foreground)]">
                            {medicine.instructions}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No prescriptions yet"
              description="Recently issued prescriptions will appear here."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
