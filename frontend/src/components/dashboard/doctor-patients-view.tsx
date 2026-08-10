"use client";

import { useMemo, useState } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import type { SafeUser } from "@/lib/auth";
import { getCurrentLocalDateIso } from "@/lib/hospital-data";

type DoctorPatientSummary = {
  patientId: string;
  fullName: string;
  profile?: SafeUser;
  latestAppointmentDate?: string;
  latestAppointmentTime?: string;
  latestDiagnosis?: string;
  pendingLabRequests: number;
  completedReports: number;
};

function formatDate(value?: string) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function calculateAge(dateOfBirth?: string) {
  if (!dateOfBirth) {
    return null;
  }

  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date(`${getCurrentLocalDateIso()}T00:00:00`);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();
  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age;
}

function hasUsableEmail(profile?: SafeUser) {
  return Boolean(profile?.email && !profile.email.endsWith("@profiles.medivanta.local"));
}

export function DoctorPatientsView() {
  const { meta, state } = useHospitalData();
  const [selectedPatient, setSelectedPatient] = useState<DoctorPatientSummary | null>(null);

  const patients = useMemo(() => {
    const patientProfiles = meta?.patientProfiles ?? [];
    const profileById = new Map(patientProfiles.map((profile) => [profile.id, profile]));
    const recordsByPatientId = new Map<string, string>();

    for (const record of [...state.medicalRecords].sort((left, right) =>
      `${right.visitDate}${right.createdAt}`.localeCompare(`${left.visitDate}${left.createdAt}`),
    )) {
      if (!recordsByPatientId.has(record.patientId)) {
        recordsByPatientId.set(record.patientId, record.diagnosis);
      }
    }

    const latestAppointmentByPatientId = new Map<
      string,
      { appointmentDate: string; appointmentTime: string }
    >();

    for (const appointment of [...state.appointments].sort((left, right) =>
      `${right.appointmentDate}${right.appointmentTime}`.localeCompare(
        `${left.appointmentDate}${left.appointmentTime}`,
      ),
    )) {
      const patientId =
        appointment.patientId ??
        `external:${appointment.patientName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      if (!latestAppointmentByPatientId.has(patientId)) {
        latestAppointmentByPatientId.set(patientId, {
          appointmentDate: appointment.appointmentDate,
          appointmentTime: appointment.appointmentTime,
        });
      }
    }

    const pendingLabsByPatientId = new Map<string, number>();
    const completedReportsByPatientId = new Map<string, number>();

    for (const request of state.labRequests) {
      const patientId =
        request.patientId ??
        `external:${request.patientName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      pendingLabsByPatientId.set(
        patientId,
        (pendingLabsByPatientId.get(patientId) ?? 0) +
          (request.status === "Completed" ? 0 : 1),
      );
    }

    for (const report of state.labReports) {
      completedReportsByPatientId.set(
        report.patientId,
        (completedReportsByPatientId.get(report.patientId) ?? 0) + 1,
      );
    }

    const combined = new Map<string, DoctorPatientSummary>();

    for (const appointment of state.appointments) {
      const patientId =
        appointment.patientId ??
        `external:${appointment.patientName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const profile = profileById.get(patientId);
      const latestAppointment = latestAppointmentByPatientId.get(patientId);

      combined.set(patientId, {
        patientId,
        fullName: appointment.patientName,
        profile,
        latestAppointmentDate: latestAppointment?.appointmentDate,
        latestAppointmentTime: latestAppointment?.appointmentTime,
        latestDiagnosis: recordsByPatientId.get(patientId),
        pendingLabRequests: pendingLabsByPatientId.get(patientId) ?? 0,
        completedReports: completedReportsByPatientId.get(patientId) ?? 0,
      });
    }

    for (const profile of patientProfiles) {
      const latestAppointment = latestAppointmentByPatientId.get(profile.id);
      combined.set(profile.id, {
        patientId: profile.id,
        fullName: profile.patientName ?? profile.displayName,
        profile,
        latestAppointmentDate: latestAppointment?.appointmentDate,
        latestAppointmentTime: latestAppointment?.appointmentTime,
        latestDiagnosis: recordsByPatientId.get(profile.id),
        pendingLabRequests: pendingLabsByPatientId.get(profile.id) ?? 0,
        completedReports: completedReportsByPatientId.get(profile.id) ?? 0,
      });
    }

    return [...combined.values()].sort((left, right) => left.fullName.localeCompare(right.fullName));
  }, [meta?.patientProfiles, state.appointments, state.labReports, state.labRequests, state.medicalRecords]);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Doctor Workspace"
        title="My Patients"
        description="Review key patient details from your current clinical scope and check recent activity linked to your consultations."
      />

      {patients.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {patients.map((patient) => {
            const age = calculateAge(patient.profile?.dateOfBirth);

            return (
              <Card key={patient.patientId} className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{patient.fullName}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      {age !== null ? `${age} years` : "Age not recorded"}
                      {patient.profile?.gender ? ` · ${patient.profile.gender}` : ""}
                      {patient.profile?.bloodGroup ? ` · ${patient.profile.bloodGroup}` : ""}
                    </p>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => setSelectedPatient(patient)}>
                    View Patient
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                      Latest appointment
                    </p>
                    <p className="mt-2 text-sm font-medium">
                      {patient.latestAppointmentDate
                        ? `${formatDate(patient.latestAppointmentDate)}${patient.latestAppointmentTime ? ` · ${patient.latestAppointmentTime}` : ""}`
                        : "No appointment yet"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                      Latest diagnosis
                    </p>
                    <p className="mt-2 text-sm font-medium">
                      {patient.latestDiagnosis ?? "No diagnosis recorded"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 text-sm text-[color:var(--muted-foreground)]">
                  <span>Allergies: {patient.profile?.allergies || "None recorded"}</span>
                  <span>Conditions: {patient.profile?.medicalConditions || "None recorded"}</span>
                  <span>Lab reports: {patient.completedReports}</span>
                  <span>Pending labs: {patient.pendingLabRequests}</span>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No patients assigned yet"
          description="Patients linked to your consultations will appear here."
        />
      )}

      <Modal
        open={Boolean(selectedPatient)}
        title={selectedPatient?.fullName ?? "Patient"}
        description="Clinical summary scoped to your current doctor workspace."
        onClose={() => setSelectedPatient(null)}
      >
        {selectedPatient ? (
          <div className="space-y-4">
            <Card className="space-y-3 p-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="font-semibold">Age / DOB</p>
                  <p className="text-[color:var(--muted-foreground)]">
                    {calculateAge(selectedPatient.profile?.dateOfBirth) !== null
                      ? `${calculateAge(selectedPatient.profile?.dateOfBirth)} years`
                      : "Not recorded"}
                    {selectedPatient.profile?.dateOfBirth
                      ? ` · ${formatDate(selectedPatient.profile.dateOfBirth)}`
                      : ""}
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Gender / Blood Group</p>
                  <p className="text-[color:var(--muted-foreground)]">
                    {selectedPatient.profile?.gender || "Not recorded"}
                    {selectedPatient.profile?.bloodGroup
                      ? ` · ${selectedPatient.profile.bloodGroup}`
                      : ""}
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Phone</p>
                  <p className="text-[color:var(--muted-foreground)]">
                    {selectedPatient.profile?.phoneNumber || "Not recorded"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Email</p>
                  <p className="text-[color:var(--muted-foreground)]">
                    {hasUsableEmail(selectedPatient.profile)
                      ? selectedPatient.profile?.email
                      : "Not recorded"}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="space-y-3 p-4">
              <p className="font-semibold">Clinical summary</p>
              <div className="space-y-2 text-sm text-[color:var(--muted-foreground)]">
                <p>
                  Latest appointment:{" "}
                  {selectedPatient.latestAppointmentDate
                    ? `${formatDate(selectedPatient.latestAppointmentDate)}${selectedPatient.latestAppointmentTime ? ` at ${selectedPatient.latestAppointmentTime}` : ""}`
                    : "No appointment yet"}
                </p>
                <p>Latest diagnosis: {selectedPatient.latestDiagnosis ?? "No diagnosis recorded"}</p>
                <p>Known allergies: {selectedPatient.profile?.allergies || "None recorded"}</p>
                <p>
                  Existing medical conditions:{" "}
                  {selectedPatient.profile?.medicalConditions || "None recorded"}
                </p>
                <p>Pending lab requests: {selectedPatient.pendingLabRequests}</p>
                <p>Completed lab reports: {selectedPatient.completedReports}</p>
              </div>
            </Card>

            <Card className="space-y-3 p-4">
              <p className="font-semibold">Address and emergency contact</p>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                {selectedPatient.profile?.address || "Address not recorded"}
              </p>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Emergency contact: {selectedPatient.profile?.emergencyContact || "Not recorded"}
              </p>
            </Card>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
