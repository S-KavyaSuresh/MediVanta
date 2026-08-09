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
  | "prescriptions:view"
  | "lab-reports:view"
  | "billing:view"
  | "schedule:view"
  | "patients:view"
  | "operations:view"
  | "laboratory:view"
  | "pharmacy:view"
  | "lab-request:create";

export type OrganizationRecord = {
  id: string;
  name: string;
  slug: string;
};

export type DepartmentStatus =
  | "Operational"
  | "Busy"
  | "Limited"
  | "Emergency priority";

export type DoctorStatus =
  | "Available"
  | "Consulting"
  | "On break"
  | "Off duty"
  | "Emergency duty";

export type AppointmentStatus =
  | "Scheduled"
  | "Checked in"
  | "In consultation"
  | "Completed"
  | "Cancelled";

export type QueueStatus = "Waiting" | "Called" | "In consultation" | "Completed";

export type LabRequestStatus =
  | "Requested"
  | "Scheduled"
  | "Sample Collected"
  | "Processing"
  | "Completed";

export type DepartmentRecord = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description: string;
  status: DepartmentStatus;
  location: string;
};

export type DoctorRecord = {
  id: string;
  organizationId: string;
  name: string;
  specialization: string;
  departmentId: string;
  status: DoctorStatus;
  availability: string;
  shiftLabel: string;
};

export type AppointmentRecord = {
  id: string;
  organizationId: string;
  patientName: string;
  doctorId: string;
  departmentId: string;
  appointmentDate: string;
  appointmentTime: string;
  status: AppointmentStatus;
};

export type QueueEntryRecord = {
  id: string;
  organizationId: string;
  patientName: string;
  departmentId: string;
  doctorId?: string;
  appointmentId?: string;
  status: QueueStatus;
  createdAt: string;
  updatedAt: string;
};

export type LabTestRecord = {
  id: string;
  organizationId: string;
  name: string;
};

export type LabRequestRecord = {
  id: string;
  patientId: string;
  hospitalId: string;
  organizationId: string;
  patientName: string;
  testId: string;
  testName: string;
  departmentId: string;
  requestedDate: string;
  requestedTime: string;
  status: LabRequestStatus;
  createdAt: string;
};

export type HospitalState = {
  organization: OrganizationRecord;
  departments: DepartmentRecord[];
  doctors: DoctorRecord[];
  appointments: AppointmentRecord[];
  queueEntries: QueueEntryRecord[];
  labTests: LabTestRecord[];
  labRequests: LabRequestRecord[];
  configuredSupportLines: number;
};

export type UserRecord = {
  id: string;
  organizationId: string;
  email: string;
  displayName: string;
  role: UserRole;
  passwordHash: string;
  doctorId?: string;
  patientName?: string;
  departmentId?: string;
  staffStatus?: string;
  phoneNumber?: string;
  gender?: string;
  dateOfBirth?: string;
  bloodGroup?: string;
  address?: string;
  emergencyContact?: string;
  allergies?: string;
  medicalConditions?: string;
  resetTokenHash?: string;
  resetOtpHash?: string;
  resetExpiresAt?: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  expiresAt: string;
  remember: boolean;
};

export type SafeUser = Omit<
  UserRecord,
  "passwordHash" | "resetTokenHash" | "resetOtpHash" | "resetExpiresAt"
>;

export type AuthSessionPayload = {
  user: SafeUser;
  organization: OrganizationRecord;
  permissions: Capability[];
  landingPath: string;
};

export type HospitalStateResponse = {
  state: HospitalState;
  meta?: {
    userCounts?: Record<UserRole, number>;
    users?: SafeUser[];
  };
};

export type AppointmentDraft = {
  patientName: string;
  doctorId: string;
  appointmentDate: string;
  appointmentTime: string;
};

export type LabRequestDraft = {
  testId: string;
  requestedDate: string;
  requestedTime: string;
};
