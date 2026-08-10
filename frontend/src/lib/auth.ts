export type UserRole =
  | "patient"
  | "doctor"
  | "receptionist"
  | "laboratory"
  | "pharmacist"
  | "administrator";

export type Capability =
  | "appointment:create"
  | "appointment:update"
  | "appointment:cancel"
  | "appointment:checkin"
  | "appointment:view"
  | "queue:view"
  | "queue:update"
  | "doctor:view"
  | "department:view"
  | "search:view"
  | "user:view"
  | "user:manage"
  | "reports:view"
  | "settings:view"
  | "profile:view"
  | "notifications:view"
  | "health-records:view"
  | "health-records:create"
  | "patient:create"
  | "prescriptions:view"
  | "prescription:create"
  | "prescription:dispense"
  | "profile:update"
  | "lab-reports:view"
  | "billing:view"
  | "schedule:view"
  | "patients:view"
  | "operations:view"
  | "laboratory:view"
  | "pharmacy:view"
  | "lab-request:create"
  | "lab-request:update"
  | "lab-report:create";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  address?: string;
  city?: string;
  state?: string;
  contactPhone?: string;
  contactEmail?: string;
  emergencyContact?: string;
  operatingHours?: string;
  timezone?: string;
  defaultLanguage?: string;
  emergencyServicesEnabled?: boolean;
  defaultConsultationSlotDurationMinutes?: number;
};

export const defaultOrganization: Organization = {
  id: "org-medivanta-general",
  name: "MediVanta General Hospital",
  slug: "medivanta-general",
  address: "221 Care Avenue",
  city: "Chennai",
  state: "Tamil Nadu",
  contactPhone: "+91 44 4000 2200",
  contactEmail: "hello@medivanta.demo",
  emergencyContact: "+91 44 4000 2299",
  operatingHours: "24/7 emergency · Outpatient 08:00 - 20:00",
  timezone: "Asia/Calcutta",
  defaultLanguage: "English",
  emergencyServicesEnabled: true,
  defaultConsultationSlotDurationMinutes: 30,
};

export type SafeUser = {
  id: string;
  organizationId: string;
  email: string;
  displayName: string;
  role: UserRole;
  doctorId?: string;
  assignedDoctorId?: string;
  patientName?: string;
  departmentId?: string;
  staffStatus?: string;
  phoneNumber?: string;
  gender?: string;
  dateOfBirth?: string;
  bloodGroup?: string;
  address?: string;
  emergencyContact?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  allergies?: string;
  medicalConditions?: string;
  preferredLanguage?: string;
  qualifications?: string;
  experience?: string;
  languages?: string;
  consultationFee?: string;
  availableTimings?: string;
  deskLabel?: string;
  designation?: string;
  shift?: string;
  professionalRegistrationNumber?: string;
  consultationMode?: string;
  profileVerificationStatus?: string;
  administrativeUnit?: string;
};

export type AuthSession = {
  user: SafeUser;
  organization: Organization;
  permissions: Capability[];
  landingPath: string;
};

export function getSafeLandingPath(role: UserRole, candidate?: string | null) {
  const nextPath = typeof candidate === "string" ? candidate.trim() : "";

  if (nextPath === "/dashboard" || nextPath.startsWith("/dashboard/")) {
    return nextPath;
  }

  return landingPathByRole[role] ?? "/dashboard";
}

export const capabilitiesByRole: Record<UserRole, Capability[]> = {
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
    "profile:update",
  ],
  doctor: [
    "appointment:view",
    "queue:view",
    "doctor:view",
    "department:view",
    "schedule:view",
    "patients:view",
    "patient:create",
    "prescriptions:view",
    "prescription:create",
    "health-records:view",
    "health-records:create",
    "lab-reports:view",
    "notifications:view",
    "profile:view",
    "profile:update",
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
    "profile:update",
    "operations:view",
  ],
  laboratory: [
    "laboratory:view",
    "lab-request:update",
    "lab-report:create",
    "lab-reports:view",
    "profile:view",
    "profile:update",
  ],
  pharmacist: [
    "pharmacy:view",
    "prescriptions:view",
    "prescription:dispense",
    "profile:view",
    "profile:update",
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
    "profile:update",
    "operations:view",
  ],
};

export function normalizeAuthSession(
  session: Partial<AuthSession> & Pick<AuthSession, "user">,
): AuthSession {
  const role = session.user.role;
  const organization =
    session.organization?.id && session.organization?.name && session.organization?.slug
      ? session.organization
      : defaultOrganization;

  return {
    ...session,
    user: {
      ...session.user,
      organizationId: session.user.organizationId ?? defaultOrganization.id,
    },
    organization,
    permissions: Array.isArray(session.permissions)
      ? session.permissions
      : capabilitiesByRole[role],
    landingPath: getSafeLandingPath(role, session.landingPath),
  };
}

