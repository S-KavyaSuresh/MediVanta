import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function DoctorNotificationsPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Doctor Workspace"
      title="Notifications"
      description="Clinical notifications will expand in a later milestone."
      emptyTitle="Notifications coming soon"
      emptyDescription="Operational appointment and queue updates are currently reflected in your overview."
    />
  );
}
