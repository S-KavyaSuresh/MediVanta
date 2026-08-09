import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function PharmacyDashboardPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Pharmacy Workspace"
      title="Prescription and dispensing foundation"
      description="Use this workspace foundation for future pharmacy workflows, prescription handling, and dispensing coordination."
      emptyTitle="Pharmacy modules arrive in a later milestone"
      emptyDescription="Role-based access, routing, and navigation are ready so pharmacy workflows can be added without restructuring authentication."
    />
  );
}
