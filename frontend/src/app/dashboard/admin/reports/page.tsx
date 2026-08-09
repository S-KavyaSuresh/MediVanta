import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function AdminReportsPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Administration"
      title="Reports / Analytics"
      description="Reports will expand as more operational and clinical modules become active."
      emptyTitle="Reports coming soon"
      emptyDescription="Advanced analytics are not active yet, so only the current operational overview is available."
    />
  );
}
