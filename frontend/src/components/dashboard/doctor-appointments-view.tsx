"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/providers/toast-provider";
import { getTelemedicineJoinAvailability } from "@/lib/hospital-data";

const doctorActionLabels = {
  Cancelled: "Cancel appointment",
  "In consultation": "Start consultation",
  Completed: "Complete consultation",
} as const;

export function DoctorAppointmentsView() {
  const { getDepartmentName, setAppointmentStatus, state } = useHospitalData();
  const { pushToast } = useToast();

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

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Doctor Workspace"
        title="Appointments"
        description="Review the appointments currently assigned to your doctor account, including online consultations."
      />
      {state.appointments.length > 0 ? (
        <div className="space-y-4">
          {state.appointments.map((appointment) => {
            const joinAvailability = getTelemedicineJoinAvailability(appointment);

            return (
            <Card key={appointment.id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={appointment.status} />
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
                {getDoctorActions(appointment.status).map((nextStatus) => (
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
                ))}
                {appointment.consultationMode === "Online" &&
                ["Scheduled", "Checked in", "In consultation"].includes(appointment.status) ? (
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
