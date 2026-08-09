"use client";

import { useMemo, useState } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";

export default function DashboardDoctorsPage() {
  const { getDepartmentName, state } = useHospitalData();
  const [query, setQuery] = useState("");
  const [departmentId, setDepartmentId] = useState("all");
  const [status, setStatus] = useState("all");

  const doctors = useMemo(() => {
    return state.doctors.filter((doctor) => {
      const matchesQuery =
        [doctor.name, doctor.specialization, doctor.availability, doctor.shiftLabel]
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase());
      const matchesDepartment =
        departmentId === "all" || doctor.departmentId === departmentId;
      const matchesStatus = status === "all" || doctor.status === status;

      return matchesQuery && matchesDepartment && matchesStatus;
    });
  }, [departmentId, query, state.doctors, status]);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Doctors"
        title="Operational doctor directory"
        description="Monitor clinician assignments, current duty status, and consultation shifts across hospital departments."
      />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem_14rem]">
        <Input
          aria-label="Search doctors"
          placeholder="Search doctors by name or specialty"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
          <option value="all">All departments</option>
          {state.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          {["Available", "Consulting", "On break", "Off duty", "Emergency duty"].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {doctors.map((doctor) => (
          <Card key={doctor.id} className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">{doctor.name}</h2>
                <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                  {doctor.specialization}
                </p>
              </div>
              <StatusBadge status={doctor.status} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                <p className="text-sm font-semibold">Department</p>
                <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                  {getDepartmentName(doctor.departmentId)}
                </p>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                <p className="text-sm font-semibold">Availability</p>
                <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                  {doctor.availability}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
              <p className="text-sm font-semibold">Current shift</p>
              <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                {doctor.shiftLabel}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
