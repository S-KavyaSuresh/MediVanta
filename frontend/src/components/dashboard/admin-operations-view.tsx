"use client";

import { useMemo, useState } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/dashboard/status-badge";

const queuePriorities = ["Normal", "Priority", "Emergency"] as const;

export function AdminOperationsView() {
  const {
    assignQueueDoctor,
    createEmergencyVisit,
    getDepartmentName,
    getDoctorName,
    state,
    updateQueuePriority,
  } = useHospitalData();
  const { pushToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [priorityUpdatingId, setPriorityUpdatingId] = useState<string | null>(null);
  const [doctorAssigningId, setDoctorAssigningId] = useState<string | null>(null);
  const [doctorSelection, setDoctorSelection] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    patientName: "",
    contactName: "",
    contactPhone: "",
    emergencyReason: "",
    severity: "Emergency" as "Priority" | "Emergency",
    allergies: "",
    medicalConditions: "",
    bloodGroup: "",
  });

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

  const activeEmergencyVisits = useMemo(
    () => [...(state.emergencyVisits ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [state.emergencyVisits],
  );

  const rankedDoctors = useMemo(() => {
    const statusRank: Record<string, number> = {
      "Emergency duty": 0,
      Available: 1,
      Consulting: 2,
      "On break": 3,
      "Off duty": 4,
    };

    return (departmentId: string) =>
      [...state.doctors].sort((left, right) => {
        const leftDeptMatch = left.departmentId === departmentId ? 0 : 1;
        const rightDeptMatch = right.departmentId === departmentId ? 0 : 1;
        if (leftDeptMatch !== rightDeptMatch) {
          return leftDeptMatch - rightDeptMatch;
        }
        const leftRank = statusRank[left.status] ?? 5;
        const rightRank = statusRank[right.status] ?? 5;
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        return left.name.localeCompare(right.name);
      });
  }, [state.doctors]);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Hospital Operations"
        description="Coordinate immediate-care intake, review priority queue movement, and keep operational readiness visible across the hospital."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">Immediate Care Intake</h2>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Capture only the critical details needed to move a patient or visitor into emergency priority flow.
          </p>

          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setSubmitting(true);
              const result = await createEmergencyVisit({
                patientName: form.patientName,
                contactName: form.contactName || undefined,
                contactPhone: form.contactPhone || undefined,
                emergencyReason: form.emergencyReason,
                severity: form.severity,
                allergies: form.allergies || undefined,
                medicalConditions: form.medicalConditions || undefined,
                bloodGroup: form.bloodGroup || undefined,
              });
              setSubmitting(false);

              if (!result.ok) {
                pushToast("Unable to start emergency intake", result.message ?? "Please review the details and try again.");
                return;
              }

              pushToast("Emergency priority activated", "The visit was added to the immediate-care queue.");
              setForm({
                patientName: "",
                contactName: "",
                contactPhone: "",
                emergencyReason: "",
                severity: "Emergency",
                allergies: "",
                medicalConditions: "",
                bloodGroup: "",
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium">Patient or visitor name</label>
                <Input
                  value={form.patientName}
                  onChange={(event) => setForm((current) => ({ ...current, patientName: event.target.value }))}
                  placeholder="Enter a name when available"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Severity</label>
                <Select
                  value={form.severity}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      severity: event.target.value as "Priority" | "Emergency",
                    }))
                  }
                >
                  <option value="Emergency">Emergency</option>
                  <option value="Priority">Priority</option>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Blood group</label>
                <Input
                  value={form.bloodGroup}
                  onChange={(event) => setForm((current) => ({ ...current, bloodGroup: event.target.value }))}
                  placeholder="If known"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium">Immediate care reason</label>
                <Textarea
                  value={form.emergencyReason}
                  onChange={(event) => setForm((current) => ({ ...current, emergencyReason: event.target.value }))}
                  placeholder="Briefly describe the emergency reason"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Allergies</label>
                <Input
                  value={form.allergies}
                  onChange={(event) => setForm((current) => ({ ...current, allergies: event.target.value }))}
                  placeholder="Not recorded if unknown"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Major medical conditions</label>
                <Input
                  value={form.medicalConditions}
                  onChange={(event) => setForm((current) => ({ ...current, medicalConditions: event.target.value }))}
                  placeholder="Not recorded if unknown"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Contact name</label>
                <Input
                  value={form.contactName}
                  onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))}
                  placeholder="If available"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Contact phone</label>
                <Input
                  value={form.contactPhone}
                  onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))}
                  placeholder="If available"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Starting..." : "Start Emergency Flow"}
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-5">
          <Card className="space-y-4">
            <h2 className="text-xl font-semibold">Priority Queue Oversight</h2>
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
                          <Badge variant={entry.priority === "Emergency" ? "danger" : entry.priority === "Priority" ? "warning" : "neutral"}>
                            {entry.priority ?? "Normal"}
                          </Badge>
                        </div>
                        <p className="mt-3 text-lg font-semibold">{entry.patientName}</p>
                        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                          {getDepartmentName(entry.departmentId)} ·{" "}
                          {entry.doctorId ? getDoctorName(entry.doctorId) : "Awaiting doctor assignment"}
                        </p>
                      </div>
                      <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
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
                                pushToast("Unable to change priority", result.message ?? "Please try again.");
                                return;
                              }

                              pushToast("Priority updated", `${entry.patientName} was updated to ${event.target.value}.`);
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

                        <div className="w-full max-w-[16rem]">
                          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                            Assigned doctor
                          </label>
                          <div className="flex gap-2">
                            <Select
                              value={doctorSelection[entry.id] ?? entry.doctorId ?? ""}
                              onChange={(event) =>
                                setDoctorSelection((current) => ({ ...current, [entry.id]: event.target.value }))
                              }
                              disabled={doctorAssigningId === entry.id}
                            >
                              <option value="">Awaiting doctor assignment</option>
                              {rankedDoctors(entry.departmentId).map((doctor) => (
                                <option key={doctor.id} value={doctor.id}>
                                  {doctor.name} · {doctor.status}
                                </option>
                              ))}
                            </Select>
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={
                                doctorAssigningId === entry.id ||
                                !(doctorSelection[entry.id] ?? "") ||
                                doctorSelection[entry.id] === entry.doctorId
                              }
                              onClick={async () => {
                                const doctorId = doctorSelection[entry.id];
                                if (!doctorId) {
                                  return;
                                }
                                setDoctorAssigningId(entry.id);
                                const result = await assignQueueDoctor(entry.id, doctorId);
                                setDoctorAssigningId(null);

                                if (!result.ok) {
                                  pushToast("Unable to assign doctor", result.message ?? "Please try again.");
                                  return;
                                }

                                pushToast("Doctor assigned", `${entry.patientName} is now assigned.`);
                              }}
                            >
                              Confirm
                            </Button>
                          </div>
                        </div>
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

          <Card className="space-y-4">
            <h2 className="text-xl font-semibold">Emergency Visit Activity</h2>
            {activeEmergencyVisits.length > 0 ? (
              <div className="space-y-3">
                {activeEmergencyVisits.slice(0, 6).map((visit) => (
                  <div
                    key={visit.id}
                    className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={visit.severity === "Emergency" ? "danger" : "warning"}>
                        {visit.severity}
                      </Badge>
                      <Badge variant={visit.status === "Completed" ? "success" : visit.status === "In consultation" ? "info" : "neutral"}>
                        {visit.status}
                      </Badge>
                    </div>
                    <p className="mt-3 font-semibold">{visit.patientName}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      {visit.emergencyReason}
                    </p>
                    <div className="mt-3 space-y-1 text-sm text-[color:var(--muted-foreground)]">
                      <p>Allergies: {visit.allergies || "Not recorded"}</p>
                      <p>Conditions: {visit.medicalConditions || "Not recorded"}</p>
                      <p>Blood group: {visit.bloodGroup || "Not recorded"}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No emergency visits recorded"
                description="New immediate-care visits will appear here as soon as they are created."
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
