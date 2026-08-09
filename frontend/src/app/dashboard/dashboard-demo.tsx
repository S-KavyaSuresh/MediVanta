"use client";

import {
  Activity,
  BellRing,
  CalendarClock,
  ClipboardList,
  PhoneCall,
  Stethoscope,
} from "lucide-react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import type { AppointmentStatus, QueueStatus } from "@/lib/hospital-data";

export function DashboardDemo({
  eyebrow = "Hospital Workspace",
  title = "A shared operations view for appointments, queues, notices, and daily activity",
  description = "MediVanta brings essential hospital information into one clear workspace so front-desk teams, clinicians, and support staff can stay aligned during the day.",
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  const {
    activeQueueEntries,
    getDepartmentName,
    getDoctorName,
    metrics,
    state,
  } = useHospitalData();

  const statCards = [
    {
      label: "Today's appointments",
      value: String(metrics.todaysAppointments),
      delta: `${state.appointments.filter((appointment) => appointment.appointmentDate === "2026-08-09" && appointment.status === "Scheduled").length} still scheduled`,
      icon: CalendarClock,
    },
    {
      label: "Queue in progress",
      value: String(metrics.activeQueueCount),
      delta: "Waiting, called, or in consultation",
      icon: Activity,
    },
    {
      label: "Doctors on duty",
      value: String(metrics.doctorsOnDuty),
      delta: "Available across active departments",
      icon: Stethoscope,
    },
    {
      label: "Patient support lines",
      value: String(metrics.patientSupportLines),
      delta: "Configured support channels",
      icon: PhoneCall,
    },
  ];

  const todaysAppointments = state.appointments.filter(
    (appointment) => appointment.appointmentDate === "2026-08-09",
  );

  return (
    <div className="min-w-0 max-w-full space-y-6 md:space-y-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        <div className="min-w-0 space-y-5">
          {activeQueueEntries.length > 0 ? (
            <DataTable
              columns={[
                { id: "overview-queue-id", key: "id", header: "Queue ID" },
                { id: "overview-queue-patient", key: "patientName", header: "Patient" },
                {
                  id: "overview-queue-department",
                  key: "departmentId",
                  header: "Department",
                  render: (value) => getDepartmentName(String(value)),
                },
                {
                  id: "overview-queue-status",
                  key: "status",
                  header: "Status",
                  render: (value) => <StatusBadge status={value as QueueStatus} />,
                },
                { id: "overview-queue-updated", key: "updatedAt", header: "Updated" },
              ]}
              rows={activeQueueEntries}
            />
          ) : (
            <EmptyState
              title="No active queue entries"
              description="Checked-in appointments and live walk-ins will appear here as soon as the queue starts moving."
            />
          )}

          <Card className="min-w-0 space-y-4 p-5 sm:p-6">
            <div className="flex min-w-0 items-start gap-4">
              <div className="rounded-lg bg-[color:var(--surface-muted)] p-2 text-[color:var(--accent)]">
                <ClipboardList className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-7">Care coordination priorities</h2>
                <p className="mt-1 text-sm leading-6 text-[color:var(--muted-foreground)]">
                  Upcoming appointments and queue movement are now connected through one shared hospital state layer.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {todaysAppointments.slice(0, 3).map((appointment) => (
                <div
                  key={appointment.id}
                  className="min-w-0 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4 text-sm leading-6"
                >
                  <p className="break-words font-semibold text-[color:var(--foreground)]">
                    {appointment.patientName} - {appointment.id}
                  </p>
                  <p className="mt-1 break-words text-[color:var(--muted-foreground)]">
                    {getDoctorName(appointment.doctorId)} - {getDepartmentName(appointment.departmentId)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <StatusBadge status={appointment.status as AppointmentStatus} />
                    <span className="break-words text-[color:var(--muted-foreground)]">
                      {appointment.appointmentDate} at {appointment.appointmentTime}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card className="min-w-0 p-5 sm:p-6">
            <div className="flex min-w-0 items-start gap-4">
              <div className="rounded-lg bg-[color:var(--surface-muted)] p-2 text-[color:var(--accent)]">
                <BellRing className="h-4 w-4 shrink-0" />
              </div>
              <div className="min-w-0 pr-1">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] leading-6 text-[color:var(--accent)]">
                  Hospital status
                </p>
                <h2 className="mt-2 text-xl font-semibold leading-7 sm:text-2xl sm:leading-8">
                  Current notices and preparation points
                </h2>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {state.departments
                .filter((department) => department.status !== "Operational")
                .map((department) => (
                  <div
                    key={department.id}
                    className="min-w-0 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
                  >
                    <StatusBadge status={department.status} />
                    <p className="mt-3 break-words font-semibold">{department.name}</p>
                    <p className="mt-2 break-words text-sm leading-6 text-[color:var(--muted-foreground)]">
                      {department.description}
                    </p>
                  </div>
                ))}
            </div>
          </Card>

          <Card className="min-w-0 p-5 sm:p-6">
            <div className="flex min-w-0 items-start gap-4">
              <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--accent)]" />
              <h2 className="min-w-0 text-xl font-semibold leading-7">Recent activity</h2>
            </div>
            <div className="mt-5 space-y-3">
              {activeQueueEntries.slice(0, 3).map((entry) => (
                <div
                  key={entry.id}
                  className="min-w-0 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4 text-sm leading-6"
                >
                  <p className="break-words font-semibold text-[color:var(--foreground)]">
                    {entry.patientName}
                  </p>
                  <p className="mt-1 break-words text-[color:var(--muted-foreground)]">
                    {getDepartmentName(entry.departmentId)} - {getDoctorName(entry.doctorId ?? "")}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <StatusBadge status={entry.status as QueueStatus} />
                    <span className="break-words text-[color:var(--muted-foreground)]">
                      Updated {entry.updatedAt}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
