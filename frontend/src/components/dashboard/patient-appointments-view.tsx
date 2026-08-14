"use client";

import Link from "next/link";
import { useState } from "react";

import { AppointmentFormModal } from "@/components/dashboard/appointment-form-modal";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getTelemedicineJoinAvailability, sortPatientAppointments } from "@/lib/hospital-data";

export function PatientAppointmentsView() {
  const { session } = useAuth();
  const {
    createAppointment,
    getDepartmentName,
    getDoctorName,
    meta,
    setAppointmentStatus,
    state,
    updateAppointment,
  } = useHospitalData();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const editingAppointment =
    state.appointments.find((appointment) => appointment.id === editingId) ?? null;
  const now = new Date();
  const orderedAppointments = sortPatientAppointments(state.appointments);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="My Dashboard"
        title="My Appointments"
        description="Review scheduled visits, reschedule eligible bookings, and join your online consultations from one place."
        action={
          <Button
            type="button"
            onClick={() => {
              setEditingId(null);
              setOpen(true);
            }}
          >
            Book Appointment
          </Button>
        }
      />
      {orderedAppointments.length > 0 ? (
        <div className="space-y-4">
          {orderedAppointments.map((appointment) => {
            const joinAvailability = getTelemedicineJoinAvailability(appointment);
            const canManageAppointment =
              appointment.status === "Scheduled" &&
              appointment.appointmentDate >=
                `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}` &&
              new Date(`${appointment.appointmentDate}T${appointment.appointmentTime}:00`).getTime() >
                now.getTime();

            return (
              <Card key={appointment.id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={appointment.status} />
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  {appointment.appointmentDate} at {appointment.appointmentTime}
                </p>
              </div>
              <p className="text-lg font-semibold">{getDoctorName(appointment.doctorId)}</p>
              {appointment.familyMemberId ? (
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  Appointment for{" "}
                  {state.familyMembers?.find((member) => member.id === appointment.familyMemberId)
                    ?.fullName ?? appointment.patientName}
                </p>
              ) : null}
              <p className="text-sm text-[color:var(--muted-foreground)]">
                {getDepartmentName(appointment.departmentId)} · {appointment.id}
              </p>
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Consultation mode: {appointment.consultationMode ?? "In Person"}
              </p>
              {canManageAppointment ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditingId(appointment.id);
                      setOpen(true);
                    }}
                  >
                    Reschedule appointment
                  </Button>
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
                  {appointment.consultationMode === "Online" ? (
                    joinAvailability.allowed ? (
                      <Link href={`/dashboard/patient/consultations/${appointment.id}`}>
                        <Button type="button">Join Consultation</Button>
                      </Link>
                    ) : (
                      <Button type="button" variant="secondary" disabled title={joinAvailability.reason}>
                        {joinAvailability.reason}
                      </Button>
                    )
                  ) : null}
                </div>
              ) : null}
              {appointment.consultationMode === "Online" &&
              appointment.status === "In consultation" ? (
                <div className="flex justify-end">
                  <Link href={`/dashboard/patient/consultations/${appointment.id}`}>
                    <Button type="button">Rejoin Consultation</Button>
                  </Link>
                </div>
              ) : null}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No appointments available"
          description="Book your first appointment to see upcoming visits linked to your account."
        />
      )}
      <AppointmentFormModal
        key={`patient-booking-${editingId ?? "new"}-${open ? "open" : "closed"}`}
        open={open}
        organizationName={state.organization.name}
        bookingCapacity={state.bookingCapacity}
        appointmentSlotLoads={meta?.appointmentSlotLoads ?? []}
        departments={state.departments.filter((department) => department.id !== "dept-laboratory")}
        doctors={state.doctors.filter((doctor) => doctor.departmentId !== "dept-laboratory")}
        appointments={state.appointments}
        initialAppointment={editingAppointment}
        patientMode
        patientName={session.user.patientName ?? session.user.displayName}
        familyMembers={state.familyMembers}
        doctorProfiles={meta?.doctorProfiles ?? []}
        onClose={() => {
          setOpen(false);
          setEditingId(null);
        }}
        onSubmit={(draft) =>
          editingAppointment
            ? updateAppointment(editingAppointment.id, {
                ...draft,
                patientName: session.user.patientName ?? session.user.displayName,
              })
            : createAppointment({
                ...draft,
                patientName: session.user.patientName ?? session.user.displayName,
              })
        }
      />
    </div>
  );
}
