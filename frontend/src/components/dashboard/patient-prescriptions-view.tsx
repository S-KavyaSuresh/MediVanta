"use client";

import { useMemo } from "react";

import { StatusBadge } from "@/components/dashboard/status-badge";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function PatientPrescriptionsView() {
  const { state } = useHospitalData();
  const prescriptions = useMemo(
    () =>
      [...state.prescriptions].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      ),
    [state.prescriptions],
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Patient Dashboard"
        title="Prescriptions"
        description="Track medicines prescribed for you, review instructions, and follow dispensing updates from the pharmacy."
      />

      {prescriptions.length > 0 ? (
        <div className="space-y-4">
          {prescriptions.map((prescription) => (
            <Card key={prescription.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{prescription.doctorName}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                    Issued {formatDateTime(prescription.createdAt)}
                  </p>
                </div>
                <StatusBadge status={prescription.status} />
              </div>

              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                <p className="text-sm font-semibold">Medicines</p>
                <div className="mt-3 space-y-3">
                  {prescription.medicines.map((medicine, index) => (
                    <div
                      key={`${prescription.id}-${index}`}
                      className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3"
                    >
                      <p className="font-medium">{medicine.medicineName}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                        {medicine.dosage} · {medicine.frequency} · {medicine.duration}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                <p className="text-sm font-semibold">Instructions</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[color:var(--muted-foreground)]">
                  {prescription.instructions}
                </p>
                {prescription.dispensedAt ? (
                  <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">
                    Dispensed on {formatDateTime(prescription.dispensedAt)}
                    {prescription.dispensedBy ? ` by ${prescription.dispensedBy.name}` : ""}
                  </p>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No prescriptions yet"
          description="Prescriptions issued to your account will appear here after your doctor creates them."
        />
      )}
    </div>
  );
}
