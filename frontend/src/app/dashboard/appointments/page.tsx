"use client";

import { useMemo, useState } from "react";

import { AppointmentFormModal } from "@/components/dashboard/appointment-form-modal";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { DataTable } from "@/components/ui/table";
import { useToast } from "@/components/providers/toast-provider";
import {
  getCurrentLocalDateIso,
  getDoctorCapacityStatus,
  type AppointmentRecord,
  type AppointmentStatus,
} from "@/lib/hospital-data";

const actionLabels: Partial<Record<AppointmentStatus, string>> = {
  Cancelled: "Cancel",
};

type AppointmentTableColumn = {
  id: string;
  key: keyof AppointmentRecord;
  header: string;
  render?: (value: AppointmentRecord[keyof AppointmentRecord], row: AppointmentRecord) => React.ReactNode;
};

function formatCapacityDetail(label: string, detail: string) {
  const sessionLabel = detail.split(" ")[0] ?? label;
  const ratio = detail.match(/(\d+\/\d+)/)?.[1];
  return ratio ? `${sessionLabel} · ${ratio} booked` : `${label} · ${detail}`;
}

export default function AppointmentsPage() {
  const { session } = useAuth();
  const {
    createAppointment,
    getAllowedAppointmentStatuses,
    getDepartmentName,
    getDoctorName,
    meta,
    setAppointmentStatus,
    state,
    updateAppointment,
  } = useHospitalData();
  const { pushToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const isAdmin = session.user.role === "administrator";
  const isReceptionist = session.user.role === "receptionist";

  const appointments = useMemo(
    () =>
      [...state.appointments]
        .filter((appointment) => (statusFilter === "all" ? true : appointment.status === statusFilter))
        .sort((left, right) => {
          const leftKey = `${left.appointmentDate}T${left.appointmentTime}`;
          const rightKey = `${right.appointmentDate}T${right.appointmentTime}`;
          const today = getCurrentLocalDateIso();
          const leftIsUpcoming = left.appointmentDate >= today && left.status !== "Completed" && left.status !== "Cancelled";
          const rightIsUpcoming = right.appointmentDate >= today && right.status !== "Completed" && right.status !== "Cancelled";

          if (leftIsUpcoming !== rightIsUpcoming) {
            return leftIsUpcoming ? -1 : 1;
          }

          return leftIsUpcoming
            ? leftKey.localeCompare(rightKey)
            : rightKey.localeCompare(leftKey);
        }),
    [state.appointments, statusFilter],
  );

  const editingAppointment =
    state.appointments.find((appointment) => appointment.id === editingId) ?? null;

  const columns = useMemo(() => {
    const baseColumns: AppointmentTableColumn[] = [
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
        render: (value, row) => {
          const capacity = getDoctorCapacityStatus(
            state,
            row.doctorId,
            String(value),
            row.appointmentTime,
            row.id,
          );

          return (
            <div className="space-y-1">
              <p>
                {String(value)} at {row.appointmentTime}
              </p>
              <p className="text-xs text-[color:var(--muted-foreground)]">
                {formatCapacityDetail(capacity.label, capacity.detail)}
              </p>
            </div>
          );
        },
      },
      {
        id: "appointment-reason",
        key: "reasonForAppointment",
        header: "Reason for Appointment",
        render: (value) => (
          <p className="max-w-xs whitespace-pre-wrap text-sm text-[color:var(--muted-foreground)]">
            {String(value)}
          </p>
        ),
      },
      {
        id: "appointment-status",
        key: "status",
        header: "Status",
        render: (value) => <StatusBadge status={value as AppointmentStatus} />,
      },
    ];

    if (isAdmin) {
      return baseColumns;
    }

    const actionColumn: AppointmentTableColumn = {
      id: "appointment-actions",
      key: "id",
      header: "Actions",
      render: (_value: AppointmentRecord["id"] | undefined, row: AppointmentRecord) => {
        const allowedStatuses = getAllowedAppointmentStatuses(row.status).filter((status) =>
          isReceptionist ? status === "Checked in" || status === "Cancelled" : true,
        );

        return (
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
            {allowedStatuses.map((status) => (
              <Button
                key={status}
                size="sm"
                variant={status === "Cancelled" ? "danger" : "secondary"}
                className="min-w-[5rem] justify-center"
                onClick={async () => {
                  const result = await setAppointmentStatus(row.id, status);
                  if (result.ok) {
                    pushToast("Appointment updated", `${row.patientName} is now marked as ${status}.`);
                    return;
                  }

                  pushToast(
                    "Unable to update appointment",
                    result.message ?? "Please review the appointment details and try again.",
                  );
                }}
              >
                {actionLabels[status] ?? status}
              </Button>
            ))}
          </div>
        );
      },
    };

    return [
      ...baseColumns,
      actionColumn,
    ];
  }, [
    getAllowedAppointmentStatuses,
    getDepartmentName,
    getDoctorName,
    isAdmin,
    isReceptionist,
    pushToast,
    setAppointmentStatus,
    state,
  ]);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Appointments"
        title="Appointment scheduling and check-in workflow"
        description="Create, update, check in, complete, or cancel appointments while keeping doctors, departments, and queues aligned."
        action={
          isAdmin ? null : (
            <Button
              onClick={() => {
                setEditingId(null);
                setModalOpen(true);
              }}
            >
              Create appointment
            </Button>
          )
        }
      />

      <div className="max-w-xs">
        <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          {["Scheduled", "Checked in", "In consultation", "Completed", "Cancelled"].map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
      </div>

      {appointments.length > 0 ? (
        <DataTable
          columns={columns}
          rows={appointments}
        />
      ) : (
        <EmptyState
          title="No appointments match this view"
          description="Create a new appointment or adjust the filter to view other scheduled records."
        />
      )}

      {!isAdmin ? (
        <AppointmentFormModal
          key={`${editingId ?? "new"}-${modalOpen ? "open" : "closed"}`}
          open={modalOpen}
          organizationName={state.organization.name}
          bookingCapacity={state.bookingCapacity}
          appointmentSlotLoads={meta?.appointmentSlotLoads ?? []}
          departments={state.departments}
          doctors={state.doctors.filter((doctor) => doctor.status !== "Off duty")}
          appointments={state.appointments}
          initialAppointment={editingAppointment}
          onClose={() => {
            setModalOpen(false);
            setEditingId(null);
          }}
          onSubmit={(draft) =>
            editingAppointment ? updateAppointment(editingAppointment.id, draft) : createAppointment(draft)
          }
        />
      ) : null}
    </div>
  );
}
