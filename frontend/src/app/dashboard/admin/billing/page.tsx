import { BillingView } from "@/components/dashboard/billing-view";

export default function AdminBillingPage() {
  return (
    <BillingView
      eyebrow="Administration"
      title="Billing"
      description="Monitor billing activity across the organization and record payments when required."
      canManagePayments
    />
  );
}
