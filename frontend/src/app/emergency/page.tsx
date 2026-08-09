import { Ambulance, PhoneCall, ShieldAlert } from "lucide-react";

import { PublicShell } from "@/components/marketing/public-shell";
import { SectionIntro } from "@/components/marketing/section-intro";
import { Card } from "@/components/ui/card";
import { emergencyNumbers } from "@/lib/sample-data";

export default function EmergencyPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-18">
        <SectionIntro
          as="h1"
          eyebrow="Emergency"
          title="Emergency support information that stays easy to find under pressure"
          description="This page keeps critical contact details, urgent care guidance, and hospital emergency communication visible for patients, families, and front-desk teams."
        />
        <div className="mt-10 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--inverse-surface)] p-6 text-[color:var(--inverse-foreground)] sm:p-8">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-6 w-6 text-[color:var(--inverse-foreground)]" />
              <h2 className="text-2xl font-semibold">When immediate care is needed</h2>
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[color:var(--inverse-muted-foreground)]">
              Call the emergency desk or your local emergency services right away. MediVanta provides communication support information, but it does not replace emergency medical response.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/12 bg-[color:var(--inverse-surface-muted)] px-4 py-4 text-[color:var(--inverse-foreground)]">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Ambulance className="h-4 w-4" />
                  Ambulance access
                </div>
                <p className="mt-2 text-sm text-[color:var(--inverse-muted-foreground)]">
                  Keep patient location, arrival details, and support contacts ready when calling.
                </p>
              </div>
              <div className="rounded-xl border border-white/12 bg-[color:var(--inverse-surface-muted)] px-4 py-4 text-[color:var(--inverse-foreground)]">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <PhoneCall className="h-4 w-4" />
                  Triage communication
                </div>
                <p className="mt-2 text-sm text-[color:var(--inverse-muted-foreground)]">
                  Families should rely on verified local emergency services and confirmed hospital contacts for urgent direction.
                </p>
              </div>
            </div>
          </Card>
          <div className="space-y-4">
            {emergencyNumbers.map((item) => (
              <Card key={item.label} className="rounded-2xl p-6">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-lg font-semibold">{item.label}</h3>
                  <p className="text-sm font-semibold text-[color:var(--accent)]">{item.value}</p>
                </div>
                <p className="mt-3 text-sm leading-7 text-[color:var(--muted-foreground)]">{item.note}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
