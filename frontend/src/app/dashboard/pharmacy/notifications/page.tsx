import { NotificationsView } from "@/components/dashboard/notifications-view";

export default function PharmacyNotificationsPage() {
  return (
    <NotificationsView
      eyebrow="Pharmacy Workspace"
      title="Notifications"
      description="Review prescription handoff updates, billing notices, and low-stock alerts for the pharmacy."
    />
  );
}
