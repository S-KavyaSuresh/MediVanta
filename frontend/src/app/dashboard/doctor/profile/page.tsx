"use client";

import { useMemo } from "react";

import { RoleProfilePage } from "@/components/dashboard/role-profile-page";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { useAuth } from "@/components/providers/auth-provider";

const genderOptions = ["Female", "Male", "Non-binary", "Prefer not to say"].map((value) => ({
  value,
  label: value,
}));

function formatDoctorId(id?: string) {
  const suffix = (id ?? "").replace(/^doc-?/, "").replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return `DOC-${suffix || "000001"}`;
}

export default function DoctorProfilePage() {
  const { session } = useAuth();
  const { getDepartmentName, state } = useHospitalData();
  const doctor = useMemo(
    () => state.doctors.find((entry) => entry.id === session.user.doctorId),
    [session.user.doctorId, state.doctors],
  );

  return (
    <RoleProfilePage
      eyebrow="Doctor Workspace"
      title="Profile"
      description="Review the account identity currently linked to your doctor workspace."
      initialDraft={{
        fullName: session.user.displayName,
        phoneNumber: session.user.phoneNumber ?? "",
        gender: session.user.gender ?? "",
        qualifications: session.user.qualifications ?? "",
        experience: session.user.experience ?? "",
        languages: session.user.languages ?? "",
        consultationFee: session.user.consultationFee ?? "",
        availableTimings: session.user.availableTimings ?? doctor?.shiftLabel ?? "",
        consultationMode: session.user.consultationMode ?? "",
      }}
      derivedValues={{
        profileId: formatDoctorId(session.user.doctorId ?? session.user.id),
        specialization: doctor?.specialization ?? "Not assigned",
        department: doctor ? getDepartmentName(doctor.departmentId) : "Not assigned",
        organization: session.organization.name,
        designation: session.user.designation ?? "Not assigned",
        shift: session.user.shift ?? doctor?.shiftLabel ?? "Not assigned",
        professionalRegistrationNumber:
          session.user.professionalRegistrationNumber ?? "Not assigned",
        profileVerificationStatus:
          session.user.profileVerificationStatus ?? "Not assigned",
        status: doctor?.status ?? session.user.staffStatus ?? "Not assigned",
      }}
      fields={[
        { key: "profileId", label: "Doctor / Staff ID", type: "readonly", editable: false },
        { key: "fullName", label: "Full Name", type: "text" },
        { key: "email", label: "Email", type: "readonly", editable: false },
        { key: "phoneNumber", label: "Phone", type: "tel" },
        { key: "gender", label: "Gender", type: "select", options: genderOptions },
        { key: "organization", label: "Hospital / Branch", type: "readonly", editable: false },
        { key: "specialization", label: "Specialization", type: "readonly", editable: false },
        { key: "department", label: "Department", type: "readonly", editable: false },
        { key: "designation", label: "Designation", type: "readonly", editable: false },
        { key: "qualifications", label: "Qualifications", type: "text" },
        { key: "experience", label: "Years of Experience", type: "text" },
        { key: "professionalRegistrationNumber", label: "Medical Registration / License Number", type: "readonly", editable: false },
        { key: "languages", label: "Languages", type: "text" },
        { key: "consultationFee", label: "Consultation Fee", type: "text" },
        { key: "consultationMode", label: "Consultation Mode", type: "text" },
        { key: "availableTimings", label: "Available Timings / Shift", type: "text" },
        { key: "profileVerificationStatus", label: "Profile Verification Status", type: "readonly", editable: false },
        { key: "status", label: "Account / Duty Status", type: "readonly", editable: false },
      ]}
    />
  );
}