export type DashboardNavItem = {
  id: string;
  label: string;
  href: string;
};

export type TourStep = {
  targetId: string;
  title: string;
  description: string;
};

export const roleTitles: Record<UserRole, string> = {
  patient: "Patient Dashboard",
  doctor: "Doctor Workspace",
  receptionist: "Reception Desk",
  laboratory: "Laboratory Workspace",
  pharmacist: "Pharmacy Workspace",
  administrator: "Administration",
};

export const roleLabels: Record<UserRole, string> = {
  patient: "Patient",
  doctor: "Doctor",
  receptionist: "Receptionist",
  laboratory: "Laboratory Staff",
  pharmacist: "Pharmacist",
  administrator: "Administrator",
};

export const landingPathByRole: Record<UserRole, string> = {
  patient: "/dashboard/patient",
  doctor: "/dashboard/doctor",
  receptionist: "/dashboard/reception",
  laboratory: "/dashboard/laboratory",
  pharmacist: "/dashboard/pharmacy",
  administrator: "/dashboard/admin",
};

export const dashboardNavByRole: Record<UserRole, DashboardNavItem[]> = {
  patient: [
    { id: "patient-overview", label: "Overview", href: "/dashboard/patient" },
    {
      id: "patient-appointments",
      label: "My Appointments",
      href: "/dashboard/patient/appointments",
    },
    {
      id: "patient-records",
      label: "My Health Records",
      href: "/dashboard/patient/records",
    },
    {
      id: "patient-prescriptions",
      label: "Prescriptions",
      href: "/dashboard/patient/prescriptions",
    },
    {
      id: "patient-lab-tests",
      label: "Lab Tests",
      href: "/dashboard/patient/lab-tests",
    },
    { id: "patient-billing", label: "Billing", href: "/dashboard/patient/billing" },
    {
      id: "patient-notifications",
      label: "Notifications",
      href: "/dashboard/patient/notifications",
    },
    { id: "patient-profile", label: "Profile", href: "/dashboard/patient/profile" },
  ],
  doctor: [
    { id: "doctor-overview", label: "Overview", href: "/dashboard/doctor" },
    { id: "doctor-schedule", label: "My Schedule", href: "/dashboard/doctor/schedule" },
    { id: "doctor-patients", label: "My Patients", href: "/dashboard/doctor/patients" },
    {
      id: "doctor-appointments",
      label: "Appointments",
      href: "/dashboard/doctor/appointments",
    },
    {
      id: "doctor-queue",
      label: "Consultation Queue",
      href: "/dashboard/doctor/queue",
    },
    {
      id: "doctor-prescriptions",
      label: "Prescriptions",
      href: "/dashboard/doctor/prescriptions",
    },
    {
      id: "doctor-records",
      label: "Medical Records",
      href: "/dashboard/doctor/records",
    },
    {
      id: "doctor-notifications",
      label: "Notifications",
      href: "/dashboard/doctor/notifications",
    },
    { id: "doctor-profile", label: "Profile", href: "/dashboard/doctor/profile" },
  ],
  receptionist: [
    { id: "reception-overview", label: "Overview", href: "/dashboard/reception" },
    { id: "reception-appointments", label: "Appointments", href: "/dashboard/appointments" },
    { id: "reception-queue", label: "Queue Board", href: "/dashboard/queue" },
    { id: "reception-doctors", label: "Doctors", href: "/dashboard/doctors" },
    {
      id: "reception-departments",
      label: "Departments",
      href: "/dashboard/departments",
    },
    { id: "reception-profile", label: "Profile", href: "/dashboard/reception/profile" },
  ],
  laboratory: [
    { id: "laboratory-overview", label: "Overview", href: "/dashboard/laboratory" },
    {
      id: "laboratory-requests",
      label: "Laboratory Requests",
      href: "/dashboard/laboratory/requests",
    },
    {
      id: "laboratory-reports",
      label: "Lab Reports",
      href: "/dashboard/laboratory/reports",
    },
    {
      id: "laboratory-profile",
      label: "Profile",
      href: "/dashboard/laboratory/profile",
    },
  ],
  pharmacist: [
    { id: "pharmacy-overview", label: "Overview", href: "/dashboard/pharmacy" },
    {
      id: "pharmacy-prescriptions",
      label: "Prescriptions",
      href: "/dashboard/pharmacy/prescriptions",
    },
    {
      id: "pharmacy-dispensing",
      label: "Dispensing History",
      href: "/dashboard/pharmacy/dispensing",
    },
    { id: "pharmacy-profile", label: "Profile", href: "/dashboard/pharmacy/profile" },
  ],
  administrator: [
    { id: "admin-overview", label: "Overview", href: "/dashboard/admin" },
    { id: "admin-departments", label: "Departments", href: "/dashboard/departments" },
    { id: "admin-users", label: "Staff Management", href: "/dashboard/admin/users" },
    { id: "admin-appointments", label: "Appointments", href: "/dashboard/appointments" },
    {
      id: "admin-operations",
      label: "Hospital Operations",
      href: "/dashboard/admin/operations",
    },
    {
      id: "admin-reports",
      label: "Reports / Analytics",
      href: "/dashboard/admin/reports",
    },
    { id: "admin-settings", label: "Settings", href: "/dashboard/admin/settings" },
    { id: "admin-profile", label: "Profile", href: "/dashboard/admin/profile" },
  ],
};

