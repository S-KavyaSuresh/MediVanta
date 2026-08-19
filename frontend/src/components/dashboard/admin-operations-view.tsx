"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/dashboard/status-badge";

const queuePriorities = ["Normal", "Priority", "Emergency"] as const;

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AdminOperationsView() {
  const {
    getDepartmentName,
    getDoctorName,
    state,
    updateQueuePriority,
  } = useHospitalData();
  const { pushToast } = useToast();
  const [priorityUpdatingId, setPriorityUpdatingId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<"All" | "Priority" | "Emergency">("All");
  const [statusFilter, setStatusFilter] = useState<
    "All" | "Active" | "In consultation" | "Transferred" | "Completed"
  >("All");
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);

  const emergencyQueue = useMemo(
    () =>
      state.queueEntries.filter(
        (entry) =>
          entry.priority === "Emergency" ||
          entry.priority === "Priority" ||
          entry.departmentId === "dept-emergency",
      ),
    [state.queueEntries],
  );

  const recentEmergencyVisits = useMemo(
    () =>
      [...(state.emergencyVisits ?? [])]
        .filter((visit) => severityFilter === "All" || visit.severity === severityFilter)
        .filter((visit) => statusFilter === "All" || visit.status === statusFilter)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 5),
    [severityFilter, state.emergencyVisits, statusFilter],
  );

  const selectedVisit =
    (state.emergencyVisits ?? []).find((visit) => visit.id === selectedVisitId) ?? null;
  const queueById = useMemo(
    () => new Map(state.queueEntries.map((entry) => [entry.id, entry] as const)),
    [state.queueEntries],
  );

  return (
    <>
      <div className="space-y-6 md:space-y-8">
        <PageHeader
          eyebrow="Administration"
          title="Hospital Operations"
          description="Monitor emergency activity, review priority queue movement, and keep operational readiness visible across the hospital."
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="self-start space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Priority Queue Oversight</h2>
                <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                  Review active emergency and priority queue items without using the front-desk intake workflow.
                </p>
              </div>
            </div>

            {emergencyQueue.length > 0 ? (
              <div className="space-y-3">
                {emergencyQueue.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={entry.status} />
                          <Badge
                            variant={
                              entry.priority === "Emergency"
                                ? "danger"
                                : entry.priority === "Priority"
                                  ? "warning"
                                  : "neutral"
                            }
                          >
                            {entry.priority ?? "Normal"}
                          </Badge>
                        </div>
                        <p className="mt-3 text-lg font-semibold">{entry.patientName}</p>
                        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                          {getDepartmentName(entry.departmentId)} ·{" "}
                          {entry.doctorId
                            ? getDoctorName(entry.doctorId)
                            : "Doctor assignment pending"}
                        </p>
                      </div>
                      <div className="w-full max-w-[13rem]">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                          Queue priority
                        </label>
                        <Select
                          value={entry.priority ?? "Normal"}
                          onChange={async (event) => {
                            setPriorityUpdatingId(entry.id);
                            const result = await updateQueuePriority(
                              entry.id,
                              event.target.value as (typeof queuePriorities)[number],
                            );
                            setPriorityUpdatingId(null);

                            if (!result.ok) {
                              pushToast(
                                "Unable to change priority",
                                result.message ?? "Please try again.",
                              );
                              return;
                            }

                            pushToast(
                              "Priority updated",
                              `${entry.patientName} was updated to ${event.target.value}.`,
                            );
                          }}
                          disabled={priorityUpdatingId === entry.id}
                        >
                          {queuePriorities.map((priority) => (
                            <option key={priority} value={priority}>
                              {priority}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No active priority queue items"
                description="Emergency and priority visits will appear here as operational staff initiate them."
              />
            )}
          </Card>

          <Card className="self-start space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Recent Emergency Activity</h2>
                <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                  Review only the latest relevant emergency cases here. Full emergency history is available on a dedicated page.
                </p>
              </div>
              <Link href="/dashboard/admin/operations/emergency">
                <Button type="button" variant="secondary">
                  View Full History
                </Button>
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                value={severityFilter}
                onChange={(event) =>
                  setSeverityFilter(event.target.value as "All" | "Priority" | "Emergency")
                }
              >
                <option value="All">All priorities</option>
                <option value="Emergency">Emergency</option>
                <option value="Priority">Priority</option>
              </Select>
              <Select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as
                      | "All"
                      | "Active"
                      | "In consultation"
                      | "Transferred"
                      | "Completed",
                  )
                }
              >
                <option value="All">All statuses</option>
                <option value="Active">Active</option>
                <option value="In consultation">In consultation</option>
                <option value="Transferred">Transferred</option>
                <option value="Completed">Completed</option>
              </Select>
            </div>

            {recentEmergencyVisits.length > 0 ? (
              <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
                {recentEmergencyVisits.map((visit) => {
                  const queueEntry = visit.queueEntryId ? queueById.get(visit.queueEntryId) : undefined;

                  return (
                    <div
                      key={visit.id}
                      className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={visit.severity === "Emergency" ? "danger" : "warning"}>
                          {visit.severity}
                        </Badge>
                        <Badge
                          variant={
                            visit.status === "Completed"
                              ? "success"
                              : visit.status === "In consultation"
                                ? "info"
                                : "neutral"
                          }
                        >
                          {visit.status}
                        </Badge>
                      </div>
                      <p className="mt-3 font-semibold">{visit.patientName}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                        {queueEntry?.doctorId
                          ? getDoctorName(queueEntry.doctorId)
                          : "Doctor assignment pending"}{" "}
                        · {formatDateTime(visit.createdAt)}
                      </p>
                      <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                        {visit.emergencyReason}
                      </p>
                      <div className="mt-3 flex justify-end">
                        <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedVisitId(visit.id)}>
                          View details
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No recent emergency activity"
                description="Recent emergency visits will appear here as soon as operational intake begins."
              />
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(selectedVisit)}
        title={selectedVisit?.patientName ?? "Emergency activity"}
        description="Review the current emergency case details from the administrative oversight view."
        onClose={() => setSelectedVisitId(null)}
      >
        {selectedVisit ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={selectedVisit.severity === "Emergency" ? "danger" : "warning"}>
                {selectedVisit.severity}
              </Badge>
              <Badge
                variant={
                  selectedVisit.status === "Completed"
                    ? "success"
                    : selectedVisit.status === "In consultation"
                      ? "info"
                      : "neutral"
                }
              >
                {selectedVisit.status}
              </Badge>
            </div>
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-sm leading-6">
              <p>
                <span className="font-semibold">Reason:</span> {selectedVisit.emergencyReason}
              </p>
              <p className="mt-2">
                <span className="font-semibold">Intake time:</span> {formatDateTime(selectedVisit.createdAt)}
              </p>
              <p className="mt-2">
                <span className="font-semibold">Assigned doctor:</span>{" "}
                {selectedVisit.queueEntryId && queueById.get(selectedVisit.queueEntryId)?.doctorId
                  ? getDoctorName(queueById.get(selectedVisit.queueEntryId)?.doctorId ?? "")
                  : "Doctor assignment pending"}
              </p>
              <p className="mt-2">
                <span className="font-semibold">Allergies:</span> {selectedVisit.allergies || "Not recorded"}
              </p>
              <p className="mt-2">
                <span className="font-semibold">Conditions:</span> {selectedVisit.medicalConditions || "Not recorded"}
              </p>
              <p className="mt-2">
                <span className="font-semibold">Blood group:</span> {selectedVisit.bloodGroup || "Not recorded"}
              </p>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
