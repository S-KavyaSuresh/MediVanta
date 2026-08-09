"use client";

import { useMemo } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function DoctorPatientsView() {
  const { state } = useHospitalData();
  const patients = useMemo(
    () => Array.from(new Set(state.appointments.map((appointment) => appointment.patientName))),
    [state.appointments],
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Doctor Workspace"
        title="My Patients"
        description="Patients assigned through your current appointment schedule appear here."
      />
      {patients.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {patients.map((patient) => (
            <Card key={patient}>
              <p className="text-lg font-semibold">{patient}</p>
              <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                Linked through your scheduled consultations.
              </p>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No patients assigned yet"
          description="Patient names will appear here when appointments are assigned to your workspace."
        />
      )}
    </div>
  );
}
