"use client";

import { RoleProfilePage } from "@/components/dashboard/role-profile-page";
import { useAuth } from "@/components/providers/auth-provider";

const genderOptions = ["Female", "Male", "Non-binary", "Prefer not to say"].map((value) => ({
  value,
  label: value,
}));

export default function AdminProfilePage() {
  const { session } = useAuth();

  return (
    <RoleProfilePage
      eyebrow="Administration"
      title="Profile"
      description="Review the account identity currently linked to your administration workspace."
      initialDraft={{
        fullName: session.user.displayName,
        phoneNumber: session.user.phoneNumber ?? "",
        gender: session.user.gender ?? "",
      }}
      derivedValues={{
        profileId: session.user.id,
        organization: session.organization.name,
        designation: session.user.designation ?? "Not assigned",
        administrativeUnit: session.user.administrativeUnit ?? "Not assigned",
        status: session.user.staffStatus ?? "Not assigned",
      }}
      fields={[
        { key: "profileId", label: "Staff / Admin ID", type: "readonly", editable: false },
        { key: "fullName", label: "Full Name", type: "text" },
        { key: "email", label: "Email", type: "readonly", editable: false },
        { key: "phoneNumber", label: "Phone", type: "tel" },
        { key: "gender", label: "Gender", type: "select", options: genderOptions },
        { key: "organization", label: "Hospital / Branch", type: "readonly", editable: false },
        { key: "designation", label: "Designation", type: "readonly", editable: false },
        { key: "administrativeUnit", label: "Administrative Unit", type: "readonly", editable: false },
        { key: "status", label: "Account Status", type: "readonly", editable: false },
      ]}
    />
  );
}
