import { Badge } from "@/components/ui/badge";
import type {
  AppointmentStatus,
  DepartmentStatus,
  DoctorStatus,
  InvoiceStatus,
  LabRequestStatus,
  PrescriptionStatus,
  QueueStatus,
} from "@/lib/hospital-data";

type StatusValue =
  | AppointmentStatus
  | DepartmentStatus
  | DoctorStatus
  | QueueStatus
  | LabRequestStatus
  | PrescriptionStatus
  | InvoiceStatus;

export function StatusBadge({ status }: { status: StatusValue }) {
  const variant =
    status === "Cancelled"
      ? "danger"
      : status === "Available" ||
          status === "Operational" ||
          status === "Completed" ||
          status === "Dispensed" ||
          status === "Paid"
        ? "success"
        : status === "Checked in" ||
            status === "In consultation" ||
            status === "Consulting" ||
            status === "Called" ||
            status === "Emergency duty" ||
            status === "Emergency priority" ||
            status === "Sample Collected" ||
            status === "Processing"
          ? "info"
          : status === "Busy" ||
              status === "Limited" ||
              status === "Waiting" ||
              status === "Scheduled" ||
              status === "Issued" ||
              status === "Pending" ||
              status === "Partially Paid" ||
              status === "On break" ||
              status === "Requested"
            ? "warning"
            : "neutral";

  return <Badge variant={variant}>{status}</Badge>;
}
