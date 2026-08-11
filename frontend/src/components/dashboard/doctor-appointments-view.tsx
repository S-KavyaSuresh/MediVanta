"use client";

import { Button } from "@/components/ui/button";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/providers/toast-provider";

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
        description="Review the appointments currently assigned to your doctor account."
      />
      {state.appointments.length > 0 ? (
        <div className="space-y-4">
          {state.appointments.map((appointment) => (
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
              <p className="text-sm text-[color:var(--foreground)]">
                Reason for Appointment: {appointment.reasonForAppointment}
              </p>
              {getDoctorActions(appointment.status).length > 0 ? (
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
                </div>
              ) : null}
            </Card>
          ))}
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
