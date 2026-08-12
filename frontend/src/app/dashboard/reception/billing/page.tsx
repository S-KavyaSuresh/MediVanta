import { BillingView } from "@/components/dashboard/billing-view";

export default function ReceptionBillingPage() {
  return (
    <BillingView
      eyebrow="Reception Desk"
      title="Billing"
      description="Review invoice activity, track outstanding balances, and record payments at the front desk."
      canManagePayments
    />
  );
}
