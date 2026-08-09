import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function LaboratoryDashboardPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Laboratory Workspace"
      title="Sample intake and reporting foundation"
      description="Use this workspace foundation for incoming laboratory requests, report tracking, and coordination with the clinical team."
      emptyTitle="Laboratory modules arrive in a later milestone"
      emptyDescription="Role-based access, routing, and navigation are ready so future laboratory workflows can be added without changing the authentication model."
    />
  );
}
