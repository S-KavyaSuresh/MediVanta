import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function PatientPrescriptionsPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Patient Dashboard"
      title="Prescriptions"
      description="Prescription visibility will be added when the medication workflow is introduced."
      emptyTitle="Prescriptions coming soon"
      emptyDescription="Prescription history is not active in the current milestone."
    />
  );
}
