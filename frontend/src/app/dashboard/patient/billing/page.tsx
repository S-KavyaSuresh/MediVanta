import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function PatientBillingPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Patient Dashboard"
      title="Billing"
      description="Billing information will appear here when available."
      emptyTitle="Billing coming soon"
      emptyDescription="Billing statements and payment tracking are not active yet."
    />
  );
}
