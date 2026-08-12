import { NotificationsView } from "@/components/dashboard/notifications-view";

export default function LaboratoryNotificationsPage() {
  return (
    <NotificationsView
      eyebrow="Laboratory Workspace"
      title="Notifications"
      description="Review incoming request alerts and completed report activity for the laboratory team."
    />
  );
}
