import { AdminBillingDayDetailView } from "@/components/dashboard/admin-billing-day-detail-view";

export default async function AdminBillingDayPage({
  params,
}: {
  params: Promise<{ billingDate: string }>;
}) {
  const { billingDate } = await params;

  return <AdminBillingDayDetailView billingDate={billingDate} />;
}
