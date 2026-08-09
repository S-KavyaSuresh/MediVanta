import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function DoctorRecordsPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Doctor Workspace"
      title="Medical Records"
      description="A clinician records workspace will be introduced when the medical record milestone is active."
      emptyTitle="Medical records coming soon"
      emptyDescription="Comprehensive record review is not active in the current milestone."
    />
  );
}
