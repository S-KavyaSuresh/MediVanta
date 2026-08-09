import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function PharmacyPrescriptionsPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Pharmacy Workspace"
      title="Prescriptions"
      description="Prescription validation and fulfillment tools will appear here in a later milestone."
      emptyTitle="Prescription tools are not active yet"
      emptyDescription="The pharmacy workspace foundation is ready without exposing unrelated hospital controls."
    />
  );
}
