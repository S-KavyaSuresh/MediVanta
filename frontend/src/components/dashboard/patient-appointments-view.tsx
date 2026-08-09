"use client";

import { useState } from "react";

import { AppointmentFormModal } from "@/components/dashboard/appointment-form-modal";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function PatientAppointmentsView() {
  const { session } = useAuth();
  const {
    createAppointment,
    getDepartmentName,
    getDoctorName,
    setAppointmentStatus,
    state,
  } = useHospitalData();
  const [open, setOpen] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Patient Dashboard"
        title="My Appointments"
        description="Review scheduled visits, book a new appointment, and cancel a booking when it is still valid."
        action={
          <Button type="button" onClick={() => setOpen(true)}>
            Book Appointment
          </Button>
        }
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
              <p className="text-lg font-semibold">{getDoctorName(appointment.doctorId)}</p>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                {getDepartmentName(appointment.departmentId)} · {appointment.id}
              </p>
              {appointment.status === "Scheduled" ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={submittingId === appointment.id}
                    onClick={async () => {
                      setSubmittingId(appointment.id);
                      await setAppointmentStatus(appointment.id, "Cancelled");
                      setSubmittingId(null);
                    }}
                  >
                    {submittingId === appointment.id ? "Cancelling..." : "Cancel appointment"}
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No appointments available"
          description="Book your first appointment to see upcoming visits linked to your account."
        />
      )}
      <AppointmentFormModal
        key={`patient-booking-${open ? "open" : "closed"}`}
        open={open}
        organizationName={state.organization.name}
        departments={state.departments.filter((department) => department.id !== "dept-laboratory")}
        doctors={state.doctors.filter((doctor) => doctor.departmentId !== "dept-laboratory")}
        appointments={state.appointments}
        patientMode
        patientName={session.user.patientName ?? session.user.displayName}
        onClose={() => setOpen(false)}
        onSubmit={(draft) =>
          createAppointment({
            ...draft,
            patientName: session.user.patientName ?? session.user.displayName,
          })
        }
      />
    </div>
  );
}
