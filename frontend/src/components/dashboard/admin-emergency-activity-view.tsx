"use client";

import { useEffect, useState } from "react";

import { apiRequest } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";

type EmergencyActivityResponse = {
  activity: {
    page: number;
    pageSize: number;
    sort: "newest" | "oldest";
    totalItems: number;
    rows: Array<{
      id: string;
      patientName: string;
      familyMemberId?: string;
      severity: "Priority" | "Emergency";
      status: "Active" | "In consultation" | "Transferred" | "Completed";
      emergencyReason: string;
      contactName?: string;
      contactPhone?: string;
      allergies?: string;
      medicalConditions?: string;
      bloodGroup?: string;
      intakeTime: string;
      assignedDoctorId?: string;
      assignedDoctorName?: string;
    }>;
  };
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AdminEmergencyActivityView() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [severity, setSeverity] = useState<"All" | "Priority" | "Emergency">("All");
  const [status, setStatus] = useState<
    "All" | "Active" | "In consultation" | "Transferred" | "Completed"
  >("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EmergencyActivityResponse["activity"] | null>(null);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiRequest<EmergencyActivityResponse>(
          `/api/hospital/admin/emergency-visits?page=${page}&pageSize=10&sort=${encodeURIComponent(sort)}&severity=${encodeURIComponent(severity)}&status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
        );

        if (mounted) {
          setData(response.activity);
        }
      } catch (nextError) {
        if (mounted) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Emergency activity is not available right now.",
          );
          setData(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [dateFrom, dateTo, page, query, severity, sort, status]);

  const totalPages = data ? Math.max(1, Math.ceil(data.totalItems / data.pageSize)) : 1;
  const selectedVisit = data?.rows.find((row) => row.id === selectedVisitId) ?? null;

  return (
    <>
      <div className="space-y-6 md:space-y-8">
        <PageHeader
          eyebrow="Administration"
          title="Full Emergency Activity"
          description="Review emergency visit history with targeted filters, recent detail, and assigned-doctor context."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search patient or reason"
          />
          <Select
            value={severity}
            onChange={(event) => {
              setSeverity(event.target.value as "All" | "Priority" | "Emergency");
              setPage(1);
            }}
          >
            <option value="All">All priorities</option>
            <option value="Emergency">Emergency</option>
            <option value="Priority">Priority</option>
          </Select>
          <Select
            value={status}
            onChange={(event) => {
              setStatus(
                event.target.value as
                  | "All"
                  | "Active"
                  | "In consultation"
                  | "Transferred"
                  | "Completed",
              );
              setPage(1);
            }}
          >
            <option value="All">All statuses</option>
            <option value="Active">Active</option>
            <option value="In consultation">In consultation</option>
            <option value="Transferred">Transferred</option>
            <option value="Completed">Completed</option>
          </Select>
          <Input
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(1);
            }}
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPage(1);
            }}
          />
          <Select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as "newest" | "oldest");
              setPage(1);
            }}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </Select>
        </div>

        {loading ? (
          <EmptyState
            title="Loading emergency activity..."
            description="Preparing the latest emergency visit history."
          />
        ) : error ? (
          <EmptyState title="Emergency activity unavailable" description={error} />
        ) : !data || data.rows.length === 0 ? (
          <EmptyState
            title="No emergency visits match this view"
            description="Try a different combination of filters to review emergency activity."
          />
        ) : (
          <>
            <div className="space-y-4">
              {data.rows.map((visit) => (
                <Card key={visit.id} className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
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
                      <p className="mt-3 text-lg font-semibold">{visit.patientName}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                        {visit.assignedDoctorName ?? "Doctor assignment pending"} ·{" "}
                        {formatDateTime(visit.intakeTime)}
                      </p>
                      <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                        {visit.emergencyReason}
                      </p>
                    </div>
                    <Button type="button" variant="secondary" onClick={() => setSelectedVisitId(visit.id)}>
                      View details
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal
        open={Boolean(selectedVisit)}
        title={selectedVisit?.patientName ?? "Emergency visit"}
        description="Review the selected emergency visit details."
        onClose={() => setSelectedVisitId(null)}
      >
        {selectedVisit ? (
          <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-sm leading-6">
            <p>
              <span className="font-semibold">Priority:</span> {selectedVisit.severity}
            </p>
            <p>
              <span className="font-semibold">Status:</span> {selectedVisit.status}
            </p>
            <p>
              <span className="font-semibold">Assigned doctor:</span>{" "}
              {selectedVisit.assignedDoctorName ?? "Doctor assignment pending"}
            </p>
            <p>
              <span className="font-semibold">Intake time:</span> {formatDateTime(selectedVisit.intakeTime)}
            </p>
            <p>
              <span className="font-semibold">Reason:</span> {selectedVisit.emergencyReason}
            </p>
            <p>
              <span className="font-semibold">Allergies:</span> {selectedVisit.allergies || "Not recorded"}
            </p>
            <p>
              <span className="font-semibold">Conditions:</span>{" "}
              {selectedVisit.medicalConditions || "Not recorded"}
            </p>
            <p>
              <span className="font-semibold">Blood group:</span> {selectedVisit.bloodGroup || "Not recorded"}
            </p>
            <p>
              <span className="font-semibold">Contact name:</span> {selectedVisit.contactName || "Not recorded"}
            </p>
            <p>
              <span className="font-semibold">Contact phone:</span>{" "}
              {selectedVisit.contactPhone || "Not recorded"}
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
