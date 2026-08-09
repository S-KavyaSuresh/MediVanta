import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function PatientBillingPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Patient Dashboard"
      title="Billing"
      description="Billing information will be introduced in a later administrative milestone."
      emptyTitle="Billing coming soon"
      emptyDescription="Billing statements and payment tracking are not active yet."
    />
  );
}
