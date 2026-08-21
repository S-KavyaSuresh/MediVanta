"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/table";
import { useToast } from "@/components/providers/toast-provider";
import type { HospitalState, QueueEntryRecord, QueueStatus } from "@/lib/hospital-data";

type QueueSort = "priority" | "checked-in-oldest" | "checked-in-newest" | "updated-newest" | "status";

const priorityRank = {
  Emergency: 0,
  Priority: 1,
  Normal: 2,
} as const;

const statusRank: Record<QueueStatus, number> = {
  Waiting: 0,
  Called: 1,
  "In consultation": 2,
  Completed: 3,
};

function getTimeValue(value?: string) {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isFinite(hours) && Number.isFinite(minutes)) {
    return hours * 60 + minutes;
  }

  return 0;
}

function formatTimelineValue(value?: string) {
  if (!value) {
    return "Not recorded";
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsed);
  }

  return value;
}

function estimateQueueWait(
  entries: QueueEntryRecord[],
  queueEntry: QueueEntryRecord,
  organization: HospitalState["organization"],
) {
  if (queueEntry.status === "In consultation") {
    return "In consultation now";
  }

  const consultationMinutes =
    organization.defaultConsultationSlotDurationMinutes &&
    organization.defaultConsultationSlotDurationMinutes > 0
      ? organization.defaultConsultationSlotDurationMinutes
      : 20;
  const departmentEntries = entries
    .filter(
      (entry) =>
        entry.departmentId === queueEntry.departmentId &&
        entry.status !== "Completed" &&
        !(entry.status === "In consultation" && entry.id !== queueEntry.id),
    )
    .sort((left, right) => {
      const priorityDelta =
        priorityRank[left.priority ?? "Normal"] - priorityRank[right.priority ?? "Normal"];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return getTimeValue(left.createdAt) - getTimeValue(right.createdAt);
    });
  const index = departmentEntries.findIndex((entry) => entry.id === queueEntry.id);
  const patientsAhead = Math.max(0, index);

  if (patientsAhead === 0) {
    return queueEntry.status === "Called" ? "Ready for consultation" : "Next in queue";
  }

  const entriesAhead = departmentEntries.slice(0, patientsAhead);
  const priorityDelay = entriesAhead.reduce((total, entry) => {
    if (entry.priority === "Emergency") {
      return total + 8;
    }

    if (entry.priority === "Priority") {
      return total + 4;
    }

    return total;
  }, 0);
  const estimatedMinutes = patientsAhead * consultationMinutes + priorityDelay;

  return `About ${estimatedMinutes} min (${patientsAhead} ahead)`;
}

