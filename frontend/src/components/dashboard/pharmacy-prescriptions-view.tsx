"use client";

import { useMemo, useState } from "react";

import { StatusBadge } from "@/components/dashboard/status-badge";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  formatPrescriptionDose,
  formatPrescriptionDuration,
  formatPrescriptionMedicineName,
} from "@/lib/hospital-data";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function PharmacyPrescriptionsView() {
  const { dispensePrescription, state } = useHospitalData();
  const [message, setMessage] = useState<string | null>(null);
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
        eyebrow="Pharmacy Workspace"
        title="Prescriptions"
        description="Review prescriptions ready for handoff and confirm dispensing when medicines are issued."
      />

      {message ? <p className="text-sm text-[color:var(--muted-foreground)]">{message}</p> : null}

      {prescriptions.length > 0 ? (
        <div className="space-y-4">
          {prescriptions.map((prescription) => (
            <Card key={prescription.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{prescription.patientName}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                    {prescription.doctorName} - Issued {formatDateTime(prescription.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={prescription.status} />
                  <Button
                    type="button"
                    variant={prescription.status === "Issued" ? "primary" : "secondary"}
                    disabled={prescription.status !== "Issued"}
                    onClick={async () => {
                      const result = await dispensePrescription(prescription.id);
                      setMessage(
                        result.ok
                          ? `Prescription ${prescription.id} marked as dispensed.`
                          : result.message ?? "The prescription could not be updated.",
                      );
                    }}
                  >
                    {prescription.status === "Issued" ? "Mark Dispensed" : "Dispensed"}
                  </Button>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                {prescription.medicines.map((medicine, index) => (
                  <div key={`${prescription.id}-${index}`}>
                    <p className="font-medium">{formatPrescriptionMedicineName(medicine)}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      {formatPrescriptionDose(medicine)} - {medicine.frequency} -{" "}
                      {formatPrescriptionDuration(medicine)}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      Total quantity: {medicine.totalQuantity ?? "-"}
                    </p>
                    {medicine.instructions ? (
                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                        {medicine.instructions}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>

              <p className="whitespace-pre-wrap text-sm leading-6 text-[color:var(--muted-foreground)]">
                {prescription.instructions}
              </p>

              {prescription.dispensedAt ? (
                <p className="text-sm text-[color:var(--muted-foreground)]">
                  Dispensed {formatDateTime(prescription.dispensedAt)}
                  {prescription.dispensedBy ? ` by ${prescription.dispensedBy.name}` : ""}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No prescriptions available"
          description="Issued prescriptions will appear here as soon as doctors add them to the shared hospital workflow."
        />
      )}
    </div>
  );
}
