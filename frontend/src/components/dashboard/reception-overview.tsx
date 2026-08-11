"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { DashboardDemo } from "@/app/dashboard/dashboard-demo";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getCurrentLocalDateIso } from "@/lib/hospital-data";
import { getPasswordPolicyErrors, passwordPolicySummary } from "@/lib/password-policy";

const emptyPatientDraft = {
  fullName: "",
  email: "",
  phoneNumber: "",
  gender: "",
  dateOfBirth: "",
  bloodGroup: "",
  preferredLanguage: "English",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  allergies: "",
  medicalConditions: "",
  password: "",
  confirmPassword: "",
};

export function ReceptionOverview() {
  const { createPatientProfile } = useHospitalData();
  const { session } = useAuth();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerDraft, setRegisterDraft] = useState(emptyPatientDraft);
  const [registerErrors, setRegisterErrors] = useState<Record<string, string>>({});
  const [registerMessage, setRegisterMessage] = useState<string | null>(null);
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function onRegisterPatient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: Record<string, string> = {};
    const passwordErrors = getPasswordPolicyErrors(registerDraft.password);

    if (passwordErrors.length > 0) {
      nextErrors.password = passwordErrors[0] ?? "Add a stronger password.";
    }

    if (registerDraft.password !== registerDraft.confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setRegisterErrors(nextErrors);
      setRegisterMessage(null);
      return;
    }

    setRegisterSubmitting(true);
    setRegisterMessage(null);

    const result = await createPatientProfile(registerDraft);
    setRegisterSubmitting(false);

    if (!result.ok) {
      const combinedErrors = { ...nextErrors, ...(result.fieldErrors ?? {}) };
      setRegisterErrors(combinedErrors);
      setRegisterMessage(
        Object.keys(combinedErrors).length > 0
          ? null
          : (result.message ?? "The patient account could not be created."),
      );
      return;
    }

    setRegisterErrors({});
    setRegisterMessage("Patient account created successfully.");
    setRegisterDraft(emptyPatientDraft);
  }

  function closeRegisterModal() {
    setRegisterOpen(false);
    setRegisterErrors({});
    setRegisterMessage(null);
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
        <form className="space-y-4" onSubmit={onRegisterPatient}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="patient-full-name">Full Name</label>
              <Input id="patient-full-name" value={registerDraft.fullName} onChange={(event) => setRegisterDraft((current) => ({ ...current, fullName: event.target.value }))} />
              {registerErrors.fullName ? <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.fullName}</p> : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-email">Email</label>
              <Input id="patient-email" type="email" value={registerDraft.email} onChange={(event) => setRegisterDraft((current) => ({ ...current, email: event.target.value }))} />
              {registerErrors.email ? <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.email}</p> : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-phone">Phone Number</label>
              <Input id="patient-phone" value={registerDraft.phoneNumber} onChange={(event) => setRegisterDraft((current) => ({ ...current, phoneNumber: event.target.value }))} />
              {registerErrors.phoneNumber ? <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.phoneNumber}</p> : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-gender">Gender</label>
              <Select id="patient-gender" value={registerDraft.gender} onChange={(event) => setRegisterDraft((current) => ({ ...current, gender: event.target.value }))}>
                <option value="">Select gender</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </Select>
              {registerErrors.gender ? <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.gender}</p> : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-dob">Date of Birth</label>
              <Input id="patient-dob" type="date" max={getCurrentLocalDateIso()} value={registerDraft.dateOfBirth} onChange={(event) => setRegisterDraft((current) => ({ ...current, dateOfBirth: event.target.value }))} />
              {registerErrors.dateOfBirth ? <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.dateOfBirth}</p> : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-blood-group">Blood Group</label>
              <Select id="patient-blood-group" value={registerDraft.bloodGroup} onChange={(event) => setRegisterDraft((current) => ({ ...current, bloodGroup: event.target.value }))}>
                <option value="">Select blood group</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </Select>
              {registerErrors.bloodGroup ? <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.bloodGroup}</p> : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-language">Preferred Language</label>
              <Select id="patient-language" value={registerDraft.preferredLanguage} onChange={(event) => setRegisterDraft((current) => ({ ...current, preferredLanguage: event.target.value }))}>
                <option value="English">English</option>
                <option value="Tamil">Tamil</option>
                <option value="Hindi">Hindi</option>
              </Select>
              {registerErrors.preferredLanguage ? <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.preferredLanguage}</p> : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="patient-address-line-1">Address Line 1</label>
              <Input id="patient-address-line-1" value={registerDraft.addressLine1} onChange={(event) => setRegisterDraft((current) => ({ ...current, addressLine1: event.target.value }))} />
              {registerErrors.addressLine1 ? <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.addressLine1}</p> : null}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="patient-address-line-2">Address Line 2</label>
              <Input id="patient-address-line-2" value={registerDraft.addressLine2} onChange={(event) => setRegisterDraft((current) => ({ ...current, addressLine2: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-city">City</label>
              <Input id="patient-city" value={registerDraft.city} onChange={(event) => setRegisterDraft((current) => ({ ...current, city: event.target.value }))} />
              {registerErrors.city ? <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.city}</p> : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-state">State</label>
              <Input id="patient-state" value={registerDraft.state} onChange={(event) => setRegisterDraft((current) => ({ ...current, state: event.target.value }))} />
              {registerErrors.state ? <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.state}</p> : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-postal-code">Postal Code</label>
              <Input id="patient-postal-code" value={registerDraft.postalCode} onChange={(event) => setRegisterDraft((current) => ({ ...current, postalCode: event.target.value }))} />
              {registerErrors.postalCode ? <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.postalCode}</p> : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-emergency-contact-name">Emergency Contact Name</label>
              <Input id="patient-emergency-contact-name" value={registerDraft.emergencyContactName} onChange={(event) => setRegisterDraft((current) => ({ ...current, emergencyContactName: event.target.value }))} />
              {registerErrors.emergencyContactName ? <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.emergencyContactName}</p> : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-emergency-contact-phone">Emergency Contact Phone</label>
              <Input id="patient-emergency-contact-phone" value={registerDraft.emergencyContactPhone} onChange={(event) => setRegisterDraft((current) => ({ ...current, emergencyContactPhone: event.target.value }))} />
              {registerErrors.emergencyContactPhone ? <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.emergencyContactPhone}</p> : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-allergies">Allergies</label>
              <Textarea id="patient-allergies" value={registerDraft.allergies} onChange={(event) => setRegisterDraft((current) => ({ ...current, allergies: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-medical-conditions">Existing / Chronic Medical Conditions</label>
              <Textarea id="patient-medical-conditions" value={registerDraft.medicalConditions} onChange={(event) => setRegisterDraft((current) => ({ ...current, medicalConditions: event.target.value }))} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-password">Password</label>
              <div className="relative">
                <Input id="patient-password" type={showPassword ? "text" : "password"} className="pr-12" value={registerDraft.password} onChange={(event) => setRegisterDraft((current) => ({ ...current, password: event.target.value }))} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[color:var(--muted-foreground)] hover:bg-[color:var(--surface-muted)]" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-[color:var(--muted-foreground)]">{passwordPolicySummary}</p>
              {registerErrors.password ? <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.password}</p> : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="patient-confirm-password">Confirm Password</label>
              <div className="relative">
                <Input id="patient-confirm-password" type={showConfirmPassword ? "text" : "password"} className="pr-12" value={registerDraft.confirmPassword} onChange={(event) => setRegisterDraft((current) => ({ ...current, confirmPassword: event.target.value }))} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[color:var(--muted-foreground)] hover:bg-[color:var(--surface-muted)]" onClick={() => setShowConfirmPassword((current) => !current)} aria-label={showConfirmPassword ? "Hide password" : "Show password"}>
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {registerErrors.confirmPassword ? <p className="text-sm text-rose-600 dark:text-rose-300">{registerErrors.confirmPassword}</p> : null}
            </div>
          </div>

          {registerMessage ? <p className="text-sm text-rose-600 dark:text-rose-300">{registerMessage}</p> : null}

          <Button type="submit" disabled={registerSubmitting}>
            {registerSubmitting ? "Creating..." : "Register Patient"}
          </Button>
        </form>
      </Modal>
    </>
  );
}
