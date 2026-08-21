import { PublicShell } from "@/components/marketing/public-shell";
import { PublicDoctorRating } from "@/components/marketing/public-doctor-rating";
import { SectionIntro } from "@/components/marketing/section-intro";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { clinicians } from "@/lib/sample-data";

export default function DoctorsPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-18">
        <SectionIntro
          as="h1"
          eyebrow="Doctors"
          title="Meet clinicians across key specialties"
          description="Browse clinicians by specialty, department, and current availability to help patients and families find the right care pathway."
        />
        <p className="mt-6 text-sm text-[color:var(--muted-foreground)]">
          Doctor availability may vary by hospital and schedule.
        </p>
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {clinicians.map((doctor) => (
            <Card key={doctor.name} className="rounded-2xl p-7">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">{doctor.name}</h2>
                  <p className="mt-2 text-base text-[color:var(--muted-foreground)]">{doctor.specialty}</p>
                  <PublicDoctorRating doctorName={doctor.name} />
                </div>
                <Badge variant="success">{doctor.availability}</Badge>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                  <p className="text-sm font-semibold">Department</p>
                  <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">{doctor.department}</p>
                </div>
                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                  <p className="text-sm font-semibold">Experience</p>
                  <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">{doctor.experience}</p>
                </div>
              </div>
              <p className="mt-6 text-sm leading-7 text-[color:var(--muted-foreground)]">{doctor.focus}</p>
            </Card>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
