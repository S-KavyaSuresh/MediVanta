import { PublicShell } from "@/components/marketing/public-shell";
import { SectionIntro } from "@/components/marketing/section-intro";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { participatingHospitals } from "@/lib/sample-data";

export default function HospitalsPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-18">
        <SectionIntro
          as="h1"
          eyebrow="Hospitals"
          title="Hospitals"
          description="Find hospitals and explore their services before choosing where to continue care."
        />
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {participatingHospitals.map((hospital) => (
            <Card key={hospital.id} className="rounded-2xl p-7">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">{hospital.name}</h2>
                  <p className="mt-2 text-base text-[color:var(--muted-foreground)]">{hospital.city}</p>
                </div>
                <Badge variant="neutral">{hospital.emergencyAvailability}</Badge>
              </div>
              <p className="mt-6 text-sm leading-7 text-[color:var(--muted-foreground)]">
                {hospital.summary}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {hospital.services.map((service) => (
                  <span
                    key={service}
                    className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs font-medium"
                  >
                    {service}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
