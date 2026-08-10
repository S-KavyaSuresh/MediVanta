"use client";

import { RoleProfilePage } from "@/components/dashboard/role-profile-page";
import { useAuth } from "@/components/providers/auth-provider";

const genderOptions = ["Female", "Male", "Non-binary", "Prefer not to say"].map((value) => ({
  value,
  label: value,
}));

export default function ReceptionProfilePage() {
  const { session } = useAuth();

  return (
    <RoleProfilePage
      eyebrow="Reception Desk"
      title="Profile"
      description="Review the account identity currently linked to your reception workspace."
      initialDraft={{
        fullName: session.user.displayName,
        phoneNumber: session.user.phoneNumber ?? "",
        gender: session.user.gender ?? "",
        deskLabel: session.user.deskLabel ?? "",
      }}
      derivedValues={{
        profileId: session.user.id,
        department: session.user.deskLabel || "Reception",
        organization: session.organization.name,
        designation: session.user.designation ?? "Not assigned",
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
        { key: "deskLabel", label: "Department / Desk", type: "text" },
        { key: "designation", label: "Designation", type: "readonly", editable: false },
        { key: "shift", label: "Shift", type: "readonly", editable: false },
        { key: "status", label: "Account / Duty Status", type: "readonly", editable: false },
      ]}
    />
  );
}
