"use client";

import { Building2, MapPin, Users } from "lucide-react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function DepartmentsPage() {
  const { departmentSummaries } = useHospitalData();

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Departments"
        title="Clinical departments and current operational load"
        description="Track department locations, current operating status, available clinicians, and active queue totals across the hospital."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {departmentSummaries.map((department) => (
          <Card key={department.id} className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-[color:var(--accent)]" />
                  <p className="text-lg font-semibold">{department.name}</p>
                </div>
                <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                  {department.code}
                </p>
              </div>
              <StatusBadge status={department.status} />
            </div>

            <p className="text-sm leading-7 text-[color:var(--muted-foreground)]">
              {department.description}
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
                  Doctors
                </p>
                <p className="mt-2 text-2xl font-semibold">{department.availableDoctorCount}</p>
                <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                  of {department.totalDoctorCount} assigned
                </p>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
                  Active queue
                </p>
                <p className="mt-2 text-2xl font-semibold">{department.activeQueueCount}</p>
                <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                  patients in progress
                </p>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
                  <MapPin className="h-3.5 w-3.5" />
                  Location
                </div>
                <p className="mt-2 text-sm font-semibold">{department.location}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
