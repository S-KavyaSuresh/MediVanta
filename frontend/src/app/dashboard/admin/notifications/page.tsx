import { NotificationsView } from "@/components/dashboard/notifications-view";

export default function AdminNotificationsPage() {
  return (
    <NotificationsView
      eyebrow="Administration"
      title="Notifications"
      description="Track operational alerts related to appointments, laboratory activity, billing, and pharmacy stock."
    />
  );
}
