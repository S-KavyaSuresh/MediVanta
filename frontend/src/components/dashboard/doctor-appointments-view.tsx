"use client";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function DoctorAppointmentsView() {
  const { state } = useHospitalData();

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
              <p className="text-sm text-[color:var(--muted-foreground)]">{appointment.id}</p>
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
