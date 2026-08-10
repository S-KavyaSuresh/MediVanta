"use client";

import { useMemo } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

function formatRecordDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function PatientRecordsView() {
  const { state } = useHospitalData();
  const records = useMemo(
    () =>
      [...state.medicalRecords].sort((left, right) =>
        `${right.visitDate}${right.createdAt}`.localeCompare(`${left.visitDate}${left.createdAt}`),
      ),
    [state.medicalRecords],
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Patient Dashboard"
        title="My Health Records"
        description="Review the clinical notes, diagnosis, and treatment advice shared as part of your care journey."
      />

      {records.length > 0 ? (
        <div className="space-y-4">
          {records.map((record) => (
            <Card key={record.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{record.diagnosis}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                    {record.doctorName} · {formatRecordDate(record.visitDate)}
                  </p>
                </div>
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                  {record.id}
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                  <p className="text-sm font-semibold">Clinical Notes</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[color:var(--muted-foreground)]">
                    {record.clinicalNotes}
                  </p>
                </div>
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                  <p className="text-sm font-semibold">Treatment / Advice</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[color:var(--muted-foreground)]">
                    {record.treatmentAdvice}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No medical records yet"
          description="Clinical records shared with your account will appear here after your doctor completes a visit note."
        />
      )}
    </div>
  );
}
