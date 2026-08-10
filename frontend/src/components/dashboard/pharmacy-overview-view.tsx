"use client";

import { ClipboardCheck, PackageCheck, ReceiptText } from "lucide-react";

import { StatusBadge } from "@/components/dashboard/status-badge";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function PharmacyOverviewView() {
  const { state } = useHospitalData();
  const awaitingDispense = state.prescriptions.filter(
    (prescription) => prescription.status === "Issued",
  );
  const dispensed = state.prescriptions.filter(
    (prescription) => prescription.status === "Dispensed",
  );
  const recentActivity = [...state.prescriptions]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 4);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Pharmacy Workspace"
        title="Prescription dispensing overview"
        description="Monitor prescriptions awaiting handoff, confirm completed dispensing, and keep recent pharmacy activity visible."
      />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Awaiting dispensing"
          value={String(awaitingDispense.length)}
          delta="Issued prescriptions ready for pharmacy action"
          icon={ReceiptText}
        />
        <StatCard
          label="Dispensed"
          value={String(dispensed.length)}
          delta="Prescriptions already handed over"
          icon={PackageCheck}
        />
        <StatCard
          label="Recent activity"
          value={String(recentActivity.length)}
          delta="Most recent prescription updates in this workspace"
          icon={ClipboardCheck}
        />
      </div>

      {recentActivity.length > 0 ? (
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">Recent prescription activity</h2>
          <div className="space-y-3">
            {recentActivity.map((prescription) => (
              <div
                key={prescription.id}
                className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold">{prescription.patientName}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      {prescription.doctorName} · {formatDateTime(prescription.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={prescription.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          title="No prescription activity yet"
          description="Issued prescriptions will appear here as soon as the clinical team starts the medication workflow."
        />
      )}
    </div>
  );
}
