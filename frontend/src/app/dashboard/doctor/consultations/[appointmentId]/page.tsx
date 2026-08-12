import { TelemedicineSessionView } from "@/components/dashboard/telemedicine-session-view";

export default async function DoctorConsultationPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;
  return (
    <TelemedicineSessionView
      appointmentId={appointmentId}
      roleLabel="Doctor Workspace"
    />
  );
}
