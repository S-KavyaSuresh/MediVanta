import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function PharmacyDispensingPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Pharmacy Workspace"
      title="Dispensing queue"
      description="Dispensing workflows and medication handoff tools will appear here in a later milestone."
      emptyTitle="Dispensing tools are not active yet"
      emptyDescription="This placeholder preserves the pharmacist role foundation without starting the full pharmacy module early."
    />
  );
}
