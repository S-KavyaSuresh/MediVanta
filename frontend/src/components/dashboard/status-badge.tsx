import { Badge } from "@/components/ui/badge";
import type {
  AppointmentStatus,
  DepartmentStatus,
  DoctorStatus,
  QueueStatus,
} from "@/lib/hospital-data";

type StatusValue = AppointmentStatus | DepartmentStatus | DoctorStatus | QueueStatus;

export function StatusBadge({ status }: { status: StatusValue }) {
  const variant =
    status === "Cancelled"
      ? "danger"
      : status === "Available" ||
          status === "Operational" ||
          status === "Completed"
        ? "success"
        : status === "Checked in" ||
            status === "In consultation" ||
            status === "Consulting" ||
            status === "Called" ||
            status === "Emergency duty" ||
            status === "Emergency priority"
          ? "info"
          : status === "Busy" ||
              status === "Limited" ||
              status === "Waiting" ||
              status === "Scheduled" ||
              status === "On break"
            ? "warning"
            : "neutral";

  return <Badge variant={variant}>{status}</Badge>;
}
