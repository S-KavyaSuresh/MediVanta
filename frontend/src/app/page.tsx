import Link from "next/link";
import { ArrowRight, MessageSquareQuote, PhoneCall, ShieldPlus } from "lucide-react";

import { PublicShell } from "@/components/marketing/public-shell";
import { SectionIntro } from "@/components/marketing/section-intro";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getOptionalServerSession } from "@/lib/server-auth";
import {
  emergencyNumbers,
  faqs,
  homeHighlights,
  participatingHospitals,
  services,
  testimonials,
} from "@/lib/sample-data";

export default async function Home() {
  const session = await getOptionalServerSession();

  return (
    <PublicShell>
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:gap-10 sm:px-6 sm:py-14 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-20">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">
            Connected healthcare platform
          </p>
          <h1 className="mt-5 max-w-4xl text-[2.35rem] font-semibold leading-tight sm:mt-6 sm:text-4xl md:text-5xl lg:text-6xl">
            Connected healthcare, from appointment to follow-up.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[color:var(--muted-foreground)] sm:mt-6 sm:text-lg sm:leading-8">
            MediVanta connects patients with hospitals through one calm experience for hospital discovery, services, appointments, and follow-up access.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={session ? "/dashboard" : "/login"}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[color:var(--accent)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_-20px_rgba(18,99,143,0.9)] hover:bg-[color:var(--accent-strong)]"
            >
              {session ? "Go to Dashboard" : "Sign In"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/services"
              className="inline-flex items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-3 text-sm font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--surface-muted)]"
            >
              Explore Services
            </Link>
            <Link
              href="/hospitals"
              className="inline-flex items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-3 text-sm font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--surface-muted)]"
            >
              Find Hospitals
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--inverse-surface)] p-5 text-[color:var(--inverse-foreground)] shadow-[0_30px_70px_-40px_rgba(9,17,28,0.65)] sm:col-span-2 sm:p-7">
            <Badge className="border-white/10 bg-[color:var(--inverse-surface-muted)] text-[color:var(--inverse-foreground)]" variant="neutral">
              For hospitals and clinics
            </Badge>
            <h2 className="mt-5 text-xl font-semibold sm:text-2xl">
              One digital experience for hospital discovery, services, and patient access.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-[color:var(--inverse-muted-foreground)]">
              Patients can find hospitals quickly while care teams keep appointments, services, and operational context aligned.
            </p>
          </Card>
          {homeHighlights.slice(0, 2).map((item) => (
            <Card key={item.title} className="rounded-2xl p-5 sm:p-6">
              <p className="text-base font-semibold">{item.title}</p>
              <p className="mt-3 text-sm leading-7 text-[color:var(--muted-foreground)]">
                {item.description}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <SectionIntro
          eyebrow="Services"
          title="Key hospital services in one clear view"
          description="Explore core care services, support pathways, and specialty access without digging through disconnected hospital information."
        />
        <div className="mt-10 divide-y divide-[color:var(--border)] rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)]">
          {services.map((service) => (
            <div
              key={service.title}
              className="grid gap-4 px-5 py-5 md:grid-cols-[14rem_1fr_auto] md:items-center md:px-6"
            >
              <div>
                <p className="text-lg font-semibold">{service.title}</p>
              </div>
              <p className="text-sm leading-7 text-[color:var(--muted-foreground)]">
                {service.description}
              </p>
              <div className="rounded-lg bg-[color:var(--surface-muted)] p-2.5 text-[color:var(--accent)] w-fit">
                <service.icon className="h-5 w-5" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="flex items-center justify-between gap-4">
          <SectionIntro
            eyebrow="Hospitals"
            title="Hospitals"
            description="Find hospitals and explore their services before choosing where to continue care."
          />
          <Link
            href="/hospitals"
            className="hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-sm font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--surface-muted)] lg:inline-flex"
          >
            View all hospitals
          </Link>
        </div>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {participatingHospitals.map((hospital) => (
            <Card key={hospital.id} className="rounded-2xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold">{hospital.name}</h3>
                  <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">{hospital.city}</p>
                </div>
                <Badge variant="neutral">{hospital.emergencyAvailability}</Badge>
              </div>
              <div className="mt-6 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                <div className="flex items-start gap-3">
                  <ShieldPlus className="mt-0.5 h-5 w-5 text-[color:var(--accent)]" />
                  <div className="space-y-2 text-sm">
                    <p className="font-semibold">Hospital services</p>
                    <p className="text-[color:var(--muted-foreground)]">
                      {hospital.services.join(" • ")}
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-6 text-sm leading-7 text-[color:var(--muted-foreground)]">
                {hospital.summary}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="border-y border-[color:var(--border)]">
          {testimonials.slice(0, 2).map((item) => (
            <div
              key={item.author}
              className="grid gap-4 border-b border-[color:var(--border)] px-1 py-6 last:border-b-0 lg:grid-cols-[2rem_1fr_18rem]"
            >
              <MessageSquareQuote className="mt-1 h-6 w-6 text-[color:var(--accent)]" />
              <p className="text-lg leading-8">{item.quote}</p>
              <p className="text-sm font-semibold text-[color:var(--muted-foreground)] lg:text-right">
                {item.author}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-14">
        <div>
          <SectionIntro
            eyebrow="FAQ"
            title="Useful answers before the visit"
            description="A short set of practical questions for patients and families."
          />
          <div className="mt-8 space-y-4">
            {faqs.slice(0, 3).map((item) => (
              <Card key={item.question} className="rounded-2xl p-5">
                <h3 className="text-lg font-semibold">{item.question}</h3>
                <p className="mt-3 text-sm leading-7 text-[color:var(--muted-foreground)]">
                  {item.answer}
                </p>
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <Card className="rounded-2xl p-5 sm:p-7">
            <PhoneCall className="h-6 w-6 text-[color:var(--accent)]" />
            <h3 className="mt-5 text-2xl font-semibold">Emergency support contacts</h3>
            <div className="mt-6 space-y-4">
              {emergencyNumbers.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-semibold">{item.label}</p>
                    <p className="text-sm font-semibold text-[color:var(--accent)]">{item.value}</p>
                  </div>
                  <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">{item.note}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--inverse-surface)] p-5 text-[color:var(--inverse-foreground)] sm:p-7">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--inverse-muted-foreground)]">
              Need more information?
            </p>
            <p className="mt-4 text-xl font-semibold">Our contact and emergency pages provide the fastest path to the right team.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/contact"
                className="rounded-lg bg-[color:var(--inverse-foreground)] px-4 py-2 text-sm font-semibold text-[color:var(--inverse-surface)]"
              >
                Contact us
              </Link>
              <Link
                href="/emergency"
                className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-[color:var(--inverse-foreground)] hover:bg-[color:var(--inverse-surface-muted)]"
              >
                Emergency information
              </Link>
            </div>
          </Card>
        </div>
      </section>
    </PublicShell>
  );
}
