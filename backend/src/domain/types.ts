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
  | "lab-report:create"
  | "billing:manage"
  | "payment:record"
  | "inventory:view"
  | "inventory:manage"
  | "family-member:manage"
  | "medical-history:create"
  | "clinical-attachment:create"
  | "telemedicine:join";

export type OrganizationRecord = {
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
  | "Cancelled"
  | "No Show";

export type QueueStatus = "Waiting" | "Called" | "In consultation" | "Completed";
export type QueuePriority = "Normal" | "Priority" | "Emergency";

export type LabRequestStatus =
  | "Requested"
  | "Scheduled"
  | "Sample Collected"
  | "Processing"
  | "Completed";

export type PrescriptionStatus = "Issued" | "Dispensed";

export type InvoiceStatus = "Pending" | "Partially Paid" | "Paid" | "Cancelled";

export type InvoiceCategory = "Consultation" | "Laboratory" | "Medicine" | "Other";

export type PaymentMethod =
  | "Cash"
  | "Card"
  | "UPI"
  | "Bank Transfer"
  | "Demo Payment";

export type NotificationCategory =
  | "Appointment"
  | "Laboratory"
  | "Prescription"
  | "Billing"
  | "Inventory"
  | "Emergency"
  | "System";

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
  patientId?: string;
  patientName: string;
  familyMemberId?: string;
  doctorId: string;
  departmentId: string;
  appointmentDate: string;
  appointmentTime: string;
  reasonForAppointment: string;
  consultationMode?: "In Person" | "Online";
  status: AppointmentStatus;
};

export type QueueEntryRecord = {
  id: string;
  organizationId: string;
  patientName: string;
  departmentId: string;
  doctorId?: string;
  appointmentId?: string;
  priority: QueuePriority;
  status: QueueStatus;
  createdAt: string;
  updatedAt: string;
};

export type EmergencyVisitSeverity = "Priority" | "Emergency";

export type EmergencyVisitStatus =
  | "Active"
  | "In consultation"
  | "Transferred"
  | "Completed";

export type EmergencyVisitRecord = {
  id: string;
  organizationId: string;
  appointmentId?: string;
  queueEntryId?: string;
  patientId?: string;
  familyMemberId?: string;
  patientName: string;
  contactName?: string;
  contactPhone?: string;
  emergencyReason: string;
  severity: EmergencyVisitSeverity;
  allergies?: string;
  medicalConditions?: string;
  bloodGroup?: string;
  status: EmergencyVisitStatus;
  createdAt: string;
  updatedAt: string;
};

export type PatientJourneyRecord = {
  id: string;
  organizationId: string;
  token: string;
  appointmentId?: string;
  queueEntryId?: string;
  patientId?: string;
  familyMemberId?: string;
  patientName: string;
  createdAt: string;
  updatedAt: string;
};

export type LabTestRecord = {
  id: string;
  organizationId: string;
  name: string;
  priceCents?: number;
};

