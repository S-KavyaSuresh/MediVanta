import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function DoctorLabReportsPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Doctor Workspace"
      title="Lab Reports"
      description="Lab report review will appear here once the diagnostics workflow is active."
      emptyTitle="Lab reports coming soon"
      emptyDescription="Diagnostic result access is not active yet."
    />
  );
}
