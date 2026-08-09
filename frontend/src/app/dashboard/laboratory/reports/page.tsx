import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function LaboratoryReportsPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Laboratory Workspace"
      title="Lab reports"
      description="Report review and release tools will appear here in a later milestone."
      emptyTitle="Lab reporting tools are not active yet"
      emptyDescription="This placeholder keeps role routing and navigation ready for laboratory staff."
    />
  );
}