export const profilePathByRole: Record<UserRole, string> = {
  patient: "/dashboard/patient/profile",
  doctor: "/dashboard/doctor/profile",
  receptionist: "/dashboard/reception/profile",
  laboratory: "/dashboard/laboratory/profile",
  pharmacist: "/dashboard/pharmacy/profile",
  administrator: "/dashboard/admin/profile",
};

export const tourStepsByRole: Record<UserRole, TourStep[]> = {
  patient: [
    {
      targetId: "dashboard-home-link",
      title: "Home",
      description: "Return to the MediVanta home page at any time.",
    },
    {
      targetId: "nav-patient-appointments",
      title: "My Appointments",
      description: "View upcoming appointments, status updates, and visit details.",
    },
    {
      targetId: "nav-patient-records",
      title: "Health Records",
      description: "Open your records area when shared health information becomes available.",
    },
    {
      targetId: "dashboard-profile-control",
      title: "Profile",
      description: "Review your account details and access personal workspace controls.",
    },
  ],
  doctor: [
    {
      targetId: "dashboard-home-link",
      title: "Home",
      description: "Return to the MediVanta home page whenever you need it.",
    },
    {
      targetId: "nav-doctor-schedule",
      title: "Today’s Schedule",
      description: "Review your assigned clinic schedule and upcoming consultations.",
    },
    {
      targetId: "nav-doctor-queue",
      title: "Consultation Queue",
      description: "Track the active patient queue linked to your consultations.",
    },
    {
      targetId: "nav-doctor-records",
      title: "Medical Records",
      description: "Capture visit notes, review prior records, and reference linked lab reports.",
    },
    {
      targetId: "dashboard-profile-control",
      title: "Profile",
      description: "Access your account identity and workspace controls here.",
    },
  ],
  receptionist: [
    {
      targetId: "dashboard-home-link",
      title: "Home",
      description: "Return to the MediVanta home page at any time.",
    },
    {
      targetId: "nav-reception-appointments",
      title: "Appointments",
      description: "Manage scheduling, edits, cancellations, and check-ins here.",
    },
    {
      targetId: "nav-reception-queue",
      title: "Queue Board",
      description: "Advance patients through the live operational queue board.",
    },
    {
      targetId: "dashboard-global-search",
      title: "Global Search",
      description: "Search patients, doctors, departments, appointments, and queue records.",
    },
  ],
  laboratory: [
    {
      targetId: "dashboard-home-link",
      title: "Home",
      description: "Return to the MediVanta home page whenever needed.",
    },
    {
      targetId: "nav-laboratory-requests",
      title: "Laboratory Requests",
      description: "Review incoming laboratory requests from this area.",
    },
    {
      targetId: "dashboard-profile-control",
      title: "Profile",
      description: "Open your account and workspace controls from here.",
    },
  ],
  pharmacist: [
    {
      targetId: "dashboard-home-link",
      title: "Home",
      description: "Return to the MediVanta home page whenever needed.",
    },
    {
      targetId: "nav-pharmacy-prescriptions",
      title: "Prescriptions",
      description: "Review and manage prescription fulfillment from this area.",
    },
    {
      targetId: "dashboard-profile-control",
      title: "Profile",
      description: "Open your account and workspace controls from here.",
    },
  ],
  administrator: [
    {
      targetId: "dashboard-home-link",
      title: "Home",
      description: "Return to the MediVanta home page at any time.",
    },
    {
      targetId: "nav-admin-users",
      title: "Users",
      description: "Review the current user directory and role distribution here.",
    },
    {
      targetId: "nav-admin-operations",
      title: "Operations",
      description: "Open hospital operations oversight from this workspace.",
    },
    {
      targetId: "nav-admin-settings",
      title: "Settings",
      description: "Use settings and profile areas for account-level administration.",
    },
  ],
};
