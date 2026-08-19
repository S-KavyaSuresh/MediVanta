import { BillingView } from "@/components/dashboard/billing-view";

export default function PatientBillingPage() {
  return (
    <BillingView
      eyebrow="Billing"
      title="Billing"
      description="Review invoices, itemized charges, and payment progress connected to your care."
      canManagePayments={false}
    />
  );
}
