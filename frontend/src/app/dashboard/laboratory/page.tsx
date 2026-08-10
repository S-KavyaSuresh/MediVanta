import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function LaboratoryDashboardPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Laboratory Workspace"
      title="Sample intake and reporting foundation"
      description="Use this area for laboratory requests, report tracking, and coordination with the clinical team."
      emptyTitle="Laboratory tools are being prepared"
      emptyDescription="Role-based access, routing, and navigation are ready so future laboratory workflows can be added without changing the authentication model."
    />
  );
}
