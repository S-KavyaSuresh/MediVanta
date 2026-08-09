import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function PatientNotificationsPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Patient Dashboard"
      title="Notifications"
      description="Hospital notifications and reminders will be expanded in a later milestone."
      emptyTitle="Notifications coming soon"
      emptyDescription="Only appointment-linked updates are currently reflected in your overview."
    />
  );
}
