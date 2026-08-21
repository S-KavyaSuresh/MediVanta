"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Clock3, Stethoscope, Users } from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { apiRequest } from "@/lib/api";
import { getCurrentLocalDateIso } from "@/lib/hospital-data";

export function DoctorOverview() {
  const { session } = useAuth();
  const { activeQueueEntries, state } = useHospitalData();
  const [ratingSummary, setRatingSummary] = useState<{
    averageRating: number | null;
    ratingCount: number;
  }>({ averageRating: null, ratingCount: 0 });
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
  const doctorAppointments = state.appointments.filter(
    (appointment) => appointment.doctorId === session.user.doctorId,
  );
  const doctorPrescriptions = state.prescriptions.filter(
    (prescription) => prescription.doctorId === session.user.doctorId,
  );
  const doctorPendingLabFollowUps = state.labRequests.filter(
    (request) =>
      request.orderedByUserId === session.user.id &&
      request.status !== "Completed",
  ).length;
  const uniquePatientsTreated = new Set(
    doctorAppointments
      .filter((appointment) => appointment.status === "Completed")
      .map((appointment) => appointment.familyMemberId ?? appointment.patientId ?? appointment.patientName),
  ).size;
  const completedConsultations = doctorAppointments.filter(
    (appointment) => appointment.status === "Completed",
  ).length;

  useEffect(() => {
    let active = true;

    const loadRatingSummary = async () => {
      if (!session.user.doctorId) {
        return;
      }
      try {
        const response = await apiRequest<{
          averageRating: number | null;
          ratingCount: number;
        }>(`/api/hospital/doctors/${session.user.doctorId}/rating-summary`);
        if (active) {
          setRatingSummary({
            averageRating: response.averageRating,
            ratingCount: response.ratingCount,
          });
        }
      } catch {
        if (active) {
          setRatingSummary({ averageRating: null, ratingCount: 0 });
        }
      }
    };

    void loadRatingSummary();

    return () => {
      active = false;
    };
  }, [session.user.doctorId]);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Doctor Workspace"
        title="Today&apos;s consultations and patient flow"
        description="Review your schedule, assigned patients, and queue activity from one focused clinical workspace."
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
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
        <StatCard
          label="Doctor rating"
          value={
            ratingSummary.averageRating !== null
              ? `${ratingSummary.averageRating.toFixed(1)}/5`
              : "Not yet rated"
          }
          delta={
            ratingSummary.ratingCount > 0
              ? `${ratingSummary.ratingCount} patient rating${ratingSummary.ratingCount === 1 ? "" : "s"}`
              : "No completed patient ratings yet"
          }
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

      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">Patient statistics</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Unique patients treated", uniquePatientsTreated],
            ["Completed consultations", completedConsultations],
            ["Prescriptions issued", doctorPrescriptions.length],
            ["Pending lab follow-ups", doctorPendingLabFollowUps],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3"
            >
              <p className="text-sm text-[color:var(--muted-foreground)]">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
