"use client";

import { useMemo, useState } from "react";

import { AppointmentFormModal } from "@/components/dashboard/appointment-form-modal";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { DataTable } from "@/components/ui/table";
import { useToast } from "@/components/providers/toast-provider";
import type { AppointmentStatus } from "@/lib/hospital-data";

const actionLabels: Partial<Record<AppointmentStatus, string>> = {
  Cancelled: "Cancel",
};

export default function AppointmentsPage() {
  const {
    createAppointment,
    getAllowedAppointmentStatuses,
    getDepartmentName,
    getDoctorName,
    setAppointmentStatus,
    state,
    updateAppointment,
  } = useHospitalData();
  const { pushToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const appointments = useMemo(() => {
    return state.appointments.filter((appointment) =>
      statusFilter === "all" ? true : appointment.status === statusFilter,
    );
  }, [state.appointments, statusFilter]);

  const editingAppointment =
    state.appointments.find((appointment) => appointment.id === editingId) ?? null;

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Appointments"
        title="Appointment scheduling and check-in workflow"
        description="Create, update, check in, complete, or cancel appointments while keeping doctors, departments, and queues aligned."
        action={
          <Button
            onClick={() => {
              setEditingId(null);
              setModalOpen(true);
            }}
          >
            Create appointment
          </Button>
        }
      />

      <div className="max-w-xs">
        <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          {[
            "Scheduled",
            "Checked in",
            "In consultation",
            "Completed",
            "Cancelled",
          ].map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
      </div>

      {appointments.length > 0 ? (
        <DataTable
          columns={[
            { id: "appointment-id", key: "id", header: "Appointment ID" },
            { id: "patient-name", key: "patientName", header: "Patient" },
            {
              id: "doctor-details",
              key: "doctorId",
              header: "Doctor",
              render: (value, row) => (
                <div className="min-w-0 space-y-1">
                  <p className="break-words font-medium">{getDoctorName(String(value))}</p>
                  <p className="break-words text-xs text-[color:var(--muted-foreground)]">
                    {getDepartmentName(row.departmentId)}
                  </p>
                </div>
              ),
            },
            {
              id: "schedule",
              key: "appointmentDate",
              header: "Schedule",
              render: (value, row) => `${String(value)} at ${row.appointmentTime}`,
            },
            {
              id: "appointment-status",
              key: "status",
              header: "Status",
              render: (value) => <StatusBadge status={value as AppointmentStatus} />,
            },
            {
              id: "appointment-actions",
              key: "id",
              header: "Actions",
              render: (_value, row) => (
                <div className="flex flex-wrap items-center gap-2">
                  {(row.status === "Scheduled" || row.status === "Checked in") && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="min-w-[5rem] justify-center"
                      onClick={() => {
                        setEditingId(row.id);
                        setModalOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                  )}
                  {getAllowedAppointmentStatuses(row.status).map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={status === "Cancelled" ? "danger" : "secondary"}
                      className="min-w-[5rem] justify-center"
                      onClick={async () => {
                        const result = await setAppointmentStatus(row.id, status);
                        if (result.ok) {
                          pushToast(
                            "Appointment updated",
                            `${row.patientName} is now marked as ${status}.`,
                          );
                          return;
                        }

                        pushToast(
                          "Unable to update appointment",
                          result.message ??
                            "Please review the appointment details and try again.",
                        );
                      }}
                    >
                      {actionLabels[status] ?? status}
                    </Button>
                  ))}
                </div>
              ),
            },
          ]}
          rows={appointments}
        />
      ) : (
        <EmptyState
          title="No appointments match this view"
          description="Create a new appointment or adjust the filter to view other scheduled records."
        />
      )}

      <AppointmentFormModal
        key={`${editingId ?? "new"}-${modalOpen ? "open" : "closed"}`}
        open={modalOpen}
        organizationName={state.organization.name}
        departments={state.departments}
        doctors={state.doctors.filter((doctor) => doctor.status !== "Off duty")}
        appointments={state.appointments}
        initialAppointment={editingAppointment}
        onClose={() => {
          setModalOpen(false);
          setEditingId(null);
        }}
        onSubmit={(draft) =>
          editingAppointment
            ? updateAppointment(editingAppointment.id, draft)
            : createAppointment(draft)
        }
      />
    </div>
  );
}