export default function QueueBoardPage() {
  const {
    activeQueueEntries,
    advanceQueue,
    getAllowedQueueStatuses,
    getDepartmentName,
    getDoctorName,
    state,
  } = useHospitalData();
  const { pushToast } = useToast();
  const [sort, setSort] = useState<QueueSort>("priority");
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(1);

  const totals = useMemo(() => {
    return {
      waiting: activeQueueEntries.filter((entry) => entry.status === "Waiting").length,
      called: activeQueueEntries.filter((entry) => entry.status === "Called").length,
      inConsultation: activeQueueEntries.filter(
        (entry) => entry.status === "In consultation",
      ).length,
      emergency: activeQueueEntries.filter((entry) => entry.priority === "Emergency").length,
    };
  }, [activeQueueEntries]);
  const sortedQueueEntries = useMemo(
    () =>
      [...activeQueueEntries].sort((left, right) => {
        if (sort === "checked-in-newest") {
          return getTimeValue(right.createdAt) - getTimeValue(left.createdAt);
        }

        if (sort === "checked-in-oldest") {
          return getTimeValue(left.createdAt) - getTimeValue(right.createdAt);
        }

        if (sort === "updated-newest") {
          return getTimeValue(right.updatedAt) - getTimeValue(left.updatedAt);
        }

        if (sort === "status") {
          const statusDelta = statusRank[left.status] - statusRank[right.status];
          if (statusDelta !== 0) {
            return statusDelta;
          }

          return getTimeValue(left.createdAt) - getTimeValue(right.createdAt);
        }

        const priorityDelta =
          priorityRank[left.priority ?? "Normal"] - priorityRank[right.priority ?? "Normal"];
        if (priorityDelta !== 0) {
          return priorityDelta;
        }

        return getTimeValue(left.createdAt) - getTimeValue(right.createdAt);
      }),
    [activeQueueEntries, sort],
  );
  const pageCount = Math.max(1, Math.ceil(sortedQueueEntries.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paginatedQueueEntries = sortedQueueEntries.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Queue Board"
        title="Patient queue progression across active departments"
        description="Track waiting patients, move them through consultation stages, and keep appointment-linked queue entries synchronized."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Waiting", value: totals.waiting },
          { label: "Called", value: totals.called },
          { label: "In consultation", value: totals.inConsultation },
          { label: "Emergency priority", value: totals.emergency },
        ].map((item) => (
          <Card key={item.label}>
            <p className="text-sm text-[color:var(--muted-foreground)]">{item.label}</p>
            <p className="mt-3 text-3xl font-semibold">{item.value}</p>
          </Card>
        ))}
      </div>

      {activeQueueEntries.length > 0 ? (
        <div className="space-y-4">
          <Card className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">Sort queue</label>
                <select
                  className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm"
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value as QueueSort);
                    setPage(1);
                  }}
                >
                  <option value="priority">Priority first</option>
                  <option value="checked-in-oldest">Checked in oldest first</option>
                  <option value="checked-in-newest">Checked in newest first</option>
                  <option value="updated-newest">Recently updated first</option>
                  <option value="status">Status order</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Rows per page</label>
                <select
                  className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                >
                  <option value={5}>5 rows</option>
                  <option value={10}>10 rows</option>
                  <option value={20}>20 rows</option>
                </select>
              </div>
            </div>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Showing {(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, sortedQueueEntries.length)} of{" "}
              {sortedQueueEntries.length}
            </p>
          </Card>

          <DataTable
            columns={[
              { id: "queue-id", key: "id", header: "Queue ID" },
              { id: "queue-patient", key: "patientName", header: "Patient" },
              {
                id: "queue-department",
                key: "departmentId",
                header: "Department",
                render: (value, row) => (
                  <div className="min-w-0 space-y-1">
                    <p className="break-words font-medium">{getDepartmentName(String(value))}</p>
                    <p className="break-words text-xs text-[color:var(--muted-foreground)]">
                      {row.doctorId ? getDoctorName(row.doctorId) : "Doctor assignment pending"}
                    </p>
                  </div>
                ),
              },
              {
                id: "queue-priority",
                key: "priority",
                header: "Priority",
                render: (value) => (
                  <Badge
                    variant={
                      value === "Emergency"
                        ? "danger"
                        : value === "Priority"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {String(value ?? "Normal")}
                  </Badge>
                ),
              },
              {
                id: "queue-status",
                key: "status",
                header: "Status",
                render: (value) => <StatusBadge status={value as QueueStatus} />,
              },
              {
                id: "queue-estimate",
                key: "id",
                header: "Estimated wait",
                render: (_value, row) =>
                  estimateQueueWait(activeQueueEntries, row, state.organization),
              },
              {
                id: "queue-timeline",
                key: "createdAt",
                header: "Timeline",
                render: (value, row) =>
                  `Checked in ${formatTimelineValue(String(value))} - Updated ${formatTimelineValue(row.updatedAt)}`,
              },
              {
                id: "queue-actions",
                key: "id",
                header: "Next step",
                render: (_value, row) => (
                  <div className="flex flex-wrap gap-2">
                    {getAllowedQueueStatuses(row.status).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const result = await advanceQueue(row.id, status);
                          if (result.ok) {
                            pushToast(
                              "Queue updated",
                              `${row.patientName} moved to ${status}.`,
                            );
                            return;
                          }

                          pushToast(
                            "Unable to update queue",
                            result.message ??
                              "Please review the queue status and try again.",
                          );
                        }}
                      >
                        {status}
                      </Button>
                    ))}
                  </div>
                ),
              },
            ]}
            rows={paginatedQueueEntries}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Page {safePage} of {pageCount}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={safePage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={safePage >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No active queue entries"
          description="Appointments checked in from the scheduling workflow will appear here automatically."
        />
      )}
    </div>
  );
}
