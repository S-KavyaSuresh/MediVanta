import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function DoctorPrescriptionsPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Doctor Workspace"
      title="Prescriptions"
      description="Prescription tools will be added in a later clinical workflow milestone."
      emptyTitle="Prescriptions coming soon"
      emptyDescription="Prescription authoring and review are not active in the current milestone."
    />
  );
}
