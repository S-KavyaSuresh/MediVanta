import { PublicShell } from "@/components/marketing/public-shell";
import { SectionIntro } from "@/components/marketing/section-intro";
import { Card } from "@/components/ui/card";
import { serviceDetails, services } from "@/lib/sample-data";

export default function ServicesPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-18">
        <SectionIntro
          as="h1"
          eyebrow="Services"
          title="Hospital services organized around care clarity"
          description="MediVanta helps hospitals communicate clinical services, support desks, specialty pathways, and care guidance in a format that feels dependable for patients and efficient for staff."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {services.map((service) => (
            <Card key={service.title} className="rounded-2xl p-6">
              <div className="rounded-lg bg-[color:var(--surface-muted)] p-3 text-[color:var(--accent)] w-fit">
                <service.icon className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-xl font-semibold">{service.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[color:var(--muted-foreground)]">
                {service.description}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 lg:pb-16">
        <div className="grid gap-5 lg:grid-cols-3">
          {serviceDetails.map((service) => (
            <Card key={service.name} className="rounded-2xl p-7">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-xl font-semibold">{service.name}</h3>
                <service.icon className="h-5 w-5 text-[color:var(--accent)]" />
              </div>
              <p className="mt-4 text-sm leading-7 text-[color:var(--muted-foreground)]">
                {service.summary}
              </p>
              <ul className="mt-6 space-y-3 text-sm text-[color:var(--muted-foreground)]">
                {service.bullets.map((bullet) => (
                  <li key={bullet} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3">
                    {bullet}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