export type MedicineCatalogRecord = {
  id: string;
  organizationId: string;
  name: string;
  strength?: string;
  unit: string;
  genericName?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LabRequestRecord = {
  id: string;
  patientId: string;
  hospitalId: string;
  organizationId: string;
  patientName: string;
  familyMemberId?: string;
  testId: string;
  testName: string;
  departmentId: string;
  requestedDate: string;
  requestedTime: string;
  status: LabRequestStatus;
  createdAt: string;
};

export type LabReportAttachmentRecord = {
  fileName: string;
  contentType: "application/pdf";
  fileSize: number;
  contentBase64?: string;
};

export type LabReportRecord = {
  id: string;
  labRequestId: string;
  patientId: string;
  hospitalId: string;
  organizationId: string;
  familyMemberId?: string;
  testName: string;
  reportTitle: string;
  resultSummary: string;
  uploadedAt: string;
  uploadedBy: {
    id: string;
    name: string;
  };
  attachment?: LabReportAttachmentRecord;
};

export type MedicalRecordRecord = {
  id: string;
  patientId: string;
  patientName: string;
  familyMemberId?: string;
  doctorId: string;
  doctorName: string;
  appointmentId?: string;
  hospitalId: string;
  organizationId: string;
  visitDate: string;
  diagnosis: string;
  clinicalNotes: string;
  treatmentAdvice: string;
  createdAt: string;
  updatedAt?: string;
};

export type PrescriptionMedicineRecord = {
  medicineId?: string;
  medicineName: string;
  strength?: string;
  doseQuantity?: number;
  doseUnit?: string;
  dosage: string;
  frequency: string;
  durationValue?: number;
  durationUnit?: string;
  duration: string;
  totalQuantity?: number;
  instructions?: string;
};

export type PrescriptionRecord = {
  id: string;
  patientId: string;
  patientName: string;
  familyMemberId?: string;
  doctorId: string;
  doctorName: string;
  hospitalId: string;
  organizationId: string;
  appointmentId?: string;
  medicines: PrescriptionMedicineRecord[];
  instructions: string;
  followUpDate?: string;
  status: PrescriptionStatus;
  createdAt: string;
  dispensedAt?: string;
  dispensedBy?: {
    id: string;
    name: string;
  };
};

export type InvoiceItemRecord = {
  id: string;
  invoiceId: string;
  organizationId: string;
  description: string;
  category: InvoiceCategory;
  quantity: number;
  unitAmountCents: number;
  totalAmountCents: number;
  sourceType?: "appointment" | "lab-request" | "prescription";
  sourceId?: string;
};

export type PaymentRecord = {
  id: string;
  invoiceId: string;
  patientId: string;
  organizationId: string;
  amountCents: number;
  method: PaymentMethod;
  referenceNumber?: string;
  paidAt: string;
  recordedBy?: {
    id: string;
    name: string;
  };
};

export type InvoiceRecord = {
  id: string;
  invoiceNumber: string;
  patientId: string;
  patientName: string;
  familyMemberId?: string;
  organizationId: string;
  hospitalId: string;
  sourceType?: "appointment" | "lab-request" | "prescription";
  sourceId?: string;
  createdAt: string;
  dueDate?: string;
  subtotalCents: number;
  totalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  paymentStatus: InvoiceStatus;
  items: InvoiceItemRecord[];
  payments: PaymentRecord[];
};

export type InventoryItemRecord = {
  id: string;
  organizationId: string;
  medicineId?: string;
  medicineName: string;
  genericName?: string;
  batchNumber: string;
  quantityInStock: number;
  unit: string;
  unitPriceCents: number;
  expiryDate: string;
  reorderLevel: number;
  manufacturer?: string;
  createdAt: string;
  updatedAt: string;
};

export type NotificationRecord = {
  id: string;
  userId: string;
  organizationId: string;
  title: string;
  message: string;
  category: NotificationCategory;
  relatedEntityType?: string;
  relatedEntityId?: string;
  read: boolean;
  createdAt: string;
};

export type FamilyMemberRecord = {
  id: string;
  organizationId: string;
  primaryPatientUserId: string;
  fullName: string;
  relationship: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  phoneNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  allergies?: string;
  medicalConditions?: string;
  preferredLanguage?: string;
  status: "Active" | "Inactive";
  createdAt: string;
  updatedAt: string;
};

export type MedicalHistoryEntryCategory = "Vaccination" | "Surgery";

export type MedicalHistoryEntryRecord = {
  id: string;
  organizationId: string;
  patientUserId: string;
  familyMemberId?: string;
  category: MedicalHistoryEntryCategory;
  title: string;
  details?: string;
  recordedDate: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt?: string;
};

export type ClinicalAttachmentRecord = {
  id: string;
  organizationId: string;
  patientUserId: string;
  familyMemberId?: string;
  medicalRecordId?: string;
  label: string;
  fileName: string;
  contentType: "application/pdf" | "image/png" | "image/jpeg";
  fileSize: number;
  contentBase64?: string;
  uploadedByUserId: string;
  uploadedByName: string;
  createdAt: string;
};

export type TelemedicineSessionStatus = "Scheduled" | "Live" | "Ended";

export type TelemedicineSessionRecord = {
  id: string;
  organizationId: string;
  appointmentId: string;
  patientUserId: string;
  doctorUserId: string;
  familyMemberId?: string;
  status: TelemedicineSessionStatus;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type TelemedicineMessageRecord = {
  id: string;
  sessionId: string;
  organizationId: string;
  senderUserId: string;
  senderName: string;
  message: string;
  createdAt: string;
};

export type TelemedicineSignalRecord = {
  id: string;
  sessionId: string;
  organizationId: string;
  senderUserId: string;
  recipientUserId: string;
  signalType: "offer" | "answer" | "candidate";
  payloadJson: string;
  createdAt: string;
};

export type BookingSessionCapacityRecord = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  maxAppointments: number;
};

export type BookingCapacityRecord = {
  doctorSlotCapacity: number;
  defaultMaxAppointmentsPerSession: number;
  labSlotCapacity: number;
  sessions: BookingSessionCapacityRecord[];
};

export type AppointmentSlotLoadRecord = {
  doctorId: string;
  appointmentDate: string;
  appointmentTime: string;
  bookings: number;
};

export type LabSlotLoadRecord = {
  requestedDate: string;
  requestedTime: string;
  bookings: number;
};

export type HospitalState = {
  organization: OrganizationRecord;
  departments: DepartmentRecord[];
  doctors: DoctorRecord[];
  medicineCatalog: MedicineCatalogRecord[];
  appointments: AppointmentRecord[];
  queueEntries: QueueEntryRecord[];
  emergencyVisits?: EmergencyVisitRecord[];
  patientJourneys?: PatientJourneyRecord[];
  medicalRecords: MedicalRecordRecord[];
  prescriptions: PrescriptionRecord[];
  labTests: LabTestRecord[];
  labRequests: LabRequestRecord[];
  labReports: LabReportRecord[];
  invoices: InvoiceRecord[];
  inventoryItems: InventoryItemRecord[];
  notifications: NotificationRecord[];
  familyMembers?: FamilyMemberRecord[];
  medicalHistoryEntries?: MedicalHistoryEntryRecord[];
  clinicalAttachments?: ClinicalAttachmentRecord[];
  telemedicineSessions?: TelemedicineSessionRecord[];
  bookingCapacity: BookingCapacityRecord;
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
  assignedDoctorId?: string;
  patientName?: string;
  departmentId?: string;
  staffStatus?: string;
  phoneNumber?: string;
  gender?: string;
  dateOfBirth?: string;
  bloodGroup?: string;
  address?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
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
  emailVerified?: boolean;
  passwordResetRequired?: boolean;
  resetTokenHash?: string;
  resetOtpHash?: string;
  resetExpiresAt?: string;
  verificationTokenHash?: string;
  verificationOtpHash?: string;
  verificationExpiresAt?: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  expiresAt: string;
  remember: boolean;
  createdAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
  userAgent?: string;
  deviceLabel?: string;
  refreshTokenHash?: string;
};

export type ActiveSessionRecord = {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  current: boolean;
  deviceLabel?: string;
  userAgent?: string;
};

export type AuditLogRecord = {
  id: string;
  organizationId?: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, string>;
  createdAt: string;
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
  session?: AuthSessionPayload;
  meta?: {
    userCounts?: Record<UserRole, number>;
    users?: SafeUser[];
    patientProfiles?: SafeUser[];
    doctorProfiles?: SafeUser[];
    appointmentSlotLoads?: AppointmentSlotLoadRecord[];
    labSlotLoads?: LabSlotLoadRecord[];
  };
};

export type AppointmentDraft = {
  patientName: string;
  familyMemberId?: string;
  doctorId: string;
  appointmentDate: string;
  appointmentTime: string;
  reasonForAppointment: string;
  consultationMode?: "In Person" | "Online";
};

export type LabRequestDraft = {
  testId: string;
  requestedDate: string;
  requestedTime: string;
  familyMemberId?: string;
};

export type EmergencyVisitDraft = {
  patientId?: string;
  familyMemberId?: string;
  patientName?: string;
  contactName?: string;
  contactPhone?: string;
  emergencyReason: string;
  severity: EmergencyVisitSeverity;
  allergies?: string;
  medicalConditions?: string;
  bloodGroup?: string;
};

export type LabReportDraft = {
  reportTitle: string;
  resultSummary: string;
  attachment?: LabReportAttachmentRecord;
};

export type MedicalRecordDraft = {
  patientId: string;
  appointmentId?: string;
  visitDate: string;
  diagnosis: string;
  clinicalNotes: string;
  treatmentAdvice: string;
  familyMemberId?: string;
};

export type PrescriptionMedicineDraft = {
  medicineId?: string;
  medicineName: string;
  strength?: string;
  doseQuantity?: number;
  doseUnit?: string;
  dosage: string;
  frequency: string;
  durationValue?: number;
  durationUnit?: string;
  duration: string;
  totalQuantity?: number;
  instructions?: string;
};

export type PrescriptionDraft = {
  patientId: string;
  appointmentId?: string;
  familyMemberId?: string;
  medicines: PrescriptionMedicineDraft[];
  instructions: string;
  followUpDate?: string;
};

export type PaymentDraft = {
  amount: number;
  method: PaymentMethod;
  referenceNumber?: string;
};

export type InventoryItemDraft = {
  medicineName: string;
  genericName?: string;
  batchNumber: string;
  quantityInStock: number;
  unit: string;
  unitPrice: number;
  expiryDate: string;
  reorderLevel: number;
  manufacturer?: string;
};

export type FamilyMemberDraft = {
  fullName: string;
  relationship: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  phoneNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  allergies?: string;
  medicalConditions?: string;
  preferredLanguage?: string;
};

export type MedicalHistoryEntryDraft = {
  category: MedicalHistoryEntryCategory;
  title: string;
  details?: string;
  recordedDate: string;
  familyMemberId?: string;
};

export type ClinicalAttachmentDraft = {
  label: string;
  fileName: string;
  contentType: "application/pdf" | "image/png" | "image/jpeg";
  fileSize: number;
  contentBase64: string;
  familyMemberId?: string;
  medicalRecordId?: string;
};
