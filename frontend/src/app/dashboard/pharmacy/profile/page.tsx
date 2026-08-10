"use client";

import { RoleProfilePage } from "@/components/dashboard/role-profile-page";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { useAuth } from "@/components/providers/auth-provider";

const genderOptions = ["Female", "Male", "Non-binary", "Prefer not to say"].map((value) => ({
  value,
  label: value,
}));

export default function PharmacyProfilePage() {
  const { session } = useAuth();
  const { getDepartmentName } = useHospitalData();

  return (
    <RoleProfilePage
      eyebrow="Pharmacy Workspace"
      title="Profile"
      description="Review the account identity currently linked to your pharmacy workspace."
      initialDraft={{
        fullName: session.user.displayName,
        phoneNumber: session.user.phoneNumber ?? "",
        gender: session.user.gender ?? "",
      }}
      derivedValues={{
        profileId: session.user.id,
        department: session.user.departmentId
          ? `Pharmacy / ${getDepartmentName(session.user.departmentId)}`
          : "Pharmacy / Not assigned",
        organization: session.organization.name,
        designation: session.user.designation ?? "Not assigned",
        qualifications: session.user.qualifications ?? "Not assigned",
        professionalRegistrationNumber:
          session.user.professionalRegistrationNumber ?? "Not assigned",
        shift: session.user.shift ?? "Not assigned",
        status: session.user.staffStatus ?? "Not assigned",
      }}
      fields={[
        { key: "profileId", label: "Staff ID", type: "readonly", editable: false },
        { key: "fullName", label: "Full Name", type: "text" },
        { key: "email", label: "Email", type: "readonly", editable: false },
        { key: "phoneNumber", label: "Phone", type: "tel" },
        { key: "gender", label: "Gender", type: "select", options: genderOptions },
        { key: "organization", label: "Hospital / Branch", type: "readonly", editable: false },
        { key: "department", label: "Pharmacy / Department", type: "readonly", editable: false },
        { key: "designation", label: "Designation", type: "readonly", editable: false },
        { key: "qualifications", label: "Qualifications", type: "readonly", editable: false },
        { key: "professionalRegistrationNumber", label: "Pharmacist Registration / License Number", type: "readonly", editable: false },
        { key: "shift", label: "Shift", type: "readonly", editable: false },
        { key: "status", label: "Account / Duty Status", type: "readonly", editable: false },
      ]}
    />
  );
}
