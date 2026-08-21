import { clinicians } from "@/lib/sample-data";

export const HOSPITAL_STORAGE_KEY = "medivanta-hospital-state";
export const DEMO_REFERENCE_DATE = "2026-08-09";

export function getCurrentLocalDateIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getCurrentLocalTimeValue(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

function getSlotTimeValue(value?: string) {
  if (!value) {
    return Number.NaN;
  }

  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isCapacityConsumingAppointment(status: AppointmentStatus) {
  return status !== "Cancelled" && status !== "No Show";
}

function isCapacityConsumingLabRequest(status: LabRequestStatus) {
  return status !== "Completed" && status !== "Missed";
}

export function getSessionForTime(state: HospitalState, time: string) {
  const timeValue = getSlotTimeValue(time);

  return (
    state.bookingCapacity.sessions.find(
      (session) =>
        Number.isFinite(getSlotTimeValue(session.startTime)) &&
        Number.isFinite(getSlotTimeValue(session.endTime)) &&
        timeValue >= getSlotTimeValue(session.startTime) &&
        timeValue <= getSlotTimeValue(session.endTime),
    ) ?? null
  );
}

export function getDoctorSlotBookingCount(
  state: HospitalState,
  doctorId: string,
  appointmentDate: string,
  appointmentTime: string,
  excludeAppointmentId?: string,
) {
  return state.appointments.filter((appointment) => {
    if (excludeAppointmentId && appointment.id === excludeAppointmentId) {
      return false;
    }

    return (
      appointment.doctorId === doctorId &&
      appointment.appointmentDate === appointmentDate &&
      appointment.appointmentTime === appointmentTime &&
      isCapacityConsumingAppointment(appointment.status)
    );
  }).length;
}

export function getDoctorSessionBookingCount(
  state: HospitalState,
  doctorId: string,
  appointmentDate: string,
  appointmentTime: string,
  excludeAppointmentId?: string,
) {
  const session = getSessionForTime(state, appointmentTime);

  if (!session) {
    return 0;
  }

  return state.appointments.filter((appointment) => {
    if (excludeAppointmentId && appointment.id === excludeAppointmentId) {
      return false;
    }

    return (
      appointment.doctorId === doctorId &&
      appointment.appointmentDate === appointmentDate &&
      isCapacityConsumingAppointment(appointment.status) &&
      appointment.appointmentTime >= session.startTime &&
      appointment.appointmentTime <= session.endTime
    );
  }).length;
}

export function isDoctorSlotFullyBooked(
  state: HospitalState,
  doctorId: string,
  appointmentDate: string,
  appointmentTime: string,
  excludeAppointmentId?: string,
) {
  return (
    getDoctorSlotBookingCount(
      state,
      doctorId,
      appointmentDate,
      appointmentTime,
      excludeAppointmentId,
    ) >= state.bookingCapacity.doctorSlotCapacity
  );
}

export function isDoctorSessionFullyBooked(
  state: HospitalState,
  doctorId: string,
  appointmentDate: string,
  appointmentTime: string,
  excludeAppointmentId?: string,
) {
  const session = getSessionForTime(state, appointmentTime);

  if (!session) {
    return false;
  }

  return (
    getDoctorSessionBookingCount(
      state,
      doctorId,
      appointmentDate,
      appointmentTime,
      excludeAppointmentId,
    ) >= session.maxAppointments
  );
}

export function isDoctorOnBreakAtSlot(doctor: DoctorRecord | undefined, appointmentTime: string) {
  if (!doctor?.breakWindows?.length) {
    return false;
  }

  const slotValue = getSlotTimeValue(appointmentTime);
  if (!Number.isFinite(slotValue)) {
    return false;
  }

  return doctor.breakWindows.some((breakWindow) => {
    const startValue = getSlotTimeValue(breakWindow.startTime);
    const endValue = getSlotTimeValue(breakWindow.endTime);

    return (
      Number.isFinite(startValue) &&
      Number.isFinite(endValue) &&
      slotValue >= startValue &&
      slotValue < endValue
    );
  });
}

export function getDoctorBreakLabel(doctor: DoctorRecord | undefined, appointmentTime: string) {
  if (!doctor?.breakWindows?.length) {
    return undefined;
  }

  const slotValue = getSlotTimeValue(appointmentTime);
  if (!Number.isFinite(slotValue)) {
    return undefined;
  }

  return doctor.breakWindows.find((breakWindow) => {
    const startValue = getSlotTimeValue(breakWindow.startTime);
    const endValue = getSlotTimeValue(breakWindow.endTime);

    return (
      Number.isFinite(startValue) &&
      Number.isFinite(endValue) &&
      slotValue >= startValue &&
      slotValue < endValue
    );
  })?.label;
}

export function isClosedAppointmentTimeSlot(appointmentTime: string) {
  return appointmentTime === "13:00" || appointmentTime === "13:30";
}

export function getDoctorCapacityStatus(
  state: HospitalState,
  doctorId: string,
  appointmentDate: string,
  appointmentTime: string,
  excludeAppointmentId?: string,
) {
  const session = getSessionForTime(state, appointmentTime);
  const slotBookings = getDoctorSlotBookingCount(
    state,
    doctorId,
    appointmentDate,
    appointmentTime,
    excludeAppointmentId,
  );
  const sessionBookings = getDoctorSessionBookingCount(
    state,
    doctorId,
    appointmentDate,
    appointmentTime,
    excludeAppointmentId,
  );

  if (
    slotBookings >= state.bookingCapacity.doctorSlotCapacity ||
    (session && sessionBookings >= session.maxAppointments)
  ) {
    return {
      label: "Full",
      detail: session
        ? `${session.label} ${sessionBookings}/${session.maxAppointments}`
        : `${slotBookings}/${state.bookingCapacity.doctorSlotCapacity}`,
    };
  }

  if (session && sessionBookings >= Math.max(1, session.maxAppointments - 1)) {
    return {
      label: "Filling",
      detail: `${session.label} ${sessionBookings}/${session.maxAppointments}`,
    };
  }

  return {
    label: "Available",
    detail: session
      ? `${session.label} ${sessionBookings}/${session.maxAppointments}`
      : `${slotBookings}/${state.bookingCapacity.doctorSlotCapacity}`,
    };
}

export function getLabSlotBookingCount(
  state: HospitalState,
  requestedDate: string,
  requestedTime: string,
) {
  return state.labRequests.filter(
    (request) =>
      request.requestedDate === requestedDate &&
      request.requestedTime === requestedTime &&
      isCapacityConsumingLabRequest(request.status),
  ).length;
}

export function isLabSlotFullyBooked(
  state: HospitalState,
  requestedDate: string,
  requestedTime: string,
) {
  return (
    getLabSlotBookingCount(state, requestedDate, requestedTime) >=
    state.bookingCapacity.labSlotCapacity
  );
}

export function getLabSlotCapacityStatus(
  state: HospitalState,
  requestedDate: string,
  requestedTime: string,
) {
  const bookings = getLabSlotBookingCount(state, requestedDate, requestedTime);
  const capacity = state.bookingCapacity.labSlotCapacity;

  if (bookings >= capacity) {
    return { label: "Full", detail: `${bookings} / ${capacity}` };
  }

  if (bookings >= Math.max(1, capacity - 1)) {
    return { label: "Filling", detail: `${bookings} / ${capacity}` };
  }

  return { label: "Available", detail: `${bookings} / ${capacity}` };
}

export function isPastLocalTimeSlot(date: string, time: string, now = new Date()) {
  const currentDate = getCurrentLocalDateIso();

  if (date < currentDate) {
    return true;
  }

  if (date > currentDate) {
    return false;
  }

  return getSlotTimeValue(time) <= getCurrentLocalTimeValue(now);
}

export function getAppointmentDateTimeValue(
  appointment: Pick<AppointmentRecord, "appointmentDate" | "appointmentTime">,
) {
  const value = new Date(`${appointment.appointmentDate}T${appointment.appointmentTime}:00`).getTime();
  return Number.isNaN(value) ? 0 : value;
}

export function isPatientUpcomingAppointment(
  appointment: Pick<AppointmentRecord, "appointmentDate" | "appointmentTime" | "status">,
  now = new Date(),
) {
  const today = getCurrentLocalDateIso();

  if (appointment.status === "Scheduled") {
    return getAppointmentDateTimeValue(appointment) > now.getTime();
  }

  return (
    appointment.appointmentDate === today &&
    (appointment.status === "Checked in" || appointment.status === "In consultation")
  );
}

export function comparePatientAppointments(
  left: AppointmentRecord,
  right: AppointmentRecord,
  now = new Date(),
) {
  const leftUpcoming = isPatientUpcomingAppointment(left, now);
  const rightUpcoming = isPatientUpcomingAppointment(right, now);
  const leftTime = getAppointmentDateTimeValue(left);
  const rightTime = getAppointmentDateTimeValue(right);

  if (leftUpcoming && rightUpcoming) {
    return leftTime - rightTime;
  }

  if (leftUpcoming) {
    return -1;
  }

  if (rightUpcoming) {
    return 1;
  }

  return rightTime - leftTime;
}

export function getPatientUpcomingAppointments(
  appointments: AppointmentRecord[],
  now = new Date(),
) {
  return appointments
    .filter((appointment) => isPatientUpcomingAppointment(appointment, now))
    .sort((left, right) => getAppointmentDateTimeValue(left) - getAppointmentDateTimeValue(right));
}

export function getTelemedicineJoinAvailability(
  appointment: Pick<AppointmentRecord, "appointmentDate" | "appointmentTime" | "consultationMode" | "status">,
  now = new Date(),
) {
  if (appointment.consultationMode !== "Online") {
    return {
      allowed: false,
      reason: "Only online appointments can be joined.",
    };
  }

  if (appointment.status === "Cancelled" || appointment.status === "Completed") {
    return {
      allowed: false,
      reason: "This consultation is no longer available.",
    };
  }

  const scheduledAt = new Date(`${appointment.appointmentDate}T${appointment.appointmentTime}:00`);
  if (Number.isNaN(scheduledAt.getTime())) {
    return {
      allowed: false,
      reason: "This consultation is not available yet.",
    };
  }

  const opensAt = scheduledAt.getTime() - 10 * 60 * 1000;
  const closesAt = scheduledAt.getTime() + 30 * 60 * 1000;
  if (now.getTime() < opensAt) {
    return {
      allowed: false,
      reason: "Available 10 minutes before the appointment.",
    };
  }

  if (now.getTime() > closesAt && appointment.status !== "In consultation") {
    return {
      allowed: false,
      reason: "This consultation window has closed.",
    };
  }

  return {
    allowed: true,
    reason: "",
  };
}

export function formatPrescriptionMedicineName(
  medicine: Pick<PrescriptionMedicineRecord, "medicineName" | "strength">,
) {
  return [medicine.medicineName.trim(), medicine.strength?.trim() ?? ""]
    .filter(Boolean)
    .join(" ");
}

export function formatPrescriptionDose(
  medicine: Pick<PrescriptionMedicineRecord, "doseQuantity" | "doseUnit" | "dosage">,
) {
  if (medicine.doseQuantity && medicine.doseUnit?.trim()) {
    return `${medicine.doseQuantity} ${medicine.doseUnit.trim()}`;
  }

  return medicine.dosage.trim();
}

export function formatPrescriptionDuration(
  medicine: Pick<PrescriptionMedicineRecord, "durationValue" | "durationUnit" | "duration">,
) {
  if (medicine.durationValue && medicine.durationUnit?.trim()) {
    return `${medicine.durationValue} ${medicine.durationUnit.trim()}`;
  }

  return medicine.duration.trim();
}

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

export type LabRequestStatus =
  | "Requested"
  | "Scheduled"
  | "Sample Collected"
  | "Processing"
  | "Completed"
  | "Missed";

export type PrescriptionStatus = "Issued" | "Dispensed";

export type InvoiceStatus = "Pending" | "Partially Paid" | "Paid" | "Cancelled";

export type InvoiceCategory = "Consultation" | "Laboratory" | "Medicine" | "Other";

export type PaymentMethod =
  | "Cash"
  | "Credit Card"
  | "Debit Card"
  | "Card"
  | "UPI"
  | "Net Banking"
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

export type QueuePriority = "Normal" | "Priority" | "Emergency";

export type DepartmentRecord = {
  id: string;
  code: string;
  name: string;
  description: string;
  status: DepartmentStatus;
  location: string;
};

export type HospitalBranchRecord = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  address: string;
  city: string;
  state?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DoctorRecord = {
  id: string;
  organizationId?: string;
  name: string;
  specialization: string;
  departmentId: string;
  status: DoctorStatus;
  availability: string;
  shiftLabel: string;
  branchId?: string;
  breakWindows?: Array<{
    label: string;
    startTime: string;
    endTime: string;
  }>;
};

export type AppointmentRecord = {
  id: string;
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
  organizationId?: string;
  patientName: string;
  departmentId: string;
  doctorId?: string;
  appointmentId?: string;
  priority?: QueuePriority;
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
  patientId: string;
  familyMemberId?: string;
  appointmentId?: string;
  queueEntryId?: string;
  token: string;
  currentStep: string;
  steps: string[];
  nextStep?: string;
  queueStatus?: QueueStatus;
  priority?: QueuePriority;
  doctorName?: string;
  departmentName?: string;
  estimatedWait?: string;
  createdAt: string;
  updatedAt: string;
};

export type LabTestRecord = {
  id: string;
  organizationId?: string;
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
  patientId?: string;
  hospitalId?: string;
  organizationId?: string;
  patientName: string;
  familyMemberId?: string;
  appointmentId?: string;
  testId: string;
  testName: string;
  departmentId: string;
  requestedDate: string;
  requestedTime: string;
  clinicalNotes?: string;
  orderedByUserId?: string;
  status: LabRequestStatus;
  createdAt?: string;
};

export type LabReportAttachmentRecord = {
  fileName: string;
  contentType: "application/pdf";
  fileSize: number;
  contentBase64?: string;
  storageProvider?: "cloudinary" | "local";
  storageUrl?: string;
  storagePublicId?: string;
  originalFileName?: string;
  mimeType?: string;
  storageSize?: number;
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
  discountCents: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  paymentStatus: InvoiceStatus;
  items: InvoiceItemRecord[];
  payments: PaymentRecord[];
};

export type SupplierStatus = "Active" | "Inactive";

export type SupplierRecord = {
  id: string;
  organizationId: string;
  supplierName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  status: SupplierStatus;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrderStatus = "Draft" | "Ordered" | "Received" | "Cancelled";

export type PurchaseOrderItemRecord = {
  id: string;
  purchaseOrderId: string;
  organizationId: string;
  medicineId?: string;
  medicineName: string;
  quantity: number;
  unitCostCents: number;
  lineTotalCents: number;
  receivedQuantity?: number;
  receivedUnitCostCents?: number;
  receivedBatchNumber?: string;
  receivedExpiryDate?: string;
  displayOrder: number;
};

export type PurchaseOrderRecord = {
  id: string;
  purchaseOrderNumber: string;
  organizationId: string;
  supplierId: string;
  supplierName?: string;
  orderDate: string;
  expectedDate?: string;
  status: PurchaseOrderStatus;
  notes?: string;
  createdBy?: {
    id?: string;
    name?: string;
  };
  createdAt: string;
  updatedAt: string;
  receivedAt?: string;
  receivedBy?: {
    id?: string;
    name?: string;
  };
  items: PurchaseOrderItemRecord[];
};

export type DoctorRatingRecord = {
  id: string;
  organizationId: string;
  appointmentId: string;
  patientId: string;
  familyMemberId?: string;
  doctorId: string;
  rating: number;
  reviewComment?: string;
  createdAt: string;
  updatedAt: string;
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
  storageProvider?: "cloudinary" | "local";
  storageUrl?: string;
  storagePublicId?: string;
  originalFileName?: string;
  mimeType?: string;
  storageSize?: number;
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
  organization: {
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
    totalBeds?: number;
    occupiedBeds?: number;
  };
  departments: DepartmentRecord[];
  branches?: HospitalBranchRecord[];
  doctors: DoctorRecord[];
  medicineCatalog: MedicineCatalogRecord[];
  appointments: AppointmentRecord[];
  queueEntries: QueueEntryRecord[];
  medicalRecords: MedicalRecordRecord[];
  prescriptions: PrescriptionRecord[];
  labTests: LabTestRecord[];
  labRequests: LabRequestRecord[];
  labReports: LabReportRecord[];
  invoices: InvoiceRecord[];
  inventoryItems: InventoryItemRecord[];
  notifications: NotificationRecord[];
  emergencyVisits?: EmergencyVisitRecord[];
  patientJourneys?: PatientJourneyRecord[];
  familyMembers?: FamilyMemberRecord[];
  medicalHistoryEntries?: MedicalHistoryEntryRecord[];
  clinicalAttachments?: ClinicalAttachmentRecord[];
  telemedicineSessions?: TelemedicineSessionRecord[];
  bookingCapacity: BookingCapacityRecord;
  configuredSupportLines: number;
};

export type AppointmentDraft = {
  patientName: string;
  familyMemberId?: string;
  branchId?: string;
  doctorId: string;
  appointmentDate: string;
  appointmentTime: string;
  reasonForAppointment: string;
  consultationMode?: "In Person" | "Online";
  paymentMethod?: PaymentMethod;
  paymentReferenceNumber?: string;
};

export type LabRequestDraft = {
  patientId?: string;
  appointmentId?: string;
  testId: string;
  requestedDate: string;
  requestedTime: string;
  familyMemberId?: string;
  clinicalNotes?: string;
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
  patientId?: string;
  category: MedicalHistoryEntryCategory;
  title: string;
  details?: string;
  recordedDate: string;
  familyMemberId?: string;
};

export type ClinicalAttachmentDraft = {
  patientId?: string;
  label: string;
  fileName: string;
  contentType: "application/pdf" | "image/png" | "image/jpeg";
  fileSize: number;
  contentBase64: string;
  familyMemberId?: string;
  medicalRecordId?: string;
};

export type HospitalSettingsDraft = {
  hospitalName: string;
  address: string;
  city: string;
  state: string;
  contactPhone: string;
  contactEmail: string;
  emergencyContact: string;
  operatingHours: string;
  timezone: string;
  defaultLanguage: string;
  emergencyServicesEnabled: boolean;
  defaultConsultationSlotDurationMinutes: number;
  defaultDoctorSlotCapacity: number;
  morningSessionCapacity: number;
  afternoonSessionCapacity: number;
  eveningSessionCapacity: number;
  defaultLabSlotCapacity: number;
  totalBeds: number;
  occupiedBeds: number;
};

export type SearchGroup = {
  title: string;
  items: Array<{
    id: string;
    heading: string;
    details: string;
    href: string;
  }>;
};

const departmentsSeed: DepartmentRecord[] = [
  {
    id: "dept-general-medicine",
    code: "GM",
    name: "General Medicine",
    description: "Adult consultations, follow-up care, and chronic care planning.",
    status: "Operational",
    location: "North Wing, Level 2",
  },
  {
    id: "dept-cardiology",
    code: "CARD",
    name: "Cardiology",
    description: "Heart health consultations, diagnostics, and recovery planning.",
    status: "Busy",
    location: "Heart Centre, Level 3",
  },
  {
    id: "dept-pediatrics",
    code: "PED",
    name: "Pediatrics",
    description: "Child wellness, family care, and pediatric follow-up visits.",
    status: "Operational",
    location: "Family Care Block, Level 1",
  },
  {
    id: "dept-orthopedics",
    code: "ORTHO",
    name: "Orthopedics",
    description: "Musculoskeletal care, fracture review, and post-procedure follow-up.",
    status: "Operational",
    location: "Surgical Wing, Level 2",
  },
  {
    id: "dept-neurology",
    code: "NEURO",
    name: "Neurology",
    description: "Neurology consultations, symptom review, and specialist assessment.",
    status: "Limited",
    location: "Specialty Clinic, Level 4",
  },
  {
    id: "dept-dermatology",
    code: "DERM",
    name: "Dermatology",
    description: "Skin health consultations and follow-up care.",
    status: "Operational",
    location: "Outpatient Wing, Level 2",
  },
  {
    id: "dept-ent",
    code: "ENT",
    name: "ENT",
    description: "Ear, nose, and throat specialist services.",
    status: "Operational",
    location: "Specialty Clinic, Level 3",
  },
  {
    id: "dept-ophthalmology",
    code: "OPH",
    name: "Ophthalmology",
    description: "Eye examinations, specialist consultations, and follow-up visits.",
    status: "Operational",
    location: "Vision Centre, Level 2",
  },
  {
    id: "dept-radiology",
    code: "RAD",
    name: "Radiology",
    description: "Imaging coordination, scanning workflow, and report preparation.",
    status: "Busy",
    location: "Diagnostics Block, Ground Floor",
  },
  {
    id: "dept-laboratory",
    code: "LAB",
    name: "Laboratory",
    description: "Sample collection, test processing, and results support.",
    status: "Operational",
    location: "Diagnostics Block, Ground Floor",
  },
  {
    id: "dept-emergency",
    code: "ER",
    name: "Emergency",
    description: "Urgent assessment, acute care intake, and emergency support.",
    status: "Emergency priority",
    location: "Emergency Entrance, Ground Floor",
  },
];

const doctorsSeed: DoctorRecord[] = [
  {
    id: "doc-anaya-sharma",
    name: clinicians[0].name,
    specialization: clinicians[0].specialty,
    departmentId: "dept-general-medicine",
    status: "Consulting",
    availability: clinicians[0].availability,
    shiftLabel: "08:00 - 14:00",
    branchId: "branch-medivanta-general-main",
    breakWindows: [{ label: "Morning break", startTime: "10:30", endTime: "11:00" }],
  },
  {
    id: "doc-rohan-mehta",
    name: clinicians[1].name,
    specialization: clinicians[1].specialty,
    departmentId: "dept-emergency",
    status: "Emergency duty",
    availability: clinicians[1].availability,
    shiftLabel: "07:00 - 19:00",
    branchId: "branch-medivanta-general-main",
    breakWindows: [{ label: "Meal break", startTime: "13:30", endTime: "14:00" }],
  },
  {
    id: "doc-meera-iqbal",
    name: clinicians[2].name,
    specialization: clinicians[2].specialty,
    departmentId: "dept-pediatrics",
    status: "Available",
    availability: clinicians[2].availability,
    shiftLabel: "10:00 - 18:00",
    branchId: "branch-medivanta-general-main",
    breakWindows: [{ label: "Lunch break", startTime: "13:00", endTime: "14:00" }],
  },
  {
    id: "doc-vivek-menon",
    name: clinicians[3].name,
    specialization: clinicians[3].specialty,
    departmentId: "dept-cardiology",
    status: "Available",
    availability: clinicians[3].availability,
    shiftLabel: "09:00 - 17:00",
    branchId: "branch-medivanta-general-main",
    breakWindows: [{ label: "Lunch break", startTime: "12:30", endTime: "13:30" }],
  },
  {
    id: "doc-neha-sen",
    name: "Dr. Neha Sen",
    specialization: "Radiology",
    departmentId: "dept-radiology",
    status: "Consulting",
    availability: "Imaging sessions in progress",
    shiftLabel: "08:00 - 16:00",
    branchId: "branch-medivanta-general-main",
    breakWindows: [{ label: "Reporting break", startTime: "12:30", endTime: "13:00" }],
  },
  {
    id: "doc-kiran-iyer",
    name: "Dr. Kiran Iyer",
    specialization: "Orthopedics",
    departmentId: "dept-orthopedics",
    status: "On break",
    availability: "Returns at 13:00",
    shiftLabel: "08:00 - 16:00",
    branchId: "branch-medivanta-general-main",
    breakWindows: [{ label: "Break", startTime: "12:00", endTime: "13:00" }],
  },
  {
    id: "doc-sana-reddy",
    name: "Dr. Sana Reddy",
    specialization: "Dermatology",
    departmentId: "dept-dermatology",
    status: "Off duty",
    availability: "Next clinic tomorrow",
    shiftLabel: "Off duty today",
    branchId: "branch-medivanta-general-main",
  },
  {
    id: "doc-arjun-roy",
    name: "Dr. Arjun Roy",
    specialization: "Neurology",
    departmentId: "dept-neurology",
    status: "Available",
    availability: "Review clinic active",
    shiftLabel: "11:00 - 19:00",
    branchId: "branch-medivanta-general-main",
    breakWindows: [{ label: "Evening break", startTime: "15:30", endTime: "16:00" }],
  },
];

const branchesSeed: HospitalBranchRecord[] = [
  {
    id: "branch-medivanta-general-main",
    organizationId: "org-medivanta-general",
    code: "MAIN",
    name: "MediVanta General Hospital",
    address: "221 Care Avenue",
    city: "Chennai",
    state: "Tamil Nadu",
    phone: "+91 44 4000 2200",
    email: "hello@medivanta.demo",
    active: true,
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z",
  },
];

const appointmentsSeed: AppointmentRecord[] = [
  {
    id: "APT-2001",
    patientName: "Aarav Verma",
    doctorId: "doc-vivek-menon",
    departmentId: "dept-cardiology",
    appointmentDate: DEMO_REFERENCE_DATE,
    appointmentTime: "09:30",
    reasonForAppointment: "Stable hypertension follow-up",
    consultationMode: "In Person",
    status: "Checked in",
  },
  {
    id: "APT-2002",
    patientName: "Sana Khan",
    doctorId: "doc-neha-sen",
    departmentId: "dept-radiology",
    appointmentDate: DEMO_REFERENCE_DATE,
    appointmentTime: "10:00",
    reasonForAppointment: "Diagnostic imaging review",
    consultationMode: "In Person",
    status: "In consultation",
  },
  {
    id: "APT-2003",
    patientName: "Maya Joseph",
    doctorId: "doc-anaya-sharma",
    departmentId: "dept-general-medicine",
    appointmentDate: DEMO_REFERENCE_DATE,
    appointmentTime: "10:45",
    reasonForAppointment: "General fever follow-up",
    consultationMode: "In Person",
    status: "Completed",
  },
  {
    id: "APT-2004",
    patientId: "user-patient",
    patientName: "Ritesh Nair",
    doctorId: "doc-meera-iqbal",
    departmentId: "dept-pediatrics",
    appointmentDate: DEMO_REFERENCE_DATE,
    appointmentTime: "11:15",
    reasonForAppointment: "Persistent fever",
    consultationMode: "Online",
    status: "Scheduled",
  },
  {
    id: "APT-2005",
    patientName: "Ishita Das",
    doctorId: "doc-kiran-iyer",
    departmentId: "dept-orthopedics",
    appointmentDate: DEMO_REFERENCE_DATE,
    appointmentTime: "12:10",
    reasonForAppointment: "Knee pain review",
    consultationMode: "In Person",
    status: "Scheduled",
  },
  {
    id: "APT-2006",
    patientName: "Kabir Patel",
    doctorId: "doc-arjun-roy",
    departmentId: "dept-neurology",
    appointmentDate: "2026-08-10",
    appointmentTime: "14:00",
    reasonForAppointment: "Headache and dizziness",
    consultationMode: "In Person",
    status: "Scheduled",
  },
];

const queueSeed: QueueEntryRecord[] = [
  {
    id: "Q-3101",
    patientName: "Aarav Verma",
    departmentId: "dept-cardiology",
    doctorId: "doc-vivek-menon",
    appointmentId: "APT-2001",
    status: "Waiting",
    createdAt: "09:18",
    updatedAt: "09:18",
  },
  {
    id: "Q-3102",
    patientName: "Sana Khan",
    departmentId: "dept-radiology",
    doctorId: "doc-neha-sen",
    appointmentId: "APT-2002",
    status: "In consultation",
    createdAt: "09:48",
    updatedAt: "10:06",
  },
  {
    id: "Q-3103",
    patientName: "Maya Joseph",
    departmentId: "dept-general-medicine",
    doctorId: "doc-anaya-sharma",
    appointmentId: "APT-2003",
    status: "Completed",
    createdAt: "10:11",
    updatedAt: "10:42",
  },
];

const medicalRecordsSeed: MedicalRecordRecord[] = [
  {
    id: "MR-1001",
    patientId: "user-patient",
    patientName: "Ritesh Nair",
    doctorId: "doc-meera-iqbal",
    doctorName: "Dr. Meera Iqbal",
    hospitalId: "org-medivanta-general",
    organizationId: "org-medivanta-general",
    visitDate: "2026-08-05",
    diagnosis: "Seasonal viral fever",
    clinicalNotes:
      "Low-grade fever with fatigue for three days. No respiratory distress observed during review.",
    treatmentAdvice:
      "Continue hydration, paracetamol as advised, and review again if fever persists beyond 48 hours.",
    createdAt: "2026-08-05T11:40:00.000Z",
  },
  {
    id: "MR-1002",
    patientId: "external:aarav-verma",
    patientName: "Aarav Verma",
    doctorId: "doc-vivek-menon",
    doctorName: "Dr. Vivek Menon",
    appointmentId: "APT-2001",
    hospitalId: "org-medivanta-general",
    organizationId: "org-medivanta-general",
    visitDate: DEMO_REFERENCE_DATE,
    diagnosis: "Stable hypertension follow-up",
    clinicalNotes:
      "Blood pressure remains controlled with current regimen. Continue low-sodium diet and exercise plan.",
    treatmentAdvice:
      "Maintain medication adherence and return for cardiology review in six weeks.",
    createdAt: `${DEMO_REFERENCE_DATE}T10:15:00.000Z`,
  },
];

const prescriptionsSeed: PrescriptionRecord[] = [
  {
    id: "RX-2001",
    patientId: "user-patient",
    patientName: "Ritesh Nair",
    doctorId: "doc-meera-iqbal",
    doctorName: "Dr. Meera Iqbal",
    hospitalId: "org-medivanta-general",
    organizationId: "org-medivanta-general",
    medicines: [
      {
        medicineName: "Paracetamol 500 mg",
        dosage: "1 tablet",
        frequency: "Three times daily",
        duration: "3 days",
      },
      {
        medicineName: "Oral rehydration salts",
        dosage: "1 sachet",
        frequency: "As needed",
        duration: "3 days",
      },
    ],
    instructions: "Take after meals and return if fever persists or new symptoms appear.",
    status: "Issued",
    createdAt: "2026-08-05T11:45:00.000Z",
  },
  {
    id: "RX-2002",
    patientId: "external:maya-joseph",
    patientName: "Maya Joseph",
    doctorId: "doc-anaya-sharma",
    doctorName: "Dr. Anaya Sharma",
    appointmentId: "APT-2003",
    hospitalId: "org-medivanta-general",
    organizationId: "org-medivanta-general",
    medicines: [
      {
        medicineName: "Vitamin D3 60,000 IU",
        dosage: "1 capsule",
        frequency: "Weekly",
        duration: "6 weeks",
      },
    ],
    instructions: "Take with food once every week for six weeks.",
    status: "Dispensed",
    createdAt: `${DEMO_REFERENCE_DATE}T10:50:00.000Z`,
    dispensedAt: `${DEMO_REFERENCE_DATE}T12:20:00.000Z`,
    dispensedBy: {
      id: "user-pharmacist",
      name: "Rahul Sethi",
    },
  },
];

const labTestsSeed: LabTestRecord[] = [
  { id: "lab-cbc", name: "Complete Blood Count (CBC)" },
  { id: "lab-glucose", name: "Blood Glucose" },
  { id: "lab-lipid", name: "Lipid Profile" },
  { id: "lab-thyroid", name: "Thyroid Profile" },
  { id: "lab-liver", name: "Liver Function Test" },
  { id: "lab-kidney", name: "Kidney Function Test" },
];

const labRequestsSeed: LabRequestRecord[] = [
  {
    id: "LABREQ-5001",
    patientName: "Ritesh Nair",
    testId: "lab-cbc",
    testName: "Complete Blood Count (CBC)",
    departmentId: "dept-laboratory",
    requestedDate: "2026-08-11",
    requestedTime: "09:00",
    status: "Scheduled",
  },
];

const labReportsSeed: LabReportRecord[] = [];
export const defaultBookingCapacity: BookingCapacityRecord = {
  doctorSlotCapacity: 1,
  defaultMaxAppointmentsPerSession: 6,
  labSlotCapacity: 5,
  sessions: [
    {
      id: "morning",
      label: "Morning",
      startTime: "08:00",
      endTime: "11:59",
      maxAppointments: 6,
    },
    {
      id: "afternoon",
      label: "Afternoon",
      startTime: "12:00",
      endTime: "15:59",
      maxAppointments: 6,
    },
    {
      id: "evening",
      label: "Evening",
      startTime: "16:00",
      endTime: "18:30",
      maxAppointments: 4,
    },
  ],
};

export function normalizeHospitalState(state: HospitalState): HospitalState {
  return {
    ...state,
    doctors: (state.doctors ?? doctorsSeed).map((doctor) => ({
      ...doctor,
      breakWindows: doctor.breakWindows ?? [],
    })),
    appointments: (state.appointments ?? appointmentsSeed).map((appointment) => ({
      ...appointment,
      consultationMode: appointment.consultationMode ?? "In Person",
    })),
    queueEntries: (state.queueEntries ?? queueSeed).map((entry) => ({
      ...entry,
      priority: entry.priority ?? "Normal",
    })),
    medicineCatalog: state.medicineCatalog ?? [],
    medicalRecords: state.medicalRecords ?? medicalRecordsSeed,
    prescriptions: state.prescriptions ?? prescriptionsSeed,
    branches: state.branches ?? branchesSeed,
    invoices: (state.invoices ?? []).map((invoice) => ({
      ...invoice,
      discountCents: invoice.discountCents ?? 0,
      taxCents: invoice.taxCents ?? 0,
    })),
    inventoryItems: state.inventoryItems ?? [],
    notifications: state.notifications ?? [],
    emergencyVisits: state.emergencyVisits ?? [],
    patientJourneys: state.patientJourneys ?? [],
    familyMembers: state.familyMembers ?? [],
    medicalHistoryEntries: state.medicalHistoryEntries ?? [],
    clinicalAttachments: state.clinicalAttachments ?? [],
    telemedicineSessions: state.telemedicineSessions ?? [],
    bookingCapacity: state.bookingCapacity ?? defaultBookingCapacity,
  };
}

export function createInitialHospitalState(): HospitalState {
  return {
    organization: {
      id: "org-medivanta-general",
      name: "MediVanta General Hospital",
      slug: "medivanta-general",
    },
    departments: structuredClone(departmentsSeed),
    branches: structuredClone(branchesSeed),
    doctors: structuredClone(doctorsSeed),
    medicineCatalog: [],
    appointments: structuredClone(appointmentsSeed),
    queueEntries: structuredClone(queueSeed).map((entry) => ({
      ...entry,
      priority: "Normal" as QueuePriority,
    })),
    medicalRecords: structuredClone(medicalRecordsSeed),
    prescriptions: structuredClone(prescriptionsSeed),
    labTests: structuredClone(labTestsSeed),
    labRequests: structuredClone(labRequestsSeed),
    labReports: structuredClone(labReportsSeed),
    invoices: [],
    inventoryItems: [],
    notifications: [],
    emergencyVisits: [],
    patientJourneys: [],
    familyMembers: [],
    medicalHistoryEntries: [],
    clinicalAttachments: [],
    telemedicineSessions: [],
    bookingCapacity: structuredClone(defaultBookingCapacity),
    configuredSupportLines: 9,
  };
}

export function getDepartmentById(state: HospitalState, departmentId: string) {
  return state.departments.find((department) => department.id === departmentId);
}

export function getDoctorById(state: HospitalState, doctorId: string) {
  return state.doctors.find((doctor) => doctor.id === doctorId);
}

export function getAppointmentById(state: HospitalState, appointmentId: string) {
  return state.appointments.find((appointment) => appointment.id === appointmentId);
}

export function getDepartmentSummaries(state: HospitalState) {
  return state.departments.map((department) => {
    const doctors = state.doctors.filter((doctor) => doctor.departmentId === department.id);
    const activeQueueCount = state.queueEntries.filter(
      (entry) => entry.departmentId === department.id && entry.status !== "Completed",
    ).length;

    return {
      ...department,
      availableDoctorCount: doctors.filter((doctor) => doctor.status !== "Off duty").length,
      totalDoctorCount: doctors.length,
      activeQueueCount,
    };
  });
}

export function getActiveQueueEntries(state: HospitalState) {
  const priorityRank: Record<QueuePriority, number> = {
    Emergency: 0,
    Priority: 1,
    Normal: 2,
  };

  return state.queueEntries
    .filter((entry) => entry.status !== "Completed")
    .sort((left, right) => {
      const leftRank = priorityRank[left.priority ?? "Normal"];
      const rightRank = priorityRank[right.priority ?? "Normal"];

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return String(left.createdAt).localeCompare(String(right.createdAt));
    });
}

export function getDashboardMetrics(state: HospitalState) {
  const todaysAppointments = state.appointments.filter(
    (appointment) =>
      appointment.appointmentDate === getCurrentLocalDateIso() &&
      appointment.status !== "Cancelled",
  ).length;
  const activeQueueCount = getActiveQueueEntries(state).length;
  const doctorsOnDuty = state.doctors.filter((doctor) => doctor.status !== "Off duty").length;

  return {
    todaysAppointments,
    activeQueueCount,
    doctorsOnDuty,
    patientSupportLines: state.configuredSupportLines,
  };
}

export function getAllowedAppointmentStatuses(
  status: AppointmentStatus,
): AppointmentStatus[] {
  switch (status) {
    case "Scheduled":
      return ["Checked in", "Cancelled"];
    case "Checked in":
      return ["In consultation", "Completed", "Cancelled"];
    case "In consultation":
      return ["Completed"];
    default:
      return [];
  }
}

export function getAllowedQueueStatuses(status: QueueStatus): QueueStatus[] {
  switch (status) {
    case "Waiting":
      return ["Called"];
    case "Called":
      return ["In consultation"];
    case "In consultation":
      return ["Completed"];
    default:
      return [];
  }
}

export function validateAppointmentDraft(
  state: HospitalState,
  draft: AppointmentDraft,
  editingId?: string,
) {
  const errors: Partial<Record<keyof AppointmentDraft, string>> = {};
  const currentLocalDate = getCurrentLocalDateIso();

  if (draft.patientName.trim().length < 2) {
    errors.patientName = "Enter a patient name with at least 2 characters.";
  }

  const doctor = getDoctorById(state, draft.doctorId);
  if (!doctor) {
    errors.doctorId = "Select a valid doctor.";
  }

  if (draft.branchId) {
    const branch = (state.branches ?? []).find((item) => item.id === draft.branchId);
    if (!branch || !branch.active) {
      errors.branchId = "Select an active hospital branch.";
    } else if (doctor?.branchId && doctor.branchId !== draft.branchId) {
      errors.doctorId = "Select a doctor available at this branch.";
    }
  }

  if (!draft.appointmentDate) {
    errors.appointmentDate = "Select an appointment date.";
  } else if (draft.appointmentDate < currentLocalDate) {
    errors.appointmentDate = "Appointment date cannot be in the past.";
  }

  if (!draft.appointmentTime) {
    errors.appointmentTime = "Select an appointment time.";
  } else if (!/^\d{2}:\d{2}$/.test(draft.appointmentTime)) {
    errors.appointmentTime = "Select a valid appointment time.";
  } else if (draft.appointmentDate && isPastLocalTimeSlot(draft.appointmentDate, draft.appointmentTime)) {
    errors.appointmentTime = "Select a future appointment time.";
  } else if (isClosedAppointmentTimeSlot(draft.appointmentTime)) {
    errors.appointmentTime = "This appointment time is not available. Please choose another slot.";
  } else if (doctor && isDoctorOnBreakAtSlot(doctor, draft.appointmentTime)) {
    errors.appointmentTime = "This doctor is on break at that time. Please choose another slot.";
  }

  if (draft.reasonForAppointment.trim().length < 3) {
    errors.reasonForAppointment = "Please enter the reason for appointment.";
  } else if (draft.reasonForAppointment.trim().length > 280) {
    errors.reasonForAppointment = "Reason for appointment must be 280 characters or fewer.";
  }

  if (
    draft.doctorId &&
    draft.appointmentDate &&
    draft.appointmentTime &&
    isDoctorSlotFullyBooked(
      state,
      draft.doctorId,
      draft.appointmentDate,
      draft.appointmentTime,
      editingId,
    )
  ) {
    errors.appointmentTime = "This time slot is fully booked. Please choose another time.";
  } else if (
    draft.doctorId &&
    draft.appointmentDate &&
    draft.appointmentTime &&
    isDoctorSessionFullyBooked(
      state,
      draft.doctorId,
      draft.appointmentDate,
      draft.appointmentTime,
      editingId,
    )
  ) {
    errors.appointmentTime =
      "This doctor is fully booked for that session. Please choose another time.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateLabRequestDraft(
  state: HospitalState,
  draft: LabRequestDraft,
) {
  const errors: Partial<Record<keyof LabRequestDraft, string>> = {};
  const currentLocalDate = getCurrentLocalDateIso();

  if (!state.labTests.some((test) => test.id === draft.testId)) {
    errors.testId = "Select a valid lab test.";
  }

  if (!draft.requestedDate) {
    errors.requestedDate = "Select a preferred lab date.";
  } else if (draft.requestedDate < currentLocalDate) {
    errors.requestedDate = "Lab test date cannot be in the past.";
  }

  if (!draft.requestedTime) {
    errors.requestedTime = "Select a preferred lab time.";
  } else if (!/^\d{2}:\d{2}$/.test(draft.requestedTime)) {
    errors.requestedTime = "Select a valid lab time.";
  } else if (draft.requestedDate && isPastLocalTimeSlot(draft.requestedDate, draft.requestedTime)) {
    errors.requestedTime = "Select a future lab time.";
  } else if (
    draft.requestedDate &&
    isLabSlotFullyBooked(state, draft.requestedDate, draft.requestedTime)
  ) {
    errors.requestedTime = "This lab slot is fully booked. Please choose another time.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function getSearchGroups(state: HospitalState, query: string): SearchGroup[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  const departments = getDepartmentSummaries(state)
    .filter((department) =>
      [department.name, department.code, department.description, department.location]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    )
    .map((department) => ({
      id: department.id,
      heading: department.name,
      details: `${department.code} - ${department.location} - ${department.activeQueueCount} active in queue`,
      href: "/dashboard/departments",
    }));

  const doctors = state.doctors
    .filter((doctor) =>
      [
        doctor.name,
        doctor.specialization,
        doctor.availability,
        doctor.shiftLabel,
        getDepartmentById(state, doctor.departmentId)?.name ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    )
    .map((doctor) => {
      const department = getDepartmentById(state, doctor.departmentId);

      return {
        id: doctor.id,
        heading: doctor.name,
        details: `${doctor.specialization} - ${department?.name ?? "Department"} - ${doctor.status}`,
        href: "/dashboard/doctors",
      };
    });

  const appointments = state.appointments
    .filter((appointment) =>
      [
        appointment.id,
        appointment.patientName,
        getDoctorById(state, appointment.doctorId)?.name ?? "",
        getDoctorById(state, appointment.doctorId)?.specialization ?? "",
        getDepartmentById(state, appointment.departmentId)?.name ?? "",
        appointment.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    )
    .map((appointment) => ({
      id: appointment.id,
      heading: `${appointment.patientName} - ${appointment.id}`,
      details: `${getDoctorById(state, appointment.doctorId)?.name ?? "Doctor"} - ${appointment.appointmentDate} ${appointment.appointmentTime} - ${appointment.status}`,
      href: "/dashboard/appointments",
    }));

  const queue = state.queueEntries
    .filter((entry) =>
      [
        entry.id,
        entry.patientName,
        getDepartmentById(state, entry.departmentId)?.name ?? "",
        getDoctorById(state, entry.doctorId ?? "")?.name ?? "",
        getDoctorById(state, entry.doctorId ?? "")?.specialization ?? "",
        entry.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    )
    .map((entry) => ({
      id: entry.id,
      heading: `${entry.patientName} - ${entry.id}`,
      details: `${getDepartmentById(state, entry.departmentId)?.name ?? "Department"} - ${entry.status} - Updated ${entry.updatedAt}`,
      href: "/dashboard/queue",
    }));

  return [
    { title: "Departments", items: departments },
    { title: "Doctors", items: doctors },
    { title: "Appointments", items: appointments },
    { title: "Queue", items: queue },
  ].filter((group) => group.items.length > 0);
}

export function createQueueEntryFromAppointment(
  state: HospitalState,
  appointment: AppointmentRecord,
): QueueEntryRecord {
  const nextNumber =
    state.queueEntries.reduce((max, entry) => {
      const parsed = Number(entry.id.replace(/\D/g, ""));
      return Number.isNaN(parsed) ? max : Math.max(max, parsed);
    }, 3100) + 1;

  return {
    id: `Q-${nextNumber}`,
    patientName: appointment.patientName,
    departmentId: appointment.departmentId,
    doctorId: appointment.doctorId,
    appointmentId: appointment.id,
    priority: "Normal",
    status: "Waiting",
    createdAt: appointment.appointmentTime,
    updatedAt: appointment.appointmentTime,
  };
}

export function createAppointmentId(state: HospitalState) {
  const nextNumber =
    state.appointments.reduce((max, appointment) => {
      const parsed = Number(appointment.id.replace(/\D/g, ""));
      return Number.isNaN(parsed) ? max : Math.max(max, parsed);
    }, 2000) + 1;

  return `APT-${nextNumber}`;
}
