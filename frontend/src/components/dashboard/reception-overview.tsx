"use client";

import { useState } from "react";

import { DashboardDemo } from "@/app/dashboard/dashboard-demo";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentLocalDateIso } from "@/lib/hospital-data";

const emptyPatientDraft = {
  fullName: "",
  email: "",
  phoneNumber: "",
  gender: "",
  dateOfBirth: "",
  bloodGroup: "",
  address: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  allergies: "",
  medicalConditions: "",
  preferredLanguage: "English",
};

export function ReceptionOverview() {
  const { createPatientProfile } = useHospitalData();
  const { session } = useAuth();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerDraft, setRegisterDraft] = useState(emptyPatientDraft);
  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({});
  const [registerMessage, setRegisterMessage] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [registerSubmitting, setRegisterSubmitting] = useState(false);

  async function onRegisterPatient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegisterSubmitting(true);
    setRegisterMessage(null);

    const result = await createPatientProfile(registerDraft);
    setRegisterSubmitting(false);

    if (!result.ok) {
      setRegisterErrors(result.fieldErrors ?? {});
      setRegisterMessage(result.message ?? "The patient account could not be created.");
      setTemporaryPassword(null);
      return;
    }

    setRegisterErrors({});
    setRegisterMessage("Patient account created successfully.");
    setTemporaryPassword(result.temporaryPassword ?? null);
    setRegisterDraft(emptyPatientDraft);
  }

  function closeRegisterModal() {
    setRegisterOpen(false);
    setRegisterErrors({});
    setRegisterMessage(null);
    setTemporaryPassword(null);
    setRegisterDraft(emptyPatientDraft);
  }

  return (
    <>
      <DashboardDemo
        eyebrow="Reception Desk"
        title="Coordinate appointments, queues, and front-desk operations"
        description="Manage check-ins, appointment flow, and department coordination from one operational workspace."
        action={
          <Button type="button" onClick={() => setRegisterOpen(true)}>
            + Register Patient
          </Button>
        }
      />

      <Modal
        open={registerOpen}
        title="Register Patient"
        description={`Create a patient account for ${session.organization.name}.`}
        onClose={closeRegisterModal}
      >
        {temporaryPassword ? (
          <div className="space-y-4">
            <Card className="space-y-3 p-4">
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Share this temporary password securely with the patient. It is shown only once.
              </p>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                  Temporary password
                </p>
                <p className="mt-2 text-lg font-semibold">{temporaryPassword}</p>
              </div>
            </Card>
            <div className="flex justify-end">
              <Button type="button" onClick={closeRegisterModal}>
                Close
              </Button>
            </div>
          </div>
        ) : (
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
                  Phone Number
                </label>
                <Input
                  id="patient-phone"
                  value={registerDraft.phoneNumber}
                  onChange={(event) =>
                    setRegisterDraft((current) => ({ ...current, phoneNumber: event.target.value }))
                  }
                />
                {registerErrors.phoneNumber ? (
                  <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.phoneNumber}</p>
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
                {registerErrors.gender ? (
                  <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.gender}</p>
                ) : null}
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
                {registerErrors.dateOfBirth ? (
                  <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.dateOfBirth}</p>
                ) : null}
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
                {registerErrors.bloodGroup ? (
                  <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.bloodGroup}</p>
                ) : null}
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
              {registerErrors.address ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.address}</p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="patient-emergency-contact-name">
                  Emergency Contact Name
                </label>
                <Input
                  id="patient-emergency-contact-name"
                  value={registerDraft.emergencyContactName}
                  onChange={(event) =>
                    setRegisterDraft((current) => ({
                      ...current,
                      emergencyContactName: event.target.value,
                    }))
                  }
                />
                {registerErrors.emergencyContactName ? (
                  <p className="text-sm text-rose-600 dark:text-rose-300">
                    {registerErrors.emergencyContactName}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="patient-emergency-contact-phone">
                  Emergency Contact Phone
                </label>
                <Input
                  id="patient-emergency-contact-phone"
                  value={registerDraft.emergencyContactPhone}
                  onChange={(event) =>
                    setRegisterDraft((current) => ({
                      ...current,
                      emergencyContactPhone: event.target.value,
                    }))
                  }
                />
                {registerErrors.emergencyContactPhone ? (
                  <p className="text-sm text-rose-600 dark:text-rose-300">
                    {registerErrors.emergencyContactPhone}
                  </p>
                ) : null}
              </div>
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
                Existing / Chronic Medical Conditions
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

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-preferred-language">
                Preferred Language
              </label>
              <Input
                id="patient-preferred-language"
                value={registerDraft.preferredLanguage}
                onChange={(event) =>
                  setRegisterDraft((current) => ({
                    ...current,
                    preferredLanguage: event.target.value,
                  }))
                }
              />
            </div>

            {registerMessage ? (
              <p className="text-sm text-rose-600 dark:text-rose-300">{registerMessage}</p>
            ) : null}

            <Button type="submit" disabled={registerSubmitting}>
              {registerSubmitting ? "Creating..." : "Register Patient"}
            </Button>
          </form>
        )}
      </Modal>
    </>
  );
}
