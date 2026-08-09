"use client";

import { useMemo } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/table";
import { useToast } from "@/components/providers/toast-provider";
import type { QueueStatus } from "@/lib/hospital-data";

export default function QueueBoardPage() {
  const {
    activeQueueEntries,
    advanceQueue,
    getAllowedQueueStatuses,
    getDepartmentName,
    getDoctorName,
  } = useHospitalData();
  const { pushToast } = useToast();

  const totals = useMemo(() => {
    return {
      waiting: activeQueueEntries.filter((entry) => entry.status === "Waiting").length,
      called: activeQueueEntries.filter((entry) => entry.status === "Called").length,
      inConsultation: activeQueueEntries.filter(
        (entry) => entry.status === "In consultation",
      ).length,
    };
  }, [activeQueueEntries]);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Queue Board"
        title="Patient queue progression across active departments"
        description="Track waiting patients, move them through consultation stages, and keep appointment-linked queue entries synchronized."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Waiting", value: totals.waiting },
          { label: "Called", value: totals.called },
          { label: "In consultation", value: totals.inConsultation },
        ].map((item) => (
          <Card key={item.label}>
            <p className="text-sm text-[color:var(--muted-foreground)]">{item.label}</p>
            <p className="mt-3 text-3xl font-semibold">{item.value}</p>
          </Card>
        ))}
      </div>

      {activeQueueEntries.length > 0 ? (
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
              id: "queue-status",
              key: "status",
              header: "Status",
              render: (value) => <StatusBadge status={value as QueueStatus} />,
            },
            {
              id: "queue-timeline",
              key: "createdAt",
              header: "Timeline",
              render: (value, row) => `Checked in ${String(value)} - Updated ${row.updatedAt}`,
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
                      onClick={() => {
                        const result = advanceQueue(row.id, status);
                        if (result.ok) {
                          pushToast(
                            "Queue updated",
                            `${row.patientName} moved to ${status}.`,
                          );
                        }
                      }}
                    >
                      {status}
                    </Button>
                  ))}
                </div>
              ),
            },
          ]}
          rows={activeQueueEntries}
        />
      ) : (
        <EmptyState
          title="No active queue entries"
          description="Appointments checked in from the scheduling workflow will appear here automatically."
        />
      )}
    </div>
  );
}
