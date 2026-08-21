"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/providers/toast-provider";
import { getTelemedicineJoinAvailability, type AppointmentStatus } from "@/lib/hospital-data";

type AppointmentSort = "upcoming" | "newest" | "oldest";

function getAppointmentTimeValue(appointment: {
  appointmentDate: string;
  appointmentTime: string;
}) {
  return new Date(`${appointment.appointmentDate}T${appointment.appointmentTime}:00`).getTime();
}

function isActiveOrUpcomingAppointment(appointment: {
  status: AppointmentStatus;
  appointmentDate: string;
  appointmentTime: string;
}) {
  const effectiveStatus = getEffectiveAppointmentStatus(appointment);

  return (
    effectiveStatus === "Scheduled" ||
    effectiveStatus === "Checked in" ||
    effectiveStatus === "In consultation"
  );
}

function isPastCloseWindow(appointment: {
  appointmentDate: string;
  appointmentTime: string;
}) {
  const appointmentTime = getAppointmentTimeValue(appointment);

  if (Number.isNaN(appointmentTime)) {
    return false;
  }

  return Date.now() > appointmentTime + 30 * 60 * 1000;
}

function getEffectiveAppointmentStatus(appointment: {
  status: AppointmentStatus;
  appointmentDate: string;
  appointmentTime: string;
}): AppointmentStatus {
  if (!isPastCloseWindow(appointment)) {
    return appointment.status;
  }

  if (appointment.status === "Scheduled") {
    return "No Show";
  }

  if (appointment.status === "Checked in" || appointment.status === "In consultation") {
    return "Completed";
  }

  return appointment.status;
}

const doctorActionLabels = {
  Cancelled: "Cancel appointment",
  "In consultation": "Start consultation",
  Completed: "Complete consultation",
} as const;

export function DoctorAppointmentsView() {
  const { getDepartmentName, setAppointmentStatus, state } = useHospitalData();
  const { pushToast } = useToast();
  const [sort, setSort] = useState<AppointmentSort>("upcoming");

  function getDoctorActions(status: (typeof state.appointments)[number]["status"]) {
    switch (status) {
      case "Scheduled":
        return ["Cancelled"] as const;
      case "Checked in":
        return ["In consultation"] as const;
      case "In consultation":
        return ["Completed"] as const;
      default:
        return [] as const;
    }
  }

  const sortedAppointments = useMemo(
    () =>
      [...state.appointments].sort((left, right) => {
        const leftTime = getAppointmentTimeValue(left);
        const rightTime = getAppointmentTimeValue(right);

        if (sort === "upcoming") {
          const leftIsActive = isActiveOrUpcomingAppointment(left);
          const rightIsActive = isActiveOrUpcomingAppointment(right);

          if (leftIsActive !== rightIsActive) {
            return leftIsActive ? -1 : 1;
          }

          return leftTime - rightTime;
        }

        if (sort === "oldest") {
          return leftTime - rightTime;
        }

        return rightTime - leftTime;
      }),
    [sort, state.appointments],
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Doctor Workspace"
        title="Appointments"
        description="Review the appointments currently assigned to your doctor account, including online consultations."
      />
      {sortedAppointments.length > 0 ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Select
              className="w-full sm:w-56"
              value={sort}
              onChange={(event) => setSort(event.target.value as AppointmentSort)}
            >
              <option value="upcoming">Upcoming first</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </Select>
          </div>
          {sortedAppointments.map((appointment) => {
            const joinAvailability = getTelemedicineJoinAvailability(appointment);
            const isExpiredOpenAppointment = isPastCloseWindow(appointment);
            const effectiveStatus = getEffectiveAppointmentStatus(appointment);

            return (
            <Card key={appointment.id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={effectiveStatus} />
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  {appointment.appointmentDate} at {appointment.appointmentTime}
                </p>
              </div>
              <p className="text-lg font-semibold">{appointment.patientName}</p>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                {appointment.id} · {getDepartmentName(appointment.departmentId)}
              </p>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Consultation mode: {appointment.consultationMode ?? "In Person"}
              </p>
              <p className="text-sm text-[color:var(--foreground)]">
                Reason for Appointment: {appointment.reasonForAppointment}
              </p>
              <div className="flex flex-wrap gap-2">
                {!isExpiredOpenAppointment ? getDoctorActions(effectiveStatus).map((nextStatus) => (
                  <Button
                    key={nextStatus}
                    type="button"
                    size="sm"
                    variant={nextStatus === "Cancelled" ? "danger" : "secondary"}
                    onClick={async () => {
                      const result = await setAppointmentStatus(appointment.id, nextStatus);

                      if (result.ok) {
                        pushToast(
                          "Appointment updated",
                          `${appointment.patientName} is now marked as ${nextStatus}.`,
                        );
                        return;
                      }

                      pushToast(
                        "Unable to update appointment",
                        result.message ?? "Please review the appointment and try again.",
                      );
                    }}
                  >
                    {doctorActionLabels[nextStatus]}
                  </Button>
                )) : null}
                {appointment.consultationMode === "Online" &&
                ["Scheduled", "Checked in", "In consultation"].includes(effectiveStatus) ? (
                  joinAvailability.allowed ? (
                    <Link href={`/dashboard/doctor/consultations/${appointment.id}`}>
                      <Button type="button" size="sm">
                        Join Consultation
                      </Button>
                    </Link>
                  ) : (
                    <Button type="button" size="sm" variant="secondary" disabled title={joinAvailability.reason}>
                      {joinAvailability.reason}
                    </Button>
                  )
                ) : null}
              </div>
            </Card>
          );
          })}
        </div>
      ) : (
        <EmptyState
          title="No appointments assigned"
          description="Appointment activity will appear here when your clinical schedule is active."
        />
      )}
    </div>
  );
}
