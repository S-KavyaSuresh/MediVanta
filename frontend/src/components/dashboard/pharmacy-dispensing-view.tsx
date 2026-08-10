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

export function PharmacyDispensingView() {
  const { state } = useHospitalData();
  const dispensed = useMemo(
    () =>
      state.prescriptions
        .filter((prescription) => prescription.status === "Dispensed")
        .sort(
          (left, right) =>
            new Date(right.dispensedAt ?? right.createdAt).getTime() -
            new Date(left.dispensedAt ?? left.createdAt).getTime(),
        ),
    [state.prescriptions],
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Pharmacy Workspace"
        title="Dispensing history"
        description="Review prescriptions already dispensed through the shared pharmacy workflow without creating a duplicate queue."
      />

      {dispensed.length > 0 ? (
        <div className="space-y-4">
          {dispensed.map((prescription) => (
            <Card key={prescription.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{prescription.patientName}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                    {prescription.doctorName} · Dispensed{" "}
                    {formatDateTime(prescription.dispensedAt ?? prescription.createdAt)}
                  </p>
                </div>
                <StatusBadge status={prescription.status} />
              </div>

              <div className="space-y-2">
                {prescription.medicines.map((medicine, index) => (
                  <p key={`${prescription.id}-${index}`} className="text-sm">
                    <span className="font-medium">{medicine.medicineName}</span>: {medicine.dosage} ·{" "}
                    {medicine.frequency} · {medicine.duration}
                  </p>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No dispensed prescriptions yet"
          description="Completed dispensing activity will appear here after prescriptions are marked as dispensed."
        />
      )}
    </div>
  );
}
