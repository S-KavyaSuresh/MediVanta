"use client";

import { useMemo, useState } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

const emptyPatientDraft = {
  fullName: "",
  email: "",
  phoneNumber: "",
  gender: "",
  dateOfBirth: "",
  bloodGroup: "",
  address: "",
  emergencyContact: "",
  allergies: "",
  medicalConditions: "",
};

function parseEmergencyContact(value: string) {
  const [name = "", phone = ""] = value.split(/[·•]/).map((item) => item.trim());
  return { name, phone };
}

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
  const { meta, state, createPatientProfile } = useHospitalData();
  const { session } = useAuth();
  const [selectedPatient, setSelectedPatient] = useState<DoctorPatientSummary | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerDraft, setRegisterDraft] = useState(emptyPatientDraft);
  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({});
  const [registerMessage, setRegisterMessage] = useState<string | null>(null);
  const [registerSubmitting, setRegisterSubmitting] = useState(false);

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

  async function onRegisterPatient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegisterSubmitting(true);
    setRegisterMessage(null);

    const emergencyContact = parseEmergencyContact(registerDraft.emergencyContact);
    const result = await createPatientProfile({
      ...registerDraft,
      emergencyContactName: emergencyContact.name,
      emergencyContactPhone: emergencyContact.phone,
      preferredLanguage: "English",
    });
    setRegisterSubmitting(false);

    if (!result.ok) {
      setRegisterErrors(result.fieldErrors ?? {});
      setRegisterMessage(result.message ?? "The patient profile could not be created.");
      return;
    }

    setRegisterErrors({});
    setRegisterMessage("Patient profile created.");
    setRegisterDraft(emptyPatientDraft);
    setRegisterOpen(false);
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Doctor Workspace"
        title="My Patients"
        description="Review key patient details from your current clinical scope, check recent activity, and register new hospital patient profiles when needed."
        action={
          <Button type="button" onClick={() => setRegisterOpen(true)}>
            + Register Patient
          </Button>
        }
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
          description="Patients linked to your consultations or created in your hospital profile scope will appear here."
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

      <Modal
        open={registerOpen}
        title="Register Patient"
        description={`Create a hospital patient profile for ${session.organization.name} without granting staff access.`}
        onClose={() => {
          setRegisterOpen(false);
          setRegisterErrors({});
          setRegisterMessage(null);
        }}
      >
        <form className="space-y-4" onSubmit={onRegisterPatient}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="patient-full-name">
                Full Name
              </label>
              <Input
                id="patient-full-name"
                value={registerDraft.fullName}
                onChange={(event) =>
                  setRegisterDraft((current) => ({ ...current, fullName: event.target.value }))
                }
              />
              {registerErrors.fullName ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.fullName}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-email">
                Email
              </label>
              <Input
                id="patient-email"
                type="email"
                value={registerDraft.email}
                onChange={(event) =>
                  setRegisterDraft((current) => ({ ...current, email: event.target.value }))
                }
              />
              {registerErrors.email ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.email}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-phone">
                Phone
              </label>
              <Input
                id="patient-phone"
                value={registerDraft.phoneNumber}
                onChange={(event) =>
                  setRegisterDraft((current) => ({ ...current, phoneNumber: event.target.value }))
                }
              />
              {registerErrors.phoneNumber ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">
                  {registerErrors.phoneNumber}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-gender">
                Gender
              </label>
              <Select
                id="patient-gender"
                value={registerDraft.gender}
                onChange={(event) =>
                  setRegisterDraft((current) => ({ ...current, gender: event.target.value }))
                }
              >
                <option value="">Select gender</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-dob">
                Date of Birth
              </label>
              <Input
                id="patient-dob"
                type="date"
                max={getCurrentLocalDateIso()}
                value={registerDraft.dateOfBirth}
                onChange={(event) =>
                  setRegisterDraft((current) => ({ ...current, dateOfBirth: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-blood-group">
                Blood Group
              </label>
              <Select
                id="patient-blood-group"
                value={registerDraft.bloodGroup}
                onChange={(event) =>
                  setRegisterDraft((current) => ({ ...current, bloodGroup: event.target.value }))
                }
              >
                <option value="">Select blood group</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="patient-address">
              Address
            </label>
            <Textarea
              id="patient-address"
              value={registerDraft.address}
              onChange={(event) =>
                setRegisterDraft((current) => ({ ...current, address: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="patient-emergency-contact">
              Emergency Contact
            </label>
            <Input
              id="patient-emergency-contact"
              value={registerDraft.emergencyContact}
              onChange={(event) =>
                setRegisterDraft((current) => ({
                  ...current,
                  emergencyContact: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="patient-allergies">
              Allergies
            </label>
            <Textarea
              id="patient-allergies"
              value={registerDraft.allergies}
              onChange={(event) =>
                setRegisterDraft((current) => ({ ...current, allergies: event.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="patient-medical-conditions">
              Existing Medical Conditions
            </label>
            <Textarea
              id="patient-medical-conditions"
              value={registerDraft.medicalConditions}
              onChange={(event) =>
                setRegisterDraft((current) => ({
                  ...current,
                  medicalConditions: event.target.value,
                }))
              }
            />
          </div>

          {registerMessage ? (
            <p className="text-sm text-[color:var(--muted-foreground)]">{registerMessage}</p>
          ) : null}

          <Button type="submit" disabled={registerSubmitting}>
            {registerSubmitting ? "Saving..." : "Create Patient Profile"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
