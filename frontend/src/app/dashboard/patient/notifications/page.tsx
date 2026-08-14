import { NotificationsView } from "@/components/dashboard/notifications-view";

export default function PatientNotificationsPage() {
  return (
    <NotificationsView
      eyebrow="My Dashboard"
      title="Notifications"
      description="Stay informed about appointments, laboratory updates, prescriptions, and billing activity."
    />
  );
}
