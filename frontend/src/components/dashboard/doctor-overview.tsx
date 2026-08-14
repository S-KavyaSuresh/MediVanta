"use client";

import { useState } from "react";
import { ClipboardList, Clock3, Stethoscope, Users } from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { useToast } from "@/components/providers/toast-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentLocalDateIso } from "@/lib/hospital-data";
import type { DoctorRecord } from "@/lib/hospital-data";

const SELF_MANAGED_STATUSES = ["Available", "On break", "Off duty"] as const;

function DoctorStatusControl({ doctor }: { doctor: DoctorRecord }) {
  const { setDoctorStatus } = useHospitalData();
  const { pushToast } = useToast();
  const [updating, setUpdating] = useState(false);
  const isAutomaticStatus = !SELF_MANAGED_STATUSES.includes(
    doctor.status as (typeof SELF_MANAGED_STATUSES)[number],
  );
  const selectedValue = isAutomaticStatus ? "Available" : doctor.status;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {isAutomaticStatus ? <StatusBadge status={doctor.status} /> : null}
      <div className="w-44">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
          Your status
        </label>
        <Select
          value={selectedValue}
          disabled={updating}
          onChange={async (event) => {
            const nextStatus = event.target.value as (typeof SELF_MANAGED_STATUSES)[number];
            setUpdating(true);
            const result = await setDoctorStatus(doctor.id, nextStatus);
            setUpdating(false);

            if (!result.ok) {
              pushToast("Unable to update status", result.message ?? "Please try again.");
              return;
            }

            pushToast("Status updated", `You are now marked as ${nextStatus}.`);
          }}
        >
          {SELF_MANAGED_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

export function DoctorOverview() {
  const { session } = useAuth();
  const { activeQueueEntries, state } = useHospitalData();
  const doctor = state.doctors.find((item) => item.id === session.user.doctorId);
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const todaysAppointments = state.appointments.filter(
    (appointment) =>
      appointment.doctorId === session.user.doctorId &&
      appointment.appointmentDate === getCurrentLocalDateIso(),
  );
  const nextPatient = [...todaysAppointments]
    .filter((appointment) =>
      appointment.status === "In consultation" ||
      appointment.status === "Checked in" ||
      (appointment.status === "Scheduled" &&
        (() => {
          const [hours, minutes] = appointment.appointmentTime.split(":").map(Number);
          return hours * 60 + minutes >= currentMinutes;
        })()),
    )
    .sort((left, right) =>
      left.appointmentTime.localeCompare(right.appointmentTime),
    )[0];

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="Doctor Workspace"
          title="Today&apos;s consultations and patient flow"
          description="Review your schedule, assigned patients, and queue activity from one focused clinical workspace."
        />
        {doctor ? <DoctorStatusControl doctor={doctor} /> : null}
      </div>
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
