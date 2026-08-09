"use client";

import { Building2, CalendarClock, ShieldCheck, Users } from "lucide-react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";

export function AdminOverview() {
  const { departmentSummaries, meta, metrics } = useHospitalData();
  const userCounts = meta?.userCounts;

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Operational visibility across MediVanta"
        description="Review hospital activity, users, and core operational readiness without leaving the administrative workspace."
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's appointments"
          value={String(metrics.todaysAppointments)}
          delta="Across all operational departments"
          icon={CalendarClock}
        />
        <StatCard
          label="Active queue"
          value={String(metrics.activeQueueCount)}
          delta="Waiting, called, or in consultation"
          icon={ShieldCheck}
        />
        <StatCard
          label="Departments"
          value={String(departmentSummaries.length)}
          delta="Configured hospital departments"
          icon={Building2}
        />
        <StatCard
          label="User accounts"
          value={String(meta?.users?.length ?? 0)}
          delta="Seeded evaluation accounts"
          icon={Users}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">User counts by role</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {userCounts
              ? Object.entries(userCounts).map(([role, count]) => (
                  <div
                    key={role}
                    className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                      {role}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{count}</p>
                  </div>
                ))
              : null}
          </div>
        </Card>
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">Department readiness</h2>
          <div className="space-y-3">
            {departmentSummaries.slice(0, 5).map((department) => (
              <div
                key={department.id}
                className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
              >
                <p className="font-semibold">{department.name}</p>
                <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                  {department.availableDoctorCount} available doctors · {department.activeQueueCount} active queue entries
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
