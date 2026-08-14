"use client";

import { useEffect, useMemo, useState } from "react";

import { LabRequestFormModal } from "@/components/dashboard/lab-request-form-modal";
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
  familyMemberId?: string;
  fullName: string;
  relationship: string;
  profile?: SafeUser;
  familyMemberDetails?: {
    dateOfBirth?: string;
    gender?: string;
    bloodGroup?: string;
    allergies?: string;
    medicalConditions?: string;
  };
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
  const { createLabRequest, fetchDoctorHandoff, meta, state } = useHospitalData();
  const [selectedPatient, setSelectedPatient] = useState<DoctorPatientSummary | null>(null);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<Awaited<
    ReturnType<typeof fetchDoctorHandoff>
  >["handoff"]>();
  const [labOrderPatient, setLabOrderPatient] = useState<DoctorPatientSummary | null>(null);

  const patients = useMemo(() => {
    const patientProfiles = meta?.patientProfiles ?? [];
    const profileById = new Map(patientProfiles.map((profile) => [profile.id, profile]));
    const familyMembersById = new Map((state.familyMembers ?? []).map((member) => [member.id, member]));

    // Identity is the (patientId, familyMemberId) pair — a dependent must never be
    // folded into the same bucket as the account holder or another dependent.
    const subjectKey = (patientId: string | undefined, familyMemberId: string | undefined, patientName: string) =>
      patientId ? `${patientId}::${familyMemberId ?? "self"}` : `external:${patientName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

    const recordsBySubject = new Map<string, string>();
    for (const record of [...state.medicalRecords].sort((left, right) =>
      `${right.visitDate}${right.createdAt}`.localeCompare(`${left.visitDate}${left.createdAt}`),
    )) {
      const key = subjectKey(record.patientId, record.familyMemberId, record.patientName);
      if (!recordsBySubject.has(key)) {
        recordsBySubject.set(key, record.diagnosis);
      }
    }

    const latestAppointmentBySubject = new Map<
      string,
      { appointmentDate: string; appointmentTime: string }
    >();
    for (const appointment of [...state.appointments].sort((left, right) =>
      `${right.appointmentDate}${right.appointmentTime}`.localeCompare(
        `${left.appointmentDate}${left.appointmentTime}`,
      ),
    )) {
      const key = subjectKey(appointment.patientId, appointment.familyMemberId, appointment.patientName);
      if (!latestAppointmentBySubject.has(key)) {
        latestAppointmentBySubject.set(key, {
          appointmentDate: appointment.appointmentDate,
          appointmentTime: appointment.appointmentTime,
        });
      }
    }

    const pendingLabsBySubject = new Map<string, number>();
    const completedReportsBySubject = new Map<string, number>();

    for (const request of state.labRequests) {
      const key = subjectKey(request.patientId, request.familyMemberId, request.patientName);
      pendingLabsBySubject.set(
        key,
        (pendingLabsBySubject.get(key) ?? 0) + (request.status === "Completed" ? 0 : 1),
      );
    }

    for (const report of state.labReports) {
      const key = subjectKey(report.patientId, report.familyMemberId, "");
      completedReportsBySubject.set(key, (completedReportsBySubject.get(key) ?? 0) + 1);
    }

    const combined = new Map<string, DoctorPatientSummary>();

    for (const appointment of state.appointments) {
      const key = subjectKey(appointment.patientId, appointment.familyMemberId, appointment.patientName);
      const profile = appointment.patientId ? profileById.get(appointment.patientId) : undefined;
      const familyMember = appointment.familyMemberId ? familyMembersById.get(appointment.familyMemberId) : undefined;
      const latestAppointment = latestAppointmentBySubject.get(key);

      combined.set(key, {
        patientId: appointment.patientId ?? key,
        familyMemberId: appointment.familyMemberId,
        fullName: familyMember?.fullName ?? appointment.patientName,
        relationship: familyMember ? familyMember.relationship : "Primary patient",
        profile,
        familyMemberDetails: familyMember
          ? {
              dateOfBirth: familyMember.dateOfBirth,
              gender: familyMember.gender,
              bloodGroup: familyMember.bloodGroup,
              allergies: familyMember.allergies,
              medicalConditions: familyMember.medicalConditions,
            }
          : undefined,
        latestAppointmentDate: latestAppointment?.appointmentDate,
        latestAppointmentTime: latestAppointment?.appointmentTime,
        latestDiagnosis: recordsBySubject.get(key),
        pendingLabRequests: pendingLabsBySubject.get(key) ?? 0,
        completedReports: completedReportsBySubject.get(key) ?? 0,
      });
    }

    for (const profile of patientProfiles) {
      const key = subjectKey(profile.id, undefined, profile.patientName ?? profile.displayName);
      if (combined.has(key)) {
        continue;
      }
      const latestAppointment = latestAppointmentBySubject.get(key);
      combined.set(key, {
        patientId: profile.id,
        fullName: profile.patientName ?? profile.displayName,
        relationship: "Primary patient",
        profile,
        latestAppointmentDate: latestAppointment?.appointmentDate,
        latestAppointmentTime: latestAppointment?.appointmentTime,
        latestDiagnosis: recordsBySubject.get(key),
        pendingLabRequests: pendingLabsBySubject.get(key) ?? 0,
        completedReports: completedReportsBySubject.get(key) ?? 0,
      });
    }

    return [...combined.values()].sort((left, right) => left.fullName.localeCompare(right.fullName));
  }, [meta?.patientProfiles, state.appointments, state.familyMembers, state.labReports, state.labRequests, state.medicalRecords]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!selectedPatient || selectedPatient.patientId.startsWith("external:")) {
        setHandoff(undefined);
        setHandoffError(null);
        return;
      }

      setHandoffLoading(true);
      setHandoffError(null);
      const result = await fetchDoctorHandoff({
        patientId: selectedPatient.patientId,
        familyMemberId: selectedPatient.familyMemberId,
      });

      if (!mounted) {
        return;
      }

      if (!result.ok) {
        setHandoff(undefined);
        setHandoffError(result.message ?? "The patient handoff could not be loaded.");
        setHandoffLoading(false);
        return;
      }

      setHandoff(result.handoff);
      setHandoffLoading(false);
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [fetchDoctorHandoff, selectedPatient]);

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
              <Card key={`${patient.patientId}::${patient.familyMemberId ?? "self"}`} className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{patient.fullName}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      {age !== null ? `${age} years` : "Age not recorded"}
                      {(patient.familyMemberDetails?.gender ?? patient.profile?.gender)
                        ? ` · ${patient.familyMemberDetails?.gender ?? patient.profile?.gender}`
                        : ""}
                      {(patient.familyMemberDetails?.bloodGroup ?? patient.profile?.bloodGroup)
                        ? ` · ${patient.familyMemberDetails?.bloodGroup ?? patient.profile?.bloodGroup}`
                        : ""}
                      {` · ${patient.relationship}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={patient.patientId.startsWith("external:")}
                      onClick={() => setLabOrderPatient(patient)}
                    >
                      Order Lab Test
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setSelectedPatient(patient)}>
                      View Patient
                    </Button>
                  </div>
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
                  <span>
                    Allergies: {patient.familyMemberDetails?.allergies ?? patient.profile?.allergies ?? "None recorded"}
                  </span>
                  <span>
                    Conditions:{" "}
                    {patient.familyMemberDetails?.medicalConditions ?? patient.profile?.medicalConditions ?? "None recorded"}
                  </span>
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
        onClose={() => {
          setSelectedPatient(null);
          setHandoff(undefined);
          setHandoffError(null);
        }}
      >
        {selectedPatient ? (
          <div className="space-y-4">
            <Card className="space-y-3 p-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="font-semibold">Age / DOB</p>
                  <p className="text-[color:var(--muted-foreground)]">
                    {calculateAge(selectedPatient.familyMemberDetails?.dateOfBirth ?? selectedPatient.profile?.dateOfBirth) !== null
                      ? `${calculateAge(selectedPatient.familyMemberDetails?.dateOfBirth ?? selectedPatient.profile?.dateOfBirth)} years`
                      : "Not recorded"}
                    {(selectedPatient.familyMemberDetails?.dateOfBirth ?? selectedPatient.profile?.dateOfBirth)
                      ? ` · ${formatDate(selectedPatient.familyMemberDetails?.dateOfBirth ?? selectedPatient.profile?.dateOfBirth)}`
                      : ""}
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Gender / Blood Group</p>
                  <p className="text-[color:var(--muted-foreground)]">
                    {(selectedPatient.familyMemberDetails?.gender ?? selectedPatient.profile?.gender) || "Not recorded"}
                    {(selectedPatient.familyMemberDetails?.bloodGroup ?? selectedPatient.profile?.bloodGroup)
                      ? ` · ${selectedPatient.familyMemberDetails?.bloodGroup ?? selectedPatient.profile?.bloodGroup}`
                      : ""}
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Relationship</p>
                  <p className="text-[color:var(--muted-foreground)]">{selectedPatient.relationship}</p>
                </div>
                <div>
                  <p className="font-semibold">Account contact</p>
                  <p className="text-[color:var(--muted-foreground)]">
                    {selectedPatient.profile?.phoneNumber || "Not recorded"}
                    {hasUsableEmail(selectedPatient.profile) ? ` · ${selectedPatient.profile?.email}` : ""}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="space-y-3 p-4">
              <p className="font-semibold">Activity</p>
              <div className="space-y-2 text-sm text-[color:var(--muted-foreground)]">
                <p>
                  Latest appointment:{" "}
                  {selectedPatient.latestAppointmentDate
                    ? `${formatDate(selectedPatient.latestAppointmentDate)}${selectedPatient.latestAppointmentTime ? ` at ${selectedPatient.latestAppointmentTime}` : ""}`
                    : "No appointment yet"}
                </p>
                <p>Pending lab requests: {selectedPatient.pendingLabRequests}</p>
                <p>Completed lab reports: {selectedPatient.completedReports}</p>
              </div>
            </Card>

            <Card className="space-y-3 p-4">
              <p className="font-semibold">Handoff Summary</p>
              {handoffLoading ? (
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  Loading patient handoff...
                </p>
              ) : handoffError ? (
                <p className="text-sm text-[color:var(--muted-foreground)]">{handoffError}</p>
              ) : handoff ? (
                <div className="space-y-2 text-sm text-[color:var(--muted-foreground)]">
                  <p>Patient context: {handoff.patientContext}</p>
                  <p>Reason for visit: {handoff.reasonForVisit}</p>
                  <p>Allergies: {handoff.allergies}</p>
                  <p>Chronic conditions: {handoff.chronicConditions}</p>
                  <p>Blood group: {handoff.bloodGroup}</p>
                  <p>Latest diagnosis: {handoff.latestDiagnosis}</p>
                  <p>Recent lab findings: {handoff.recentLabFindings}</p>
                  <p>Active prescription: {handoff.activePrescription}</p>
                  <p>Pending labs: {handoff.pendingLabs}</p>
                  <p>Visit status: {handoff.visitStatus}</p>
                  <p>Follow-up: {handoff.followUp}</p>
                </div>
              ) : (
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  No handoff summary is available for this patient yet.
                </p>
              )}
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

      {labOrderPatient ? (
        <LabRequestFormModal
          open
          organizationName={state.organization.name}
          bookingCapacity={state.bookingCapacity}
          labSlotLoads={meta?.labSlotLoads ?? []}
          labTests={state.labTests}
          existingRequests={state.labRequests}
          patientName={labOrderPatient.fullName}
          familyMembers={[]}
          doctorOrderContext={{
            patientId: labOrderPatient.patientId,
            familyMemberId: labOrderPatient.familyMemberId,
            subjectLabel: `${labOrderPatient.fullName} (${labOrderPatient.relationship})`,
          }}
          onClose={() => setLabOrderPatient(null)}
          onSubmit={createLabRequest}
        />
      ) : null}
    </div>
  );
}
