import { PublicShell } from "@/components/marketing/public-shell";
import { SectionIntro } from "@/components/marketing/section-intro";
import { Card } from "@/components/ui/card";
import { aboutMetrics, aboutValues } from "@/lib/sample-data";

export default function AboutPage() {
  return (
    <PublicShell>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-18">
        <SectionIntro
          as="h1"
          eyebrow="About MediVanta"
          title="A healthcare product identity shaped around trust, calm, and hospital clarity"
          description="MediVanta is designed to help hospitals present care information and operational context through a digital experience that feels measured, reliable, and easier to use for everyone involved."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {aboutMetrics.map((metric) => (
            <Card key={metric.label} className="rounded-2xl p-6">
              <p className="text-sm text-[color:var(--muted-foreground)]">{metric.label}</p>
              <p className="mt-4 text-3xl font-semibold">{metric.value}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 lg:pb-16">
        <div className="grid gap-5 lg:grid-cols-3">
          {aboutValues.map((value) => (
            <Card key={value.title} className="rounded-2xl p-7">
              <div className="rounded-lg bg-[color:var(--surface-muted)] p-3 text-[color:var(--accent)] w-fit">
                <value.icon className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-xl font-semibold">{value.title}</h2>
              <p className="mt-4 text-sm leading-7 text-[color:var(--muted-foreground)]">
                {value.description}
              </p>
            </Card>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
