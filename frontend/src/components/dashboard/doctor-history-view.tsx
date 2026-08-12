"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { apiRequest } from "@/lib/api";
import {
  formatPrescriptionDose,
  formatPrescriptionDuration,
  formatPrescriptionMedicineName,
  type MedicalRecordRecord,
  type PrescriptionRecord,
} from "@/lib/hospital-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/dashboard/status-badge";

type HistoryTab = "medical-records" | "prescriptions";
type SortOrder = "newest" | "oldest";
type DatePreset = "today" | "24h" | "7d" | "30d" | "all";

type HistoryResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
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

function formatVisitDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function DoctorHistoryView() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab: HistoryTab =
    requestedTab === "prescriptions" ? "prescriptions" : "medical-records";
  const [activeTab, setActiveTab] = useState<HistoryTab>(initialTab);
  const [sort, setSort] = useState<SortOrder>("newest");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [patientQuery, setPatientQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<HistoryResponse<MedicalRecordRecord>>({
    items: [],
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 1,
  });
  const [prescriptions, setPrescriptions] = useState<HistoryResponse<PrescriptionRecord>>({
    items: [],
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 1,
  });

  useEffect(() => {
    let cancelled = false;

    void apiRequest<
      HistoryResponse<MedicalRecordRecord> | HistoryResponse<PrescriptionRecord>
    >(
      `/api/hospital/doctor-history?kind=${activeTab}&page=${page}&pageSize=10&sort=${sort}&datePreset=${datePreset}&patient=${encodeURIComponent(patientQuery)}`,
    )
      .then((response) => {
        if (cancelled) {
          return;
        }

        if (activeTab === "medical-records") {
          setRecords(response as HistoryResponse<MedicalRecordRecord>);
        } else {
          setPrescriptions(response as HistoryResponse<PrescriptionRecord>);
        }
      })
      .catch((currentError) => {
        if (!cancelled) {
          setError(currentError instanceof Error ? currentError.message : "Unable to load history.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, page, sort, datePreset, patientQuery]);

  const activeResponse = useMemo(
    () => (activeTab === "medical-records" ? records : prescriptions),
    [activeTab, prescriptions, records],
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Doctor Workspace"
        title="History"
        description="Review medical records and prescriptions with dedicated filters, sorting, and pagination."
      />

      <Card className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button
            variant={activeTab === "medical-records" ? "primary" : "secondary"}
            onClick={() => {
              setLoading(true);
              setError(null);
              setPage(1);
              setActiveTab("medical-records");
            }}
          >
            Medical Records
          </Button>
          <Button
            variant={activeTab === "prescriptions" ? "primary" : "secondary"}
            onClick={() => {
              setLoading(true);
              setError(null);
              setPage(1);
              setActiveTab("prescriptions");
            }}
          >
            Prescriptions
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Input
            value={patientQuery}
            onChange={(event) => {
              setLoading(true);
              setError(null);
              setPage(1);
              setPatientQuery(event.target.value);
            }}
            placeholder="Search patient"
          />
          <Select
            value={datePreset}
            onChange={(event) => {
              setLoading(true);
              setError(null);
              setPage(1);
              setDatePreset(event.target.value as DatePreset);
            }}
          >
            <option value="today">Today</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">All</option>
          </Select>
          <Select
            value={sort}
            onChange={(event) => {
              setLoading(true);
              setError(null);
              setPage(1);
              setSort(event.target.value as SortOrder);
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </Select>
        </div>
      </Card>

      {error ? <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            {activeTab === "medical-records" ? "Medical Records" : "Prescriptions"}
          </h2>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            {activeResponse.totalItems} item{activeResponse.totalItems === 1 ? "" : "s"}
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">Loading history...</p>
        ) : activeResponse.items.length > 0 ? (
          <div className="space-y-3">
            {activeTab === "medical-records"
              ? (activeResponse.items as MedicalRecordRecord[]).map((record) => (
                  <div
                    key={record.id}
                    className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold">{record.patientName}</p>
                        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                          {record.diagnosis} - {formatVisitDate(record.visitDate)}
                        </p>
                        <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                          Created {formatDateTime(record.createdAt)}
                        </p>
                      </div>
                      <p className="text-xs font-medium uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                        {record.id}
                      </p>
                    </div>
                  </div>
                ))
              : (activeResponse.items as PrescriptionRecord[]).map((prescription) => (
                  <div
                    key={prescription.id}
                    className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold">{prescription.patientName}</p>
                        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                          {formatDateTime(prescription.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={prescription.status} />
                    </div>
                    <div className="mt-3 space-y-2">
                      {prescription.medicines.map((medicine, index) => (
                        <p key={`${prescription.id}-${index}`} className="text-sm">
                          <span className="font-medium">{formatPrescriptionMedicineName(medicine)}</span>:{" "}
                          {formatPrescriptionDose(medicine)} - {medicine.frequency} -{" "}
                          {formatPrescriptionDuration(medicine)}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
          </div>
        ) : (
          <EmptyState
            title="No history found"
            description="Try adjusting the filters to view medical records or prescriptions."
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Page {activeResponse.page} of {activeResponse.totalPages}
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              disabled={activeResponse.page <= 1}
              onClick={() => {
                setLoading(true);
                setError(null);
                setPage((current) => Math.max(1, current - 1));
              }}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={activeResponse.page >= activeResponse.totalPages}
              onClick={() => {
                setLoading(true);
                setError(null);
                setPage((current) => current + 1);
              }}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
