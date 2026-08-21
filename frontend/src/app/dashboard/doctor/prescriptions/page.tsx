import { Suspense } from "react";

import { DoctorPrescriptionsView } from "@/components/dashboard/doctor-prescriptions-view";

export default function DoctorPrescriptionsPage() {
  return (
    <Suspense fallback={null}>
      <DoctorPrescriptionsView />
    </Suspense>
  );
}
