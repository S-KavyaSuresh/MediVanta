import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function AdminSettingsPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Administration"
      title="Settings"
      description="Administrative settings will be introduced as platform management expands."
      emptyTitle="Settings coming soon"
      emptyDescription="Platform configuration tools are not active in the current milestone."
    />
  );
}
