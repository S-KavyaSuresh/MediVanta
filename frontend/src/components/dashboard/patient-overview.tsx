"use client";

import { Bell, CalendarClock, FileHeart, ReceiptText } from "lucide-react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";

export function PatientOverview() {
  const { getDepartmentName, getDoctorName, state } = useHospitalData();
  const appointments = [...state.appointments].sort((left, right) =>
    `${left.appointmentDate}${left.appointmentTime}`.localeCompare(
      `${right.appointmentDate}${right.appointmentTime}`,
    ),
  );
  const upcomingAppointment = appointments.find(
    (appointment) => appointment.status !== "Completed" && appointment.status !== "Cancelled",
  );
  const activeQueueEntry = upcomingAppointment
    ? state.queueEntries.find((entry) => entry.appointmentId === upcomingAppointment.id)
    : undefined;
  const issuedPrescriptionCount = state.prescriptions.filter(
    (prescription) => prescription.status === "Issued",
  ).length;
  const outstandingBilling = state.invoices.reduce(
    (sum, invoice) => sum + invoice.amountDueCents,
    0,
  );
  const activeFamilyMemberName = upcomingAppointment?.familyMemberId
    ? state.familyMembers?.find((member) => member.id === upcomingAppointment.familyMemberId)?.fullName
    : null;

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Patient Dashboard"
        title="Your appointments, records, and hospital updates"
        description="Keep track of your upcoming visit, care documents, and the latest progress connected to your account."
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Upcoming appointments"
          value={String(
            appointments.filter((appointment) => appointment.status === "Scheduled").length,
          )}
          delta={upcomingAppointment ? upcomingAppointment.id : "No scheduled visit"}
          icon={CalendarClock}
        />
        <StatCard
          label="Active visit status"
          value={activeQueueEntry ? activeQueueEntry.status : "None"}
          delta={activeQueueEntry ? `Queue ${activeQueueEntry.id}` : "No active queue"}
          icon={Bell}
        />
        <StatCard
          label="Health records"
          value={String(state.medicalRecords.length)}
          delta={
            issuedPrescriptionCount > 0
              ? `${issuedPrescriptionCount} issued prescription${issuedPrescriptionCount === 1 ? "" : "s"}`
              : "No active prescriptions"
          }
          icon={FileHeart}
        />
        <StatCard
          label="Billing"
          value={new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 2,
          }).format(outstandingBilling / 100)}
          delta={
            outstandingBilling > 0
              ? "Outstanding balance across your invoices"
              : "No outstanding invoice balance"
          }
          icon={ReceiptText}
        />
      </div>
      {upcomingAppointment ? (
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">Next appointment</h2>
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={upcomingAppointment.status} />
              <p className="text-sm text-[color:var(--muted-foreground)]">
                {upcomingAppointment.appointmentDate} at {upcomingAppointment.appointmentTime}
              </p>
            </div>
            <p className="mt-3 text-lg font-semibold">
              {getDoctorName(upcomingAppointment.doctorId)}
            </p>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              {getDepartmentName(upcomingAppointment.departmentId)}
            </p>
            {activeFamilyMemberName ? (
              <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">
                Appointment for {activeFamilyMemberName}
              </p>
            ) : null}
            {activeQueueEntry ? (
              <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">
                Queue status: {activeQueueEntry.status} ({activeQueueEntry.id})
              </p>
            ) : null}
          </div>
        </Card>
      ) : (
        <EmptyState
          title="No appointments linked to this account"
          description="When a visit is scheduled for you, appointment details and related updates will appear here."
        />
      )}
    </div>
  );
}
