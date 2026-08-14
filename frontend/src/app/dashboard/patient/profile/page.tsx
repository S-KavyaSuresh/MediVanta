"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { RoleProfilePage } from "@/components/dashboard/role-profile-page";

const bloodGroupOptions = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((value) => ({
  value,
  label: value,
}));

const genderOptions = ["Female", "Male", "Non-binary", "Prefer not to say"].map((value) => ({
  value,
  label: value,
}));

const languageOptions = ["English", "Tamil", "Hindi"].map((value) => ({
  value,
  label: value,
}));

function getAge(dateOfBirth?: string) {
  if (!dateOfBirth) {
    return "Not assigned";
  }

  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) {
    return "Not assigned";
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age >= 0 ? `${age} years` : "Not assigned";
}

function parseEmergencyContact(sessionEmergencyContact?: string) {
  if (!sessionEmergencyContact) {
    return { name: "", phone: "" };
  }

  const [name = "", phone = ""] = sessionEmergencyContact.split(/[·•]/).map((value) => value.trim());
  return { name, phone };
}

function getEmergencyContactPhone(value?: string, fallback?: string) {
  const direct = value?.trim() ?? "";
  if (/[\d+()\-\s]{7,}/.test(direct)) {
    return direct;
  }

  return fallback?.trim() ?? "";
}

function formatPatientId(id: string) {
  const suffix = id.replace(/^user-patient-?/, "").replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `PAT-${suffix || "000001"}`;
}

export default function PatientProfilePage() {
  const { session } = useAuth();
  const parsedEmergency = parseEmergencyContact(session.user.emergencyContact);
  const emergencyContact = {
    name: session.user.emergencyContactName ?? parsedEmergency.name,
    phone: getEmergencyContactPhone(session.user.emergencyContactPhone, parsedEmergency.phone),
  };

  return (
    <RoleProfilePage
      eyebrow="My Dashboard"
      title="Profile"
      description="Review and update the personal details linked to your patient workspace."
      initialDraft={{
        fullName: session.user.patientName ?? session.user.displayName,
        phoneNumber: session.user.phoneNumber ?? "",
        gender: session.user.gender ?? "",
        dateOfBirth: session.user.dateOfBirth ?? "",
        bloodGroup: session.user.bloodGroup ?? "",
        addressLine1: session.user.addressLine1 ?? session.user.address ?? "",
        addressLine2: session.user.addressLine2 ?? "",
        city: session.user.city ?? "",
        state: session.user.state ?? "",
        postalCode: session.user.postalCode ?? "",
        emergencyContactName: emergencyContact.name,
        emergencyContactPhone: emergencyContact.phone,
        allergies: session.user.allergies ?? "",
        medicalConditions: session.user.medicalConditions ?? "",
        preferredLanguage: session.user.preferredLanguage ?? session.organization.defaultLanguage ?? "",
      }}
      derivedValues={{
        profileId: formatPatientId(session.user.id),
        age: getAge(session.user.dateOfBirth),
        organization: session.organization.name,
        status: "Active",
      }}
      fields={[
        { key: "profileId", label: "Patient ID", type: "readonly", editable: false },
        { key: "fullName", label: "Full Name", type: "text" },
        { key: "email", label: "Email", type: "readonly", editable: false },
        { key: "phoneNumber", label: "Phone", type: "tel" },
        { key: "dateOfBirth", label: "Date of Birth", type: "date" },
        { key: "age", label: "Age", type: "readonly", editable: false },
        { key: "gender", label: "Gender", type: "select", options: genderOptions },
        { key: "bloodGroup", label: "Blood Group", type: "select", options: bloodGroupOptions },
        { key: "organization", label: "Hospital / Organization", type: "readonly", editable: false },
        { key: "addressLine1", label: "Address Line 1", type: "text" },
        { key: "addressLine2", label: "Address Line 2", type: "text" },
        { key: "city", label: "City", type: "text" },
        { key: "state", label: "State", type: "text" },
        { key: "postalCode", label: "Postal Code", type: "text" },
        { key: "emergencyContactName", label: "Emergency Contact Name", type: "text" },
        { key: "emergencyContactPhone", label: "Emergency Contact Phone", type: "tel" },
        { key: "allergies", label: "Allergies", type: "textarea" },
        { key: "medicalConditions", label: "Existing / Chronic Medical Conditions", type: "textarea" },
        { key: "preferredLanguage", label: "Preferred Language", type: "select", options: languageOptions },
        { key: "status", label: "Account Status", type: "readonly", editable: false },
      ]}
    />
  );
}
