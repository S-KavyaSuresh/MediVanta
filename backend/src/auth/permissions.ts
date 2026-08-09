import type { Capability, UserRole } from "../domain/types.js";

export const roleCapabilities: Record<UserRole, Capability[]> = {
  patient: [
    "appointment:create",
    "appointment:cancel",
    "appointment:view",
    "lab-request:create",
    "health-records:view",
    "prescriptions:view",
    "lab-reports:view",
    "billing:view",
    "notifications:view",
    "profile:view",
  ],
  doctor: [
    "appointment:view",
    "queue:view",
    "doctor:view",
    "department:view",
    "schedule:view",
    "patients:view",
    "prescriptions:view",
    "health-records:view",
    "lab-reports:view",
    "notifications:view",
    "profile:view",
  ],
  laboratory: [
    "laboratory:view",
    "lab-reports:view",
    "profile:view",
  ],
  pharmacist: [
    "pharmacy:view",
    "prescriptions:view",
    "profile:view",
  ],
  receptionist: [
    "appointment:create",
    "appointment:update",
    "appointment:cancel",
    "appointment:checkin",
    "appointment:view",
    "queue:view",
    "queue:update",
    "doctor:view",
    "department:view",
    "search:view",
    "profile:view",
    "operations:view",
  ],
  administrator: [
    "appointment:create",
    "appointment:update",
    "appointment:cancel",
    "appointment:checkin",
    "appointment:view",
    "queue:view",
    "queue:update",
    "doctor:view",
    "department:view",
    "search:view",
    "user:view",
    "user:manage",
    "reports:view",
    "settings:view",
    "profile:view",
    "operations:view",
  ],
};

export const landingPathByRole: Record<UserRole, string> = {
  patient: "/dashboard/patient",
  doctor: "/dashboard/doctor",
  receptionist: "/dashboard/reception",
  laboratory: "/dashboard/laboratory",
  pharmacist: "/dashboard/pharmacy",
  administrator: "/dashboard/admin",
};

export function getCapabilitiesForRole(role: UserRole) {
  return roleCapabilities[role];
}
