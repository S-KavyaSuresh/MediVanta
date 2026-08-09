import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function PatientRecordsPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Patient Dashboard"
      title="My Health Records"
      description="A dedicated records workspace will appear here when the next clinical record milestone is active."
      emptyTitle="Health records coming soon"
      emptyDescription="Your hospital record view is planned for a later milestone and is not active yet."
    />
  );
}
