import { HeartHandshake, PhoneCall } from "lucide-react";

import { PublicShell } from "@/components/marketing/public-shell";
import { SectionIntro } from "@/components/marketing/section-intro";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { emergencyNumbers } from "@/lib/sample-data";

export default function ContactPage() {
  return (
    <PublicShell>
      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-18">
        <div>
          <SectionIntro
            as="h1"
            eyebrow="Contact"
            title="Reach the right hospital support conversation faster"
            description="Use this contact experience to guide patients, families, care teams, or hospital partners toward the right department with clearer intake and communication pathways."
          />
          <Card className="mt-8 rounded-2xl p-7">
            <div className="flex items-center gap-3">
              <HeartHandshake className="h-6 w-6 text-[color:var(--accent)]" />
              <h2 className="text-xl font-semibold">Send an enquiry</h2>
            </div>
            <div className="mt-6 space-y-4">
              <Input placeholder="Your name" aria-label="Your name" />
              <Input placeholder="Email address" type="email" aria-label="Email address" />
              <Input placeholder="Hospital, department, or organization" aria-label="Organization" />
              <Textarea placeholder="How can MediVanta help your hospital communication or service experience?" />
              <Button>Submit enquiry</Button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="rounded-2xl p-7">
            <div className="flex items-center gap-3">
              <PhoneCall className="h-6 w-6 text-[color:var(--accent)]" />
              <h2 className="text-xl font-semibold">Support contacts</h2>
            </div>
            <div className="mt-6 space-y-4">
              {emergencyNumbers.map((item) => (
                <div key={item.label} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-semibold">{item.label}</p>
                    <p className="text-sm font-semibold text-[color:var(--accent)]">{item.value}</p>
                  </div>
                  <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">{item.note}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--inverse-surface)] p-7 text-[color:var(--inverse-foreground)]">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--inverse-muted-foreground)]">
              For urgent situations
            </p>
            <p className="mt-4 text-base leading-7 text-[color:var(--inverse-muted-foreground)]">
              If a patient needs immediate medical attention, contact local emergency services or your hospital&apos;s verified emergency desk without delay.
            </p>
          </Card>
        </div>
      </section>
    </PublicShell>
  );
}
