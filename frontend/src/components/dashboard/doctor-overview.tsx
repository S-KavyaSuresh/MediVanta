"use client";

import { ClipboardList, Clock3, Stethoscope, Users } from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentLocalDateIso } from "@/lib/hospital-data";

export function DoctorOverview() {
  const { session } = useAuth();
  const { activeQueueEntries, state } = useHospitalData();
  const doctor = state.doctors.find((item) => item.id === session.user.doctorId);
  const todaysAppointments = state.appointments.filter(
    (appointment) => appointment.appointmentDate === getCurrentLocalDateIso(),
  );
  const nextPatient = [...todaysAppointments].sort((left, right) =>
    left.appointmentTime.localeCompare(right.appointmentTime),
  )[0];

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Doctor Workspace"
        title="Today&apos;s consultations and patient flow"
        description="Review your schedule, assigned patients, and queue activity from one focused clinical workspace."
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's appointments"
          value={String(todaysAppointments.length)}
          delta={doctor?.shiftLabel ?? "Shift not assigned"}
          icon={Stethoscope}
        />
        <StatCard
          label="Active queue"
          value={String(activeQueueEntries.length)}
          delta="Patients currently linked to your queue"
          icon={ClipboardList}
        />
        <StatCard
          label="Next patient"
          value={nextPatient?.patientName ?? "None"}
          delta={nextPatient ? nextPatient.appointmentTime : "No pending visit"}
          icon={Clock3}
        />
        <StatCard
          label="Assigned patients"
          value={String(new Set(todaysAppointments.map((item) => item.patientName)).size)}
          delta="Unique patients on your current schedule"
          icon={Users}
        />
      </div>
      {todaysAppointments.length > 0 ? (
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">Today&apos;s appointment list</h2>
          <div className="space-y-3">
            {todaysAppointments.map((appointment) => (
              <div
                key={appointment.id}
                className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={appointment.status} />
                  <p className="text-sm text-[color:var(--muted-foreground)]">
                    {appointment.appointmentTime}
                  </p>
                </div>
                <p className="mt-3 text-lg font-semibold">{appointment.patientName}</p>
                <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                  {appointment.id}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          title="No appointments assigned today"
          description="Your upcoming consultation schedule will appear here as appointments are assigned."
        />
      )}
    </div>
  );
}
