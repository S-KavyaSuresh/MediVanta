"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AppointmentFormModal } from "@/components/dashboard/appointment-form-modal";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/providers/toast-provider";
import { apiRequest } from "@/lib/api";
import type { DoctorRatingRecord } from "@/lib/hospital-data";
import { comparePatientAppointments, getTelemedicineJoinAvailability } from "@/lib/hospital-data";

export function PatientAppointmentsView() {
  const { session } = useAuth();
  const { pushToast } = useToast();
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
  const [ratings, setRatings] = useState<Record<string, DoctorRatingRecord>>({});
  const [ratingAppointmentId, setRatingAppointmentId] = useState<string | null>(null);
  const [ratingValue, setRatingValue] = useState("5");
  const [ratingComment, setRatingComment] = useState("");

  const editingAppointment =
    state.appointments.find((appointment) => appointment.id === editingId) ?? null;
  const now = new Date();
  const activeRating = ratingAppointmentId ? ratings[ratingAppointmentId] : undefined;

  useEffect(() => {
    let active = true;

    const loadRatings = async () => {
      try {
        const response = await apiRequest<{ ratings: DoctorRatingRecord[] }>("/api/hospital/doctor-ratings/mine");
        if (!active) {
          return;
        }
        setRatings(
          Object.fromEntries(response.ratings.map((rating) => [rating.appointmentId, rating])),
        );
      } catch {
        if (active) {
          setRatings({});
        }
      }
    };

    void loadRatings();

    return () => {
      active = false;
    };
  }, []);

  const sortedAppointments = [...state.appointments].sort((left, right) =>
    comparePatientAppointments(left, right, now),
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Appointments"
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
      {sortedAppointments.length > 0 ? (
        <div className="space-y-4">
          {sortedAppointments.map((appointment) => {
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
              {appointment.status === "Completed" ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                  <div>
                    <p className="text-sm font-semibold">
                      {ratings[appointment.id]
                        ? `Your rating: ${ratings[appointment.id].rating}/5`
                        : "Rate this doctor"}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      Share a brief review after a completed consultation.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setRatingAppointmentId(appointment.id);
                      setRatingValue(String(ratings[appointment.id]?.rating ?? 5));
                      setRatingComment(ratings[appointment.id]?.reviewComment ?? "");
                    }}
                  >
                    {ratings[appointment.id] ? "Edit Rating" : "Rate Doctor"}
                  </Button>
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
      <Modal
        open={Boolean(ratingAppointmentId)}
        onClose={() => {
          setRatingAppointmentId(null);
          setRatingValue("5");
          setRatingComment("");
        }}
        title="Rate doctor"
        description="Ratings are available after a completed appointment and are saved per appointment."
      >
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!ratingAppointmentId) {
              return;
            }
            try {
              const response = await apiRequest<{
                rating: DoctorRatingRecord;
              }>("/api/hospital/doctor-ratings", {
                method: "POST",
                body: JSON.stringify({
                  appointmentId: ratingAppointmentId,
                  rating: Number(ratingValue),
                  reviewComment: ratingComment || undefined,
                }),
              });
              setRatings((current) => ({
                ...current,
                [response.rating.appointmentId]: response.rating,
              }));
              pushToast("Rating saved", "Your doctor rating has been recorded.");
              setRatingAppointmentId(null);
              setRatingValue("5");
              setRatingComment("");
            } catch (submitError) {
              pushToast(
                "Unable to save rating",
                submitError instanceof Error ? submitError.message : "Please review the rating details.",
              );
            }
          }}
        >
          <div>
            <label className="mb-2 block text-sm font-medium">Rating</label>
            <Input
              type="number"
              min="1"
              max="5"
              value={ratingValue}
              onChange={(event) => setRatingValue(event.target.value)}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Review</label>
            <Input
              value={ratingComment}
              onChange={(event) => setRatingComment(event.target.value)}
              placeholder="Optional review"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit">{activeRating ? "Save changes" : "Submit rating"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
