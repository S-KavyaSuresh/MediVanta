import createHttpError from "http-errors";
import { randomBytes } from "node:crypto";

import type {
  AppointmentDraft,
  AppointmentRecord,
  AppointmentSlotLoadRecord,
  AppointmentStatus,
  DepartmentRecord,
  DepartmentStatus,
  DoctorStatus,
  HospitalState,
  HospitalStateResponse,
  InventoryItemDraft,
  InventoryItemRecord,
  InvoiceItemRecord,
  InvoiceRecord,
  InvoiceStatus,
  MedicalRecordDraft,
  MedicalRecordRecord,
  LabReportDraft,
  LabReportRecord,
  LabSlotLoadRecord,
  LabRequestDraft,
  LabRequestRecord,
  NotificationRecord,
  PaymentDraft,
  PaymentRecord,
  PrescriptionDraft,
  PrescriptionRecord,
  PrescriptionStatus,
  QueueEntryRecord,
  QueueStatus,
  SafeUser,
  UserRole,
  UserRecord,
} from "../domain/types.js";
import { getPasswordPolicyErrors, hashPassword } from "../auth/password.js";
import { query, withTransaction } from "../db/client.js";
import { loadHospitalState, loadUsers, saveHospitalState, saveUsers } from "./seed-service.js";
import { writeAuditLog } from "./audit-service.js";
import { DEMO_ACCOUNT_PASSWORD } from "./demo-data.js";
import { getCurrentLocalDateIso } from "../utils/date.js";
import { measurePerfStep } from "../utils/perf-trace.js";
import {
  insertAppointment,
  insertInvoice,
  insertInvoiceItems,
  insertInventoryItem,
  insertLabReport,
  insertLabRequest,
  insertMedicalRecord,
  insertNotifications,
  insertPrescription,
  insertQueueEntry,
  loadLabReportById,
  markAllNotificationsRead,
  markNotificationReadById,
  revokeSessionsForUser,
  upsertHospitalSettings,
  updateAppointmentRecord,
  updateAppointmentStatusById,
  updateInventoryItemRecord,
  updateLabRequestStatusById,
  updateMedicalRecordDetails,
  updateQueueEntryById,
  updateQueueEntriesForAppointment,
  updateQueueStatusesByAppointment,
} from "../repositories/postgres-store.js";

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function getCurrentLocalTimeValue(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

function getSlotTimeValue(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isCapacityConsumingAppointment(status: AppointmentStatus) {
  return status !== "Cancelled";
}

function isCapacityConsumingLabRequest(status: LabRequestRecord["status"]) {
  return status !== "Completed";
}

function getSessionForTime(state: HospitalState, time: string) {
  return (
    state.bookingCapacity.sessions.find(
      (session) =>
        getSlotTimeValue(time) >= getSlotTimeValue(session.startTime) &&
        getSlotTimeValue(time) <= getSlotTimeValue(session.endTime),
    ) ?? null
  );
}

function getDoctorSlotBookingCount(
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

function getDoctorSessionBookingCount(
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

function isDoctorSlotFullyBooked(
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

function isDoctorSessionFullyBooked(
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

function getLabSlotBookingCount(
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

function isLabSlotFullyBooked(
  state: HospitalState,
  requestedDate: string,
  requestedTime: string,
) {
  return (
    getLabSlotBookingCount(state, requestedDate, requestedTime) >=
    state.bookingCapacity.labSlotCapacity
  );
}

function isPastLocalAppointmentSlot(date: string, time: string, now = new Date()) {
  const currentDate = getCurrentLocalDateIso(now);

  if (date < currentDate) {
    return true;
  }

  if (date > currentDate) {
    return false;
  }

  return getSlotTimeValue(time) <= getCurrentLocalTimeValue(now);
}

function getDoctorById(state: HospitalState, doctorId: string) {
  return state.doctors.find((doctor) => doctor.id === doctorId);
}

function getAppointmentById(state: HospitalState, appointmentId: string) {
  return state.appointments.find((appointment) => appointment.id === appointmentId);
}

function getPatientDisplayName(user: SafeUser) {
  return user.patientName ?? user.displayName;
}

function getUserOrganizationId(user: SafeUser, state: HospitalState) {
  return user.organizationId || state.organization.id;
}

function normalizePersonKey(value: string) {
  return value.trim().toLowerCase();
}

function createExternalPatientId(patientName: string) {
  return `external:${normalizePersonKey(patientName).replace(/[^a-z0-9]+/g, "-")}`;
}

function getDoctorScopedAppointments(state: HospitalState, doctorId?: string) {
  if (!doctorId) {
    return [];
  }

  return state.appointments.filter((appointment) => appointment.doctorId === doctorId);
}

async function getDoctorScopedPatients(
  state: HospitalState,
  user: SafeUser,
  usersOverride?: UserRecord[],
) {
  const users = usersOverride ?? (await loadUsers());
  const scoped = new Map<
    string,
    {
      patientId: string;
      patientName: string;
      appointmentIds: Set<string>;
    }
  >();

  for (const appointment of getDoctorScopedAppointments(state, user.doctorId)) {
    const matchedUser =
      appointment.patientId
        ? users.find(
            (currentUser) =>
              currentUser.role === "patient" &&
              currentUser.organizationId === user.organizationId &&
              currentUser.id === appointment.patientId,
          )
        : users.find(
            (currentUser) =>
              currentUser.role === "patient" &&
              currentUser.organizationId === user.organizationId &&
              normalizePersonKey(currentUser.patientName ?? currentUser.displayName) ===
                normalizePersonKey(appointment.patientName),
          );
    const patientId =
      appointment.patientId ?? matchedUser?.id ?? createExternalPatientId(appointment.patientName);
    const existing = scoped.get(patientId);

    if (existing) {
      existing.appointmentIds.add(appointment.id);
      continue;
    }

    scoped.set(patientId, {
      patientId,
      patientName: appointment.patientName,
      appointmentIds: new Set([appointment.id]),
    });
  }

  for (const currentUser of users) {
    if (
      currentUser.role !== "patient" ||
      currentUser.organizationId !== user.organizationId ||
      currentUser.assignedDoctorId !== user.doctorId
    ) {
      continue;
    }

    const patientId = currentUser.id;
    const existing = scoped.get(patientId);

    if (existing) {
      continue;
    }

    scoped.set(patientId, {
      patientId,
      patientName: currentUser.patientName ?? currentUser.displayName,
      appointmentIds: new Set<string>(),
    });
  }

  return scoped;
}

function getAppointmentSlotLoads(state: HospitalState, organizationId: string): AppointmentSlotLoadRecord[] {
  const grouped = new Map<string, AppointmentSlotLoadRecord>();

  for (const appointment of state.appointments) {
    if (
      appointment.organizationId !== organizationId ||
      !isCapacityConsumingAppointment(appointment.status)
    ) {
      continue;
    }

    const key = `${appointment.doctorId}|${appointment.appointmentDate}|${appointment.appointmentTime}`;
    const current = grouped.get(key);

    if (current) {
      current.bookings += 1;
      continue;
    }

    grouped.set(key, {
      doctorId: appointment.doctorId,
      appointmentDate: appointment.appointmentDate,
      appointmentTime: appointment.appointmentTime,
      bookings: 1,
    });
  }

  return [...grouped.values()];
}

function getLabSlotLoads(state: HospitalState, organizationId: string): LabSlotLoadRecord[] {
  const grouped = new Map<string, LabSlotLoadRecord>();

  for (const request of state.labRequests) {
    if (
      request.organizationId !== organizationId ||
      !isCapacityConsumingLabRequest(request.status)
    ) {
      continue;
    }

    const key = `${request.requestedDate}|${request.requestedTime}`;
    const current = grouped.get(key);

    if (current) {
      current.bookings += 1;
      continue;
    }

    grouped.set(key, {
      requestedDate: request.requestedDate,
      requestedTime: request.requestedTime,
      bookings: 1,
    });
  }

  return [...grouped.values()];
}

function stripLabReportAttachmentContent(report: LabReportRecord): LabReportRecord {
  return report.attachment?.contentBase64
    ? {
        ...report,
        attachment: {
          ...report.attachment,
          contentBase64: undefined,
        },
      }
    : report;
}

function toSafeUserSummary(user: {
  passwordHash: string;
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
  emailVerified?: boolean;
  passwordResetRequired?: boolean;
}) {
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    doctorId: user.doctorId,
    assignedDoctorId: user.assignedDoctorId,
    patientName: user.patientName,
    departmentId: user.departmentId,
    staffStatus: user.staffStatus,
    phoneNumber: user.phoneNumber,
    gender: user.gender,
    dateOfBirth: user.dateOfBirth,
    bloodGroup: user.bloodGroup,
    address: user.address,
    emergencyContact: user.emergencyContact,
    emergencyContactName: user.emergencyContactName,
    emergencyContactPhone: user.emergencyContactPhone,
    allergies: user.allergies,
    medicalConditions: user.medicalConditions,
    preferredLanguage: user.preferredLanguage,
    qualifications: user.qualifications,
    experience: user.experience,
    languages: user.languages,
    consultationFee: user.consultationFee,
    availableTimings: user.availableTimings,
    deskLabel: user.deskLabel,
    designation: user.designation,
    shift: user.shift,
    professionalRegistrationNumber: user.professionalRegistrationNumber,
    consultationMode: user.consultationMode,
    profileVerificationStatus: user.profileVerificationStatus,
    administrativeUnit: user.administrativeUnit,
    emailVerified: user.emailVerified,
    passwordResetRequired: user.passwordResetRequired,
  };
}

function sanitizeAttachmentFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function isPdfPayload(contentBase64: string) {
  try {
    const header = Buffer.from(contentBase64, "base64").subarray(0, 5).toString("utf8");
    return header === "%PDF-";
  } catch {
    return false;
  }
}

function createAppointmentId(state: HospitalState) {
  const nextNumber =
    state.appointments.reduce((max, appointment) => {
      const parsed = Number(appointment.id.replace(/\D/g, ""));
      return Number.isNaN(parsed) ? max : Math.max(max, parsed);
    }, 2000) + 1;

  return `APT-${nextNumber}`;
}

function createQueueEntryFromAppointment(
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
    organizationId: appointment.organizationId,
    patientName: appointment.patientName,
    departmentId: appointment.departmentId,
    doctorId: appointment.doctorId,
    appointmentId: appointment.id,
    status: "Waiting",
    createdAt: appointment.appointmentTime,
    updatedAt: appointment.appointmentTime,
  };
}

function createLabRequestId(state: HospitalState) {
  const nextNumber =
    state.labRequests.reduce((max, request) => {
      const parsed = Number(request.id.replace(/\D/g, ""));
      return Number.isNaN(parsed) ? max : Math.max(max, parsed);
    }, 5000) + 1;

  return `LABREQ-${nextNumber}`;
}

function createLabReportId(state: HospitalState) {
  const nextNumber =
    state.labReports.reduce((max, report) => {
      const parsed = Number(report.id.replace(/\D/g, ""));
      return Number.isNaN(parsed) ? max : Math.max(max, parsed);
    }, 7000) + 1;

  return `LABRPT-${nextNumber}`;
}

function createMedicalRecordId() {
  return `MR-${Date.now()}-${randomBytes(3).toString("hex")}`;
}

function createPrescriptionId() {
  return `RX-${Date.now()}-${randomBytes(3).toString("hex")}`;
}

function createInvoiceId() {
  return `INV-${Date.now()}-${randomBytes(3).toString("hex")}`;
}

function createInvoiceNumber() {
  return `MV-INV-${Date.now().toString().slice(-8)}`;
}

function createPaymentId() {
  return `PAY-${Date.now()}-${randomBytes(3).toString("hex")}`;
}

function createInventoryItemId() {
  return `INVSTOCK-${Date.now()}-${randomBytes(3).toString("hex")}`;
}

function createNotificationId() {
  return `NOTIFY-${Date.now()}-${randomBytes(3).toString("hex")}`;
}

function parseCurrencyTextToCents(value?: string) {
  const match = value?.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return 90000;
  }

  return Math.round(Number(match[1]) * 100);
}

function buildPrescriptionMedicineLabel(
  medicine: Pick<PrescriptionRecord["medicines"][number], "medicineName" | "strength">,
) {
  return [medicine.medicineName.trim(), medicine.strength?.trim() ?? ""]
    .filter(Boolean)
    .join(" ");
}

function normalizePrescriptionMedicine(
  medicine: PrescriptionRecord["medicines"][number],
) {
  const normalizedMedicineName = medicine.medicineName.trim();
  const normalizedStrength =
    medicine.strength?.trim() && !["-", "--"].includes(medicine.strength.trim())
      ? medicine.strength.trim()
      : undefined;
  const normalizedDoseQuantity = medicine.doseQuantity ? Math.max(1, Math.round(medicine.doseQuantity)) : undefined;
  const normalizedDoseUnit = medicine.doseUnit?.trim() || undefined;
  const normalizedFrequency = medicine.frequency.trim();
  const normalizedDurationValue = medicine.durationValue ? Math.max(1, Math.round(medicine.durationValue)) : undefined;
  const normalizedDurationUnit = medicine.durationUnit?.trim() || undefined;
  const normalizedTotalQuantity = medicine.totalQuantity ? Math.max(1, Math.round(medicine.totalQuantity)) : undefined;
  const normalizedInstructions = medicine.instructions?.trim() || undefined;
  const dosage =
    normalizedDoseQuantity && normalizedDoseUnit
      ? `${normalizedDoseQuantity} ${normalizedDoseUnit}`
      : medicine.dosage.trim();
  const duration =
    normalizedDurationValue && normalizedDurationUnit
      ? `${normalizedDurationValue} ${normalizedDurationUnit}`
      : medicine.duration.trim();

  return {
    medicineId: medicine.medicineId?.trim() || undefined,
    medicineName: normalizedMedicineName,
    strength: normalizedStrength,
    doseQuantity: normalizedDoseQuantity,
    doseUnit: normalizedDoseUnit,
    dosage,
    frequency: normalizedFrequency,
    durationValue: normalizedDurationValue,
    durationUnit: normalizedDurationUnit,
    duration,
    totalQuantity: normalizedTotalQuantity,
    instructions: normalizedInstructions,
  } satisfies PrescriptionRecord["medicines"][number];
}

function getAdministrationsPerDay(frequency: string) {
  const normalizedFrequency = frequency.trim().toLowerCase();

  if (normalizedFrequency.includes("once")) {
    return 1;
  }

  if (normalizedFrequency.includes("twice")) {
    return 2;
  }

  if (normalizedFrequency.includes("three")) {
    return 3;
  }

  if (normalizedFrequency.includes("four")) {
    return 4;
  }

  const match = normalizedFrequency.match(/\d+/);
  if (match) {
    return Math.max(1, Number(match[0]));
  }

  return 1;
}

function resolveMedicineTotalQuantity(
  medicine: PrescriptionRecord["medicines"][number],
) {
  const explicitTotalQuantity =
    medicine.totalQuantity && medicine.totalQuantity > 0
      ? Math.max(1, Math.round(medicine.totalQuantity))
      : undefined;
  const doseQuantity =
    medicine.doseQuantity && medicine.doseQuantity > 0
      ? Math.max(1, Math.round(medicine.doseQuantity))
      : undefined;
  const durationValue =
    medicine.durationValue && medicine.durationValue > 0
      ? Math.max(1, Math.round(medicine.durationValue))
      : undefined;
  const normalizedFrequency = medicine.frequency.trim().toLowerCase();
  const normalizedDurationUnit = medicine.durationUnit?.trim().toLowerCase() ?? "";

  if (normalizedFrequency.includes("as needed")) {
    return explicitTotalQuantity;
  }

  if (normalizedDurationUnit.startsWith("month")) {
    return explicitTotalQuantity;
  }

  if (doseQuantity && durationValue) {
    if (normalizedFrequency.includes("weekly")) {
      if (normalizedDurationUnit.startsWith("week")) {
        return Math.max(1, doseQuantity * durationValue);
      }

      if (normalizedDurationUnit.startsWith("day")) {
        return Math.max(1, doseQuantity * Math.ceil(durationValue / 7));
      }
    }

    const durationDays = normalizedDurationUnit.startsWith("week") ? durationValue * 7 : durationValue;
    const calculatedQuantity = doseQuantity * getAdministrationsPerDay(medicine.frequency) * durationDays;
    return Math.max(1, calculatedQuantity);
  }

  return explicitTotalQuantity;
}

function getMedicineRequiredQuantity(medicine: PrescriptionRecord["medicines"][number]) {
  return resolveMedicineTotalQuantity(medicine) ?? 1;
}

function requiresManualPrescriptionQuantity(
  medicine: Pick<PrescriptionRecord["medicines"][number], "frequency" | "durationUnit">,
) {
  const normalizedFrequency = medicine.frequency.trim().toLowerCase();
  const normalizedDurationUnit = medicine.durationUnit?.trim().toLowerCase() ?? "";

  return normalizedFrequency.includes("as needed") || normalizedDurationUnit.startsWith("month");
}

function getMedicineInventoryKey(
  medicine: Pick<PrescriptionRecord["medicines"][number], "medicineId" | "medicineName" | "strength" | "doseUnit">,
) {
  if (medicine.medicineId?.trim()) {
    return `id:${medicine.medicineId.trim()}`;
  }

  return `${buildPrescriptionMedicineLabel(medicine).trim().toLowerCase()}|${medicine.doseUnit?.trim().toLowerCase() ?? ""}`;
}

function getInventoryItemKey(item: InventoryItemRecord) {
  if (item.medicineId?.trim()) {
    return `id:${item.medicineId.trim()}`;
  }

  return `${item.medicineName.trim().toLowerCase()}|${item.unit.trim().toLowerCase()}`;
}

function getMedicineUnitPriceCents(
  medicine: PrescriptionRecord["medicines"][number],
  inventoryItems: InventoryItemRecord[],
) {
  const matchingItem = inventoryItems.find((item) => getInventoryItemKey(item) === getMedicineInventoryKey(medicine));

  if (matchingItem) {
    return matchingItem.unitPriceCents;
  }

  return 2500;
}

function normalizeCatalogText(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

async function ensureMedicineCatalogEntry(input: {
  organizationId: string;
  medicineName: string;
  strength?: string;
  unit: string;
  genericName?: string;
}) {
  const normalizedName = normalizeCatalogText(input.medicineName);
  const normalizedStrength = normalizeCatalogText(input.strength);
  const normalizedUnit = normalizeCatalogText(input.unit);
  const existingResult = await query<{
    id: string;
    organization_id: string;
    name: string;
    strength: string | null;
    unit: string;
    generic_name: string | null;
    active: boolean;
    created_at: string | Date;
    updated_at: string | Date;
  }>(
    `select * from medicine_catalog
     where organization_id = $1
       and normalized_name = $2
       and normalized_strength = $3
       and normalized_unit = $4
     limit 1`,
    [input.organizationId, normalizedName, normalizedStrength, normalizedUnit],
  );

  if (existingResult.rows[0]) {
    const row = existingResult.rows[0];
    return {
      id: String(row.id),
      organizationId: String(row.organization_id),
      name: String(row.name),
      strength: row.strength ? String(row.strength) : undefined,
      unit: String(row.unit),
      genericName: row.generic_name ? String(row.generic_name) : undefined,
      active: Boolean(row.active),
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
  }

  const createdAt = new Date().toISOString();
  const id = `MEDCAT-${randomBytes(6).toString("hex")}`;
  await query(
    `insert into medicine_catalog (
      id, organization_id, name, strength, unit, generic_name, active,
      normalized_name, normalized_strength, normalized_unit, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, $10)`,
    [
      id,
      input.organizationId,
      input.medicineName.trim(),
      input.strength?.trim() || null,
      input.unit.trim(),
      input.genericName?.trim() || null,
      normalizedName,
      normalizedStrength,
      normalizedUnit,
      createdAt,
    ],
  );

  return {
    id,
    organizationId: input.organizationId,
    name: input.medicineName.trim(),
    strength: input.strength?.trim() || undefined,
    unit: input.unit.trim(),
    genericName: input.genericName?.trim() || undefined,
    active: true,
    createdAt,
    updatedAt: createdAt,
  };
}

async function reconcileMissingInvoices(state: HospitalState) {
  const createdInvoices: InvoiceRecord[] = [];

  for (const request of state.labRequests) {
    const hasInvoice = state.invoices.some(
      (invoice) =>
        invoice.organizationId === request.organizationId &&
        invoice.sourceType === "lab-request" &&
        invoice.sourceId === request.id,
    );

    if (hasInvoice) {
      continue;
    }

    const labTest = state.labTests.find((test) => test.id === request.testId);
    if (!labTest) {
      continue;
    }

    const invoice = buildInvoiceRecord({
      patientId: request.patientId,
      patientName: request.patientName,
      organizationId: request.organizationId,
      hospitalId: request.hospitalId,
      sourceType: "lab-request",
      sourceId: request.id,
      dueDate: request.requestedDate,
      items: [
        {
          description: request.testName,
          category: "Laboratory",
          quantity: 1,
          unitAmountCents: labTest.priceCents ?? 0,
        },
      ],
    });

    await insertInvoice(invoice);
    await insertInvoiceItems(invoice.items);
    createdInvoices.push(invoice);
  }

  return createdInvoices;
}

function buildInvoiceStatus(totalCents: number, amountPaidCents: number): InvoiceStatus {
  if (amountPaidCents <= 0) {
    return "Pending";
  }

  if (amountPaidCents >= totalCents) {
    return "Paid";
  }

  return "Partially Paid";
}

function getScopedInvoicesForUser(user: SafeUser, state: HospitalState) {
  if (user.role === "patient") {
    return state.invoices.filter((invoice) => invoice.patientId === user.id);
  }

  if (user.role === "administrator" || user.role === "receptionist") {
    return state.invoices.filter((invoice) => invoice.organizationId === user.organizationId);
  }

  return [];
}

function getScopedNotificationsForUser(user: SafeUser, state: HospitalState) {
  return state.notifications.filter(
    (notification) =>
      notification.organizationId === user.organizationId && notification.userId === user.id,
  );
}

function buildInvoiceStateWithUpdates(
  state: HospitalState,
  updatedInvoices: InvoiceRecord[],
) {
  if (updatedInvoices.length === 0) {
    return state;
  }

  const updatedInvoiceIds = new Set(updatedInvoices.map((invoice) => invoice.id));
  return {
    ...state,
    invoices: [
      ...updatedInvoices,
      ...state.invoices.filter((invoice) => !updatedInvoiceIds.has(invoice.id)),
    ],
  };
}

async function repairBrokenZeroValueInvoices(state: HospitalState) {
  const repairedInvoices: InvoiceRecord[] = [];

  for (const invoice of state.invoices) {
    if (
      invoice.sourceType !== "lab-request" ||
      invoice.paymentStatus === "Paid" ||
      invoice.totalCents > 0 ||
      invoice.amountDueCents > 0 ||
      invoice.items.length === 0
    ) {
      continue;
    }

    const linkedRequest = state.labRequests.find(
      (request) =>
        request.id === invoice.sourceId &&
        request.organizationId === invoice.organizationId,
    );
    const linkedTest = linkedRequest
      ? state.labTests.find(
          (test) =>
            test.id === linkedRequest.testId &&
            test.organizationId === invoice.organizationId,
        )
      : null;
    const configuredPriceCents = linkedTest?.priceCents ?? 0;

    if (configuredPriceCents <= 0) {
      continue;
    }

    const updatedItems = invoice.items.map((item) => ({
      ...item,
      unitAmountCents: configuredPriceCents,
      totalAmountCents: item.quantity * configuredPriceCents,
    }));
    const subtotalCents = updatedItems.reduce(
      (sum, item) => sum + item.totalAmountCents,
      0,
    );
    const amountDueCents = Math.max(0, subtotalCents - invoice.amountPaidCents);
    const paymentStatus = buildInvoiceStatus(subtotalCents, invoice.amountPaidCents);
    const updatedInvoice: InvoiceRecord = {
      ...invoice,
      subtotalCents,
      totalCents: subtotalCents,
      amountDueCents,
      paymentStatus,
      items: updatedItems,
    };

    await withTransaction(async (client) => {
      for (const item of updatedItems) {
        await client.query(
          `update invoice_items
           set unit_amount_cents = $3,
               total_amount_cents = $4
           where id = $1 and invoice_id = $2`,
          [item.id, item.invoiceId, item.unitAmountCents, item.totalAmountCents],
        );
      }

      await client.query(
        `update invoices
         set subtotal_cents = $3,
             total_cents = $4,
             amount_due_cents = $5,
             payment_status = $6,
             updated_at = now()
         where id = $1 and organization_id = $2`,
        [
          updatedInvoice.id,
          updatedInvoice.organizationId,
          updatedInvoice.subtotalCents,
          updatedInvoice.totalCents,
          updatedInvoice.amountDueCents,
          updatedInvoice.paymentStatus,
        ],
      );
    });

    repairedInvoices.push(updatedInvoice);
  }

  return repairedInvoices;
}

async function notifyUsers(input: {
  organizationId: string;
  userIds: string[];
  title: string;
  message: string;
  category: NotificationRecord["category"];
  relatedEntityType?: string;
  relatedEntityId?: string;
}) {
  const createdAt = new Date().toISOString();
  const requestedUserIds = [...new Set(input.userIds.filter(Boolean))];

  if (requestedUserIds.length === 0) {
    return [] as NotificationRecord[];
  }

  const existingUsersResult = await query<{ id: string }>(
    `select id from users where organization_id = $1 and id = any($2::text[])`,
    [input.organizationId, requestedUserIds],
  );
  const validUserIds = new Set(existingUsersResult.rows.map((row) => String(row.id)));
  const uniqueUserIds = requestedUserIds.filter((userId) => validUserIds.has(userId));

  if (uniqueUserIds.length === 0) {
    return [] as NotificationRecord[];
  }

  const notifications = uniqueUserIds.map((userId) => ({
    id: createNotificationId(),
    userId,
    organizationId: input.organizationId,
    title: input.title,
    message: input.message,
    category: input.category,
    relatedEntityType: input.relatedEntityType,
    relatedEntityId: input.relatedEntityId,
    read: false,
    createdAt,
  })) satisfies NotificationRecord[];

  await insertNotifications(notifications);
  return notifications;
}

function buildInvoiceRecord(input: {
  patientId: string;
  patientName: string;
  organizationId: string;
  hospitalId: string;
  sourceType: InvoiceRecord["sourceType"];
  sourceId: string;
  dueDate?: string;
  items: Array<{
    description: string;
    category: InvoiceItemRecord["category"];
    quantity: number;
    unitAmountCents: number;
  }>;
}) {
  const invoiceId = createInvoiceId();
  const mappedItems: InvoiceItemRecord[] = input.items.map((item) => ({
    id: `INVITEM-${randomBytes(4).toString("hex")}`,
    invoiceId,
    organizationId: input.organizationId,
    description: item.description,
    category: item.category,
    quantity: item.quantity,
    unitAmountCents: item.unitAmountCents,
    totalAmountCents: item.quantity * item.unitAmountCents,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  }));
  const subtotalCents = mappedItems.reduce((sum, item) => sum + item.totalAmountCents, 0);

  return {
    id: invoiceId,
    invoiceNumber: createInvoiceNumber(),
    patientId: input.patientId,
    patientName: input.patientName,
    organizationId: input.organizationId,
    hospitalId: input.hospitalId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    createdAt: new Date().toISOString(),
    dueDate: input.dueDate,
    subtotalCents,
    totalCents: subtotalCents,
    amountPaidCents: 0,
    amountDueCents: subtotalCents,
    paymentStatus: "Pending" as InvoiceStatus,
    items: mappedItems,
    payments: [],
  } satisfies InvoiceRecord;
}

function getAllowedLabRequestStatuses(status: LabRequestRecord["status"]): LabRequestRecord["status"][] {
  switch (status) {
    case "Requested":
      return ["Scheduled"];
    case "Scheduled":
      return ["Sample Collected"];
    case "Sample Collected":
      return ["Processing"];
    default:
      return [];
  }
}

function getScopedLabRequestsForUser(user: SafeUser, state: HospitalState) {
  if (user.role === "patient") {
    return state.labRequests.filter(
      (request) =>
        request.patientId === user.id || request.patientName === (user.patientName ?? user.displayName),
    );
  }

  if (user.role === "laboratory" || user.role === "administrator" || user.role === "receptionist") {
    return state.labRequests.filter((request) => request.organizationId === user.organizationId);
  }

  if (user.role === "doctor") {
    const patientNames = new Set(
      state.appointments
        .filter((appointment) => appointment.doctorId === user.doctorId)
        .map((appointment) => appointment.patientName),
    );

    return state.labRequests.filter((request) => patientNames.has(request.patientName));
  }

  return [];
}

function validateAppointmentDraft(
  state: HospitalState,
  draft: AppointmentDraft,
  editingId?: string,
) {
  const errors: Partial<Record<keyof AppointmentDraft, string>> = {};

  if (draft.patientName.trim().length < 2) {
    errors.patientName = "Enter a patient name with at least 2 characters.";
  }

  const doctor = getDoctorById(state, draft.doctorId);
  if (!doctor) {
    errors.doctorId = "Select a valid doctor.";
  }

  if (!draft.appointmentDate) {
    errors.appointmentDate = "Select an appointment date.";
  } else if (draft.appointmentDate < getCurrentLocalDateIso()) {
    errors.appointmentDate = "Appointment date cannot be in the past.";
  }

  if (!draft.appointmentTime) {
    errors.appointmentTime = "Select an appointment time.";
  } else if (!/^\d{2}:\d{2}$/.test(draft.appointmentTime)) {
    errors.appointmentTime = "Select a valid appointment time.";
  } else if (draft.appointmentDate && isPastLocalAppointmentSlot(draft.appointmentDate, draft.appointmentTime)) {
    errors.appointmentTime = "Select a future appointment time.";
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

function getAllowedAppointmentStatuses(status: AppointmentStatus): AppointmentStatus[] {
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

function getAllowedQueueStatuses(status: QueueStatus): QueueStatus[] {
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

function validateLabRequestDraft(state: HospitalState, draft: LabRequestDraft) {
  const errors: Partial<Record<keyof LabRequestDraft, string>> = {};
  const currentDate = getCurrentLocalDateIso();

  const test = state.labTests.find((currentTest) => currentTest.id === draft.testId);
  if (!test) {
    errors.testId = "Select a valid lab test.";
  }

  if (!draft.requestedDate) {
    errors.requestedDate = "Select a preferred lab date.";
  } else if (draft.requestedDate < currentDate) {
    errors.requestedDate = "Lab test date cannot be in the past.";
  }

  if (!draft.requestedTime) {
    errors.requestedTime = "Select a preferred lab time.";
  } else if (!/^\d{2}:\d{2}$/.test(draft.requestedTime)) {
    errors.requestedTime = "Select a valid lab time.";
  } else if (draft.requestedDate && isPastLocalAppointmentSlot(draft.requestedDate, draft.requestedTime)) {
    errors.requestedTime = "Select a future lab time.";
  } else if (draft.requestedDate && isLabSlotFullyBooked(state, draft.requestedDate, draft.requestedTime)) {
    errors.requestedTime = "This lab slot is fully booked. Please choose another time.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function validateLabReportDraft(draft: LabReportDraft) {
  const errors: Partial<Record<keyof LabReportDraft, string>> = {};

  if (draft.reportTitle.trim().length < 3) {
    errors.reportTitle = "Enter a report title with at least 3 characters.";
  }

  if (draft.resultSummary.trim().length < 12) {
    errors.resultSummary = "Enter a clearer result summary for the patient record.";
  }

  if (draft.attachment) {
    const attachmentPayload = draft.attachment.contentBase64?.trim() ?? "";

    if (draft.attachment.contentType !== "application/pdf") {
      errors.attachment = "Only PDF report files are supported.";
    }

    if (draft.attachment.fileSize > 2 * 1024 * 1024) {
      errors.attachment = "PDF reports must be 2 MB or smaller.";
    }

    if (!attachmentPayload) {
      errors.attachment = "The uploaded PDF file could not be processed.";
    }

    if (sanitizeAttachmentFileName(draft.attachment.fileName) !== draft.attachment.fileName) {
      errors.attachment = "Use a PDF file name without unsupported characters.";
    }

    if (attachmentPayload && !isPdfPayload(attachmentPayload)) {
      errors.attachment = "Only valid PDF report files are supported.";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function validateMedicalRecordDraft(draft: MedicalRecordDraft) {
  const errors: Partial<Record<keyof MedicalRecordDraft, string>> = {};

  if (!draft.patientId.trim()) {
    errors.patientId = "Select a valid patient.";
  }

  if (!draft.visitDate) {
    errors.visitDate = "Select the visit date.";
  }

  if (draft.diagnosis.trim().length < 1) {
    errors.diagnosis = "Diagnosis is required.";
  }

  if (draft.clinicalNotes.trim().length < 1) {
    errors.clinicalNotes = "Clinical notes are required.";
  }

  if (draft.treatmentAdvice.trim().length < 1) {
    errors.treatmentAdvice = "Treatment or advice is required.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function validatePrescriptionDraft(draft: PrescriptionDraft) {
  const errors: Record<string, string> = {};

  if (!draft.patientId.trim()) {
    errors.patientId = "Select a valid patient.";
  }

  if (draft.medicines.length === 0) {
    errors.medicines = "Add at least one medicine to the prescription.";
  }

  for (const [index, medicine] of draft.medicines.entries()) {
    if (!medicine.medicineId?.trim()) {
      errors[`medicines.${index}.medicineId`] = "Select a medicine from the hospital catalog.";
    }

    if (!medicine.medicineName.trim()) {
      errors[`medicines.${index}.medicineName`] = "Medicine name is required.";
    }

    if (!medicine.doseQuantity || medicine.doseQuantity <= 0) {
      errors[`medicines.${index}.doseQuantity`] = "Dose quantity is required.";
    }

    if (!medicine.doseUnit?.trim()) {
      errors[`medicines.${index}.doseUnit`] = "Dose unit is required.";
    }

    if (!medicine.frequency.trim()) {
      errors[`medicines.${index}.frequency`] = "Frequency is required.";
    }

    if (!medicine.durationValue || medicine.durationValue <= 0) {
      errors[`medicines.${index}.durationValue`] = "Duration is required.";
    }

    if (!medicine.durationUnit?.trim()) {
      errors[`medicines.${index}.durationUnit`] = "Duration unit is required.";
    }

    if (requiresManualPrescriptionQuantity(medicine)) {
      if (!medicine.totalQuantity || medicine.totalQuantity <= 0) {
        errors[`medicines.${index}.totalQuantity`] = "Total quantity is required.";
      }
    } else {
      const resolvedQuantity = resolveMedicineTotalQuantity(normalizePrescriptionMedicine(medicine));
      if (!resolvedQuantity || resolvedQuantity <= 0) {
        errors[`medicines.${index}.totalQuantity`] = "Total quantity could not be calculated.";
      }
    }
  }

  if (!draft.instructions.trim()) {
    errors.instructions = "Instructions are required.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function normalizePrescriptionDraft(draft: PrescriptionDraft): PrescriptionDraft {
  return {
    patientId: draft.patientId.trim(),
    appointmentId: draft.appointmentId?.trim() || undefined,
    medicines: draft.medicines.map((medicine) => {
      const normalizedMedicine = normalizePrescriptionMedicine(medicine);
      const resolvedQuantity = resolveMedicineTotalQuantity(normalizedMedicine);

      return {
        ...normalizedMedicine,
        totalQuantity: resolvedQuantity,
      };
    }),
    instructions: draft.instructions.trim(),
  };
}

function canEditMedicalRecord(record: MedicalRecordRecord, user: SafeUser, now = Date.now()) {
  if (user.role !== "doctor" || record.doctorId !== user.doctorId) {
    return false;
  }

  const createdAt = new Date(record.createdAt).getTime();
  if (Number.isNaN(createdAt)) {
    return false;
  }

  return now - createdAt <= 3 * 60 * 60 * 1000;
}

type PatientProfileDraft = {
  fullName: string;
  email: string;
  phoneNumber: string;
  gender: string;
  dateOfBirth: string;
  bloodGroup: string;
  preferredLanguage?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  allergies: string;
  medicalConditions: string;
  password: string;
  confirmPassword: string;
};

type UserProfileDraft = {
  fullName: string;
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
};

function formatStructuredAddress(input: {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  fallbackAddress?: string;
}) {
  const parts = [
    input.addressLine1?.trim(),
    input.addressLine2?.trim(),
    input.city?.trim(),
    input.state?.trim(),
    input.postalCode?.trim(),
  ].filter((value): value is string => Boolean(value));

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return input.fallbackAddress?.trim() || undefined;
}

function normalizeEmergencyContactFields(input: {
  emergencyContact?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}) {
  const explicitName = input.emergencyContactName?.trim() ?? "";
  const explicitPhoneRaw = input.emergencyContactPhone?.trim() ?? "";
  const explicitPhone = /[\d+()\-\s]{7,}/.test(explicitPhoneRaw) ? explicitPhoneRaw : "";
  const legacyValue = input.emergencyContact?.trim() ?? "";
  const splitValues = legacyValue
    .split(/[·•|,/]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const phoneCandidate = splitValues.find((value) => /[\d+()\-\s]{7,}/.test(value));
  const nameCandidate = splitValues.find((value) => value !== phoneCandidate) ?? "";
  const legacyIsPhoneOnly = !nameCandidate && /[\d+()\-\s]{7,}/.test(legacyValue);

  return {
    emergencyContactName:
      explicitName || (!legacyIsPhoneOnly ? nameCandidate || legacyValue : "") || undefined,
    emergencyContactPhone: explicitPhone || phoneCandidate || (legacyIsPhoneOnly ? legacyValue : "") || undefined,
  };
}

function validatePatientProfileBirthDate(dateOfBirth: string) {
  const date = new Date(dateOfBirth);
  const minDate = new Date("1900-01-01T00:00:00.000Z");
  const maxDate = new Date(`${getCurrentLocalDateIso()}T23:59:59.999Z`);

  return !Number.isNaN(date.getTime()) && date >= minDate && date <= maxDate;
}

function validatePatientProfileDraft(
  users: UserRecord[],
  organizationId: string,
  draft: PatientProfileDraft,
) {
  const errors: Record<string, string> = {};
  const normalizedEmail = draft.email.trim().toLowerCase();
  const normalizedPhone = draft.phoneNumber.trim();
  const passwordErrors = getPasswordPolicyErrors(draft.password);

  if (!draft.fullName.trim()) {
    errors.fullName = "Full name is required.";
  } else if (draft.fullName.trim().length < 2) {
    errors.fullName = "Enter a full name with at least 2 characters.";
  }

  if (!normalizedEmail) {
    errors.email = "Email address is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    errors.email = "Enter a valid email address.";
  }

  if (
    users.some(
      (user) =>
        user.organizationId === organizationId &&
        user.email.toLowerCase() === normalizedEmail,
    )
  ) {
    errors.email = "An account with this email already exists.";
  }

  if (!normalizedPhone) {
    errors.phoneNumber = "Phone number is required.";
  } else if (normalizedPhone.length < 7) {
    errors.phoneNumber = "Enter a valid phone number.";
  } else if (
    users.some(
      (user) =>
        user.organizationId === organizationId &&
        user.role === "patient" &&
        user.phoneNumber?.trim() === normalizedPhone,
    )
  ) {
    errors.phoneNumber = "A patient profile already exists with that phone number.";
  }

  if (draft.gender.trim().length < 1) {
    errors.gender = "Select a gender.";
  }

  if (!validatePatientProfileBirthDate(draft.dateOfBirth)) {
    errors.dateOfBirth = "Enter a valid date of birth.";
  }

  if (draft.bloodGroup.trim().length < 1) {
    errors.bloodGroup = "Select a blood group.";
  }

  if (draft.preferredLanguage?.trim() && draft.preferredLanguage.trim().length < 2) {
    errors.preferredLanguage = "Enter a valid preferred language.";
  }

  if (draft.addressLine1.trim().length < 5) {
    errors.addressLine1 = "Enter a valid address line 1.";
  }

  if (draft.city.trim().length < 2) {
    errors.city = "Enter a valid city.";
  }

  if (draft.state.trim().length < 2) {
    errors.state = "Enter a valid state.";
  }

  if (draft.postalCode.trim().length < 4) {
    errors.postalCode = "Enter a valid postal code.";
  }

  if (draft.emergencyContactName.trim().length < 2) {
    errors.emergencyContactName = "Enter an emergency contact name.";
  }

  if (draft.emergencyContactPhone.trim().length < 7) {
    errors.emergencyContactPhone = "Enter an emergency contact phone number.";
  }

  if (!draft.password) {
    errors.password = "Password is required.";
  } else if (passwordErrors.length > 0) {
    errors.password = passwordErrors[0] ?? "Password is required.";
  }

  if (!draft.confirmPassword) {
    errors.confirmPassword = "Please confirm your password.";
  } else if (draft.password !== draft.confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

const editableProfileFieldsByRole: Record<UserRole, readonly (keyof UserProfileDraft)[]> = {
  patient: [
    "fullName",
    "phoneNumber",
    "gender",
    "dateOfBirth",
    "bloodGroup",
    "address",
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "postalCode",
    "emergencyContactName",
    "emergencyContactPhone",
    "allergies",
    "medicalConditions",
    "preferredLanguage",
  ],
  doctor: [
    "fullName",
    "phoneNumber",
    "gender",
    "qualifications",
    "experience",
    "languages",
    "consultationFee",
    "availableTimings",
    "consultationMode",
  ],
  receptionist: ["fullName", "phoneNumber", "gender", "deskLabel"],
  laboratory: ["fullName", "phoneNumber", "gender"],
  pharmacist: ["fullName", "phoneNumber", "gender"],
  administrator: ["fullName", "phoneNumber", "gender"],
};

function normalizeProfileDraftForRole(role: UserRole, draft: Record<string, unknown>) {
  const allowedFields = editableProfileFieldsByRole[role];
  const normalized: Partial<UserProfileDraft> = {};

  for (const field of allowedFields) {
    const value = draft[field];
    normalized[field] = typeof value === "string" ? value : "";
  }

  return normalized as UserProfileDraft;
}

function validateSharedProfileDraft(role: UserRole, draft: UserProfileDraft) {
  const errors: Record<string, string> = {};

  if (!editableProfileFieldsByRole[role].includes("fullName") || draft.fullName.trim().length < 2) {
    errors.fullName = "Enter a full name with at least 2 characters.";
  }

  const optionalMinLengthFields: Array<keyof Pick<
    UserProfileDraft,
    "phoneNumber" | "address" | "addressLine1" | "city" | "state" | "postalCode" | "emergencyContactName" | "emergencyContactPhone" | "preferredLanguage" | "qualifications" | "experience" | "languages" | "consultationFee" | "availableTimings" | "deskLabel" | "consultationMode"
  >> = [
    "phoneNumber",
    "address",
    "addressLine1",
    "city",
    "state",
    "postalCode",
    "emergencyContactName",
    "emergencyContactPhone",
    "preferredLanguage",
    "qualifications",
    "experience",
    "languages",
    "consultationFee",
    "availableTimings",
    "deskLabel",
    "consultationMode",
  ];

  for (const field of optionalMinLengthFields) {
    const value = draft[field];
    if (value && value.trim().length > 0) {
      const minLength =
        field === "phoneNumber" || field === "emergencyContactPhone"
          ? 7
          : field === "postalCode"
            ? 4
            : field === "consultationFee"
              ? 2
              : 2;
      if (value.trim().length < minLength) {
        errors[field] = "Enter a valid value.";
      }
    }
  }

  if (editableProfileFieldsByRole[role].includes("gender")) {
    const gender = draft.gender?.trim() ?? "";
    if (!gender) {
      errors.gender = "Select a gender.";
    }
  }

  if (editableProfileFieldsByRole[role].includes("dateOfBirth")) {
    if (!draft.dateOfBirth || !validatePatientProfileBirthDate(draft.dateOfBirth)) {
      errors.dateOfBirth = "Enter a valid date of birth.";
    }
  }

  if (editableProfileFieldsByRole[role].includes("bloodGroup")) {
    const bloodGroup = draft.bloodGroup?.trim() ?? "";
    if (!bloodGroup) {
      errors.bloodGroup = "Select a blood group.";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function withScopedState(role: UserRole, user: SafeUser, state: HospitalState): HospitalState {
  if (role === "administrator" || role === "receptionist") {
    return {
      ...state,
      medicalRecords: state.medicalRecords.filter(
        (record) => record.organizationId === user.organizationId,
      ),
      prescriptions: state.prescriptions.filter(
        (prescription) => prescription.organizationId === user.organizationId,
      ),
      labTests: state.labTests.filter((test) => test.organizationId === user.organizationId),
      labRequests: state.labRequests.filter((request) => request.organizationId === user.organizationId),
      labReports: state.labReports.filter((report) => report.organizationId === user.organizationId),
      invoices: getScopedInvoicesForUser(user, state),
      inventoryItems:
        role === "administrator"
          ? state.inventoryItems.filter((item) => item.organizationId === user.organizationId)
          : [],
      notifications: getScopedNotificationsForUser(user, state),
    };
  }

  if (role === "doctor") {
    const appointments = state.appointments.filter(
      (appointment) => appointment.doctorId === user.doctorId,
    );
    const appointmentIds = new Set(appointments.map((appointment) => appointment.id));
    const queueEntries = state.queueEntries.filter(
      (entry) =>
        entry.doctorId === user.doctorId || (entry.appointmentId ? appointmentIds.has(entry.appointmentId) : false),
    );
    const departmentIds = new Set(appointments.map((appointment) => appointment.departmentId));
    const patientNames = new Set(appointments.map((appointment) => appointment.patientName));

    return {
      ...state,
      doctors: state.doctors.filter((doctor) => doctor.id === user.doctorId),
      departments: state.departments.filter((department) => departmentIds.has(department.id)),
      appointments,
      queueEntries,
      medicalRecords: state.medicalRecords.filter((record) =>
        patientNames.has(record.patientName),
      ),
      prescriptions: state.prescriptions.filter(
        (prescription) => prescription.doctorId === user.doctorId,
      ),
      labRequests: state.labRequests.filter((request) =>
        patientNames.has(request.patientName),
      ),
      labReports: state.labReports.filter((report) => {
        const linkedRequest = state.labRequests.find((request) => request.id === report.labRequestId);
        return linkedRequest ? patientNames.has(linkedRequest.patientName) : false;
      }),
      invoices: [],
      inventoryItems: state.inventoryItems.filter((item) => item.organizationId === user.organizationId),
      notifications: getScopedNotificationsForUser(user, state),
    };
  }

  if (role === "laboratory") {
    return {
      ...state,
      appointments: [],
      queueEntries: [],
      medicalRecords: [],
      prescriptions: state.prescriptions.filter(
        (prescription) => prescription.organizationId === user.organizationId,
      ),
      doctors: [],
      departments: state.departments.filter((department) => department.id === "dept-laboratory"),
      labTests: state.labTests.filter((test) => test.organizationId === user.organizationId),
      labRequests: state.labRequests.filter((request) => request.organizationId === user.organizationId),
      labReports: state.labReports.filter((report) => report.organizationId === user.organizationId),
      invoices: [],
      inventoryItems: [],
      notifications: getScopedNotificationsForUser(user, state),
    };
  }

  if (role === "pharmacist") {
    return {
      ...state,
      appointments: [],
      queueEntries: [],
      medicalRecords: [],
      prescriptions: state.prescriptions.filter(
        (prescription) => prescription.organizationId === user.organizationId,
      ),
      labRequests: [],
      labReports: [],
      invoices: [],
      inventoryItems: state.inventoryItems.filter((item) => item.organizationId === user.organizationId),
      notifications: getScopedNotificationsForUser(user, state),
    };
  }

  const appointments = state.appointments.filter(
    (appointment) => appointment.patientName === user.patientName,
  );
  const appointmentIds = new Set(appointments.map((appointment) => appointment.id));
  const emailVerified = user.emailVerified !== false;

  return {
    ...state,
    appointments,
    medicalRecords: emailVerified
      ? state.medicalRecords.filter(
          (record) =>
            record.patientId === user.id || record.patientName === getPatientDisplayName(user),
        )
      : [],
    prescriptions: emailVerified
      ? state.prescriptions.filter(
          (prescription) =>
            prescription.patientId === user.id ||
            prescription.patientName === getPatientDisplayName(user),
        )
      : [],
    labTests: state.labTests.filter((test) => test.organizationId === user.organizationId),
    labRequests: getScopedLabRequestsForUser(user, state),
    labReports: emailVerified
      ? state.labReports.filter((report) => report.patientId === user.id)
      : [],
    invoices: emailVerified ? getScopedInvoicesForUser(user, state) : [],
    inventoryItems: [],
    notifications: getScopedNotificationsForUser(user, state),
    queueEntries: state.queueEntries.filter(
      (entry) =>
        entry.patientName === user.patientName ||
        (entry.appointmentId ? appointmentIds.has(entry.appointmentId) : false),
    ),
  };
}

export async function getScopedHospitalStateForUser(user: SafeUser): Promise<HospitalStateResponse> {
  const state = await measurePerfStep("scope.load-state", () => loadHospitalState());
  const repairedInvoices = await measurePerfStep("scope.repair-zero-invoices", () =>
    repairBrokenZeroValueInvoices(state),
  );
  const repairedState = buildInvoiceStateWithUpdates(state, repairedInvoices);
  const reconciledInvoices = await measurePerfStep("scope.reconcile-invoices", () =>
    reconcileMissingInvoices(repairedState),
  );
  const effectiveState =
    reconciledInvoices.length > 0
      ? {
          ...repairedState,
          invoices: [...reconciledInvoices, ...repairedState.invoices],
        }
      : repairedState;
  const scopedState = withScopedState(user.role, user, effectiveState);
  const organizationId = getUserOrganizationId(user, effectiveState);
  const sharedMeta = {
    appointmentSlotLoads: getAppointmentSlotLoads(effectiveState, organizationId),
    labSlotLoads: getLabSlotLoads(effectiveState, organizationId),
  };

  if (user.role === "doctor") {
    const users = await measurePerfStep("scope.load-users", () => loadUsers());
    const scopedPatients = await getDoctorScopedPatients(effectiveState, user, users);
    const patientProfiles = users
      .filter(
        (currentUser) =>
          currentUser.role === "patient" &&
          currentUser.organizationId === organizationId &&
          scopedPatients.has(currentUser.id),
      )
      .map(toSafeUserSummary);

    return {
      state: scopedState,
      meta: {
        ...sharedMeta,
        patientProfiles,
      },
    };
  }

  if (user.role !== "administrator") {
    return { state: scopedState, meta: sharedMeta };
  }

  const users = await measurePerfStep("scope.load-users", () => loadUsers());
  const userCounts: Record<UserRole, number> = {
    patient: users.filter((currentUser) => currentUser.role === "patient").length,
    doctor: users.filter((currentUser) => currentUser.role === "doctor").length,
    receptionist: users.filter((currentUser) => currentUser.role === "receptionist").length,
    laboratory: users.filter((currentUser) => currentUser.role === "laboratory").length,
    pharmacist: users.filter((currentUser) => currentUser.role === "pharmacist").length,
    administrator: users.filter((currentUser) => currentUser.role === "administrator").length,
  };

  return {
    state: scopedState,
    meta: {
      ...sharedMeta,
      userCounts,
      users: users.map(toSafeUserSummary),
    },
  };
}

export async function getLabRequestsForUser(user: SafeUser) {
  const state = await loadHospitalState();

  return {
    labRequests: getScopedLabRequestsForUser(user, state),
  };
}

function buildHistoryDateRange(
  preset: string,
  dateFrom?: string,
  dateTo?: string,
) {
  const now = new Date();

  if (preset === "today") {
    const today = getCurrentLocalDateIso(now);
    return { dateFrom: today, dateTo: today };
  }

  if (preset === "24h") {
    return { dateFrom: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString() };
  }

  if (preset === "7d") {
    return { dateFrom: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString() };
  }

  if (preset === "30d") {
    return { dateFrom: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString() };
  }

  return {
    dateFrom: dateFrom?.trim() || undefined,
    dateTo: dateTo?.trim() || undefined,
  };
}

export async function getDoctorHistory(
  user: SafeUser,
  input: {
    kind: "medical-records" | "prescriptions";
    page: number;
    pageSize: number;
    sort: "newest" | "oldest";
    patient?: string;
    datePreset?: string;
    dateFrom?: string;
    dateTo?: string;
  },
) {
  if (user.role !== "doctor" || !user.doctorId) {
    throw createHttpError(403, "You do not have access to this history.");
  }

  const page = Math.max(1, Math.round(input.page || 1));
  const pageSize = Math.min(20, Math.max(1, Math.round(input.pageSize || 10)));
  const offset = (page - 1) * pageSize;
  const sortDirection = input.sort === "oldest" ? "asc" : "desc";
  const patientFilter = input.patient?.trim() ? `%${input.patient.trim().toLowerCase()}%` : undefined;
  const { dateFrom, dateTo } = buildHistoryDateRange(input.datePreset ?? "all", input.dateFrom, input.dateTo);

  if (input.kind === "medical-records") {
    const params: unknown[] = [user.organizationId, user.doctorId];
    const conditions = ["organization_id = $1", "doctor_id = $2"];

    if (patientFilter) {
      params.push(patientFilter);
      conditions.push(`lower(patient_name) like $${params.length}`);
    }

    if (dateFrom) {
      params.push(dateFrom.slice(0, 10));
      conditions.push(`visit_date >= $${params.length}`);
    }

    if (dateTo) {
      params.push(dateTo.slice(0, 10));
      conditions.push(`visit_date <= $${params.length}`);
    }

    const countResult = await query<{ total: string }>(
      `select count(*)::text as total from medical_records where ${conditions.join(" and ")}`,
      params,
    );
    params.push(pageSize, offset);
    const itemsResult = await query(
      `select * from medical_records
       where ${conditions.join(" and ")}
       order by visit_date ${sortDirection}, created_at ${sortDirection}
       limit $${params.length - 1} offset $${params.length}`,
      params,
    );

    const totalItems = Number(countResult.rows[0]?.total ?? 0);
    return {
      items: itemsResult.rows.map((row) => ({
        id: String(row.id),
        patientId: String(row.patient_id),
        patientName: String(row.patient_name),
        doctorId: String(row.doctor_id),
        doctorName: String(row.doctor_name),
        appointmentId: asString(row.appointment_id),
        hospitalId: String(row.hospital_id),
        organizationId: String(row.organization_id),
        visitDate: String(row.visit_date),
        diagnosis: String(row.diagnosis),
        clinicalNotes: String(row.clinical_notes),
        treatmentAdvice: String(row.treatment_advice),
        createdAt: new Date(String(row.created_at)).toISOString(),
        updatedAt: asString(row.updated_at)
          ? new Date(String(row.updated_at)).toISOString()
          : undefined,
      })),
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    };
  }

  const params: unknown[] = [user.organizationId, user.doctorId];
  const conditions = ["p.organization_id = $1", "p.doctor_id = $2"];

  if (patientFilter) {
    params.push(patientFilter);
    conditions.push(`lower(p.patient_name) like $${params.length}`);
  }

  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`p.created_at >= $${params.length}`);
  }

  if (dateTo) {
    params.push(dateTo.length === 10 ? `${dateTo}T23:59:59.999Z` : dateTo);
    conditions.push(`p.created_at <= $${params.length}`);
  }

  const countResult = await query<{ total: string }>(
    `select count(*)::text as total from prescriptions p where ${conditions.join(" and ")}`,
    params,
  );
  params.push(pageSize, offset);
  const itemsResult = await query(
    `select p.* from prescriptions p
     where ${conditions.join(" and ")}
     order by p.created_at ${sortDirection}
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );

  const prescriptionIds = itemsResult.rows.map((row) => String(row.id));
  const medicinesResult =
    prescriptionIds.length > 0
      ? await query(
          `select * from prescription_medicines
           where prescription_id = any($1::text[])
           order by prescription_id asc, display_order asc`,
          [prescriptionIds],
        )
      : { rows: [] as Record<string, unknown>[] };
  const medicinesByPrescriptionId = new Map<string, PrescriptionRecord["medicines"]>();
  for (const row of medicinesResult.rows) {
    const prescriptionId = String(row.prescription_id);
    const current = medicinesByPrescriptionId.get(prescriptionId) ?? [];
    current.push({
      medicineId: asString(row.medicine_id),
      medicineName: String(row.medicine_name),
      strength: asString(row.strength),
      doseQuantity:
        row.dose_quantity === null || row.dose_quantity === undefined ? undefined : Number(row.dose_quantity),
      doseUnit: asString(row.dose_unit),
      dosage: String(row.dosage),
      frequency: String(row.frequency),
      durationValue:
        row.duration_value === null || row.duration_value === undefined ? undefined : Number(row.duration_value),
      durationUnit: asString(row.duration_unit),
      duration: String(row.duration),
      totalQuantity:
        row.total_quantity === null || row.total_quantity === undefined ? undefined : Number(row.total_quantity),
      instructions: asString(row.instructions_notes),
    });
    medicinesByPrescriptionId.set(prescriptionId, current);
  }

  const totalItems = Number(countResult.rows[0]?.total ?? 0);
  return {
    items: itemsResult.rows.map((row) => ({
      id: String(row.id),
      patientId: String(row.patient_id),
      patientName: String(row.patient_name),
      doctorId: String(row.doctor_id),
      doctorName: String(row.doctor_name),
      hospitalId: String(row.hospital_id),
      organizationId: String(row.organization_id),
      appointmentId: asString(row.appointment_id),
      medicines: medicinesByPrescriptionId.get(String(row.id)) ?? [],
      instructions: String(row.instructions),
      status: row.status as PrescriptionRecord["status"],
      createdAt: new Date(String(row.created_at)).toISOString(),
      dispensedAt: asString(row.dispensed_at)
        ? new Date(String(row.dispensed_at)).toISOString()
        : undefined,
      dispensedBy: asString(row.dispensed_by_id)
        ? {
            id: String(row.dispensed_by_id),
            name: String(row.dispensed_by_name),
          }
        : undefined,
    })),
    page,
    pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
  };
}

export async function getLabReportForUser(user: SafeUser, labReportId: string) {
  const state = await loadHospitalState();
  const scopedState = withScopedState(user.role, user, state);
  const scopedReport = scopedState.labReports.find((report) => report.id === labReportId);

  if (!scopedReport) {
    throw createHttpError(404, "Laboratory report not found.");
  }

  const report = await loadLabReportById(labReportId, scopedReport.organizationId);

  if (!report) {
    throw createHttpError(404, "Laboratory report not found.");
  }

  return { report };
}

export async function updateLabRequestStatus(
  user: SafeUser,
  labRequestId: string,
  status: LabRequestRecord["status"],
) {
  if (user.role !== "laboratory") {
    throw createHttpError(403, "You do not have access to update laboratory requests.");
  }

  const state = await loadHospitalState();
  const request = state.labRequests.find((currentRequest) => currentRequest.id === labRequestId);

  if (!request) {
    throw createHttpError(404, "Laboratory request not found.");
  }

  if (request.organizationId !== user.organizationId) {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  const allowedStatuses = getAllowedLabRequestStatuses(request.status);
  if (!allowedStatuses.includes(status)) {
    throw createHttpError(400, "That laboratory status transition is not allowed.");
  }

  const updatedRequest: LabRequestRecord = {
    ...request,
    status,
  };
  const nextState: HospitalState = {
    ...state,
    labRequests: state.labRequests.map((currentRequest) =>
      currentRequest.id === labRequestId ? updatedRequest : currentRequest,
    ),
  };

  await measurePerfStep("lab-request.status.write", () =>
    updateLabRequestStatusById({
      labRequestId,
      organizationId: request.organizationId,
      status,
    }),
  );
  const createdNotifications = await notifyUsers({
    organizationId: request.organizationId,
    userIds: [request.patientId],
    title: "Laboratory status updated",
    message: `${request.testName} is now ${status}.`,
    category: "Laboratory",
    relatedEntityType: "lab-request",
    relatedEntityId: request.id,
  });

  return {
    patch: {
      labRequests: [updatedRequest],
      notifications: createdNotifications.filter((notification) => notification.userId === user.id),
      meta: {
        labSlotLoads: getLabSlotLoads(nextState, request.organizationId),
      },
    },
  };
}

export async function createLabReport(
  user: SafeUser,
  labRequestId: string,
  draft: LabReportDraft,
) {
  if (user.role !== "laboratory") {
    throw createHttpError(403, "You do not have access to add laboratory reports.");
  }

  const state = await loadHospitalState();
  const request = state.labRequests.find((currentRequest) => currentRequest.id === labRequestId);

  if (!request) {
    throw createHttpError(404, "Laboratory request not found.");
  }

  if (request.organizationId !== user.organizationId) {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  if (request.status !== "Processing" && request.status !== "Completed") {
    throw createHttpError(400, "A report can only be added after processing has started.");
  }

  const existingReport = state.labReports.find((report) => report.labRequestId === labRequestId);
  if (existingReport) {
    throw createHttpError(409, "A laboratory report already exists for this request.");
  }

  const validation = validateLabReportDraft(draft);
  if (!validation.isValid) {
    throw createHttpError(400, "Please review the laboratory report details provided.", {
      errors: validation.errors,
    });
  }

  const report: LabReportRecord = {
    id: createLabReportId(state),
    labRequestId,
    patientId: request.patientId,
    hospitalId: request.hospitalId,
    organizationId: request.organizationId,
    testName: request.testName,
    reportTitle: draft.reportTitle.trim(),
    resultSummary: draft.resultSummary.trim(),
    uploadedAt: new Date().toISOString(),
    uploadedBy: {
      id: user.id,
      name: user.displayName,
    },
    attachment: draft.attachment,
  };

  const updatedRequest: LabRequestRecord = {
    ...request,
    status: "Completed",
  };
  const nextState: HospitalState = {
    ...state,
    labRequests: state.labRequests.map((currentRequest) =>
      currentRequest.id === labRequestId ? updatedRequest : currentRequest,
    ),
    labReports: [report, ...state.labReports],
  };

  await measurePerfStep("lab-report.write", async () => {
    await updateLabRequestStatusById({
      labRequestId,
      organizationId: request.organizationId,
      status: "Completed",
    });
    await insertLabReport(report);
  });
  const createdNotifications = await notifyUsers({
    organizationId: request.organizationId,
    userIds: [request.patientId],
    title: "Laboratory report ready",
    message: `${request.testName} report is now available in your dashboard.`,
    category: "Laboratory",
    relatedEntityType: "lab-report",
    relatedEntityId: report.id,
  });
  await writeAuditLog({
    organizationId: request.organizationId,
    actorUserId: user.id,
    action: "lab.report.created",
    entityType: "lab-report",
    entityId: report.id,
    metadata: {
      requestId: request.id,
      testName: report.testName,
    },
  });
  return {
    patch: {
      labRequests: [updatedRequest],
      labReports: [stripLabReportAttachmentContent(report)],
      notifications: createdNotifications.filter((notification) => notification.userId === user.id),
      meta: {
        labSlotLoads: getLabSlotLoads(nextState, request.organizationId),
      },
    },
  };
}

export async function createMedicalRecord(user: SafeUser, draft: MedicalRecordDraft) {
  if (user.role !== "doctor") {
    throw createHttpError(403, "You do not have access to create medical records.");
  }

  const [state, users] = await measurePerfStep("medical-record.load-context", () =>
    Promise.all([loadHospitalState(), loadUsers()]),
  );
  const validation = validateMedicalRecordDraft(draft);

  if (!validation.isValid) {
    throw createHttpError(400, "Please review the medical record details provided.", {
      errors: validation.errors,
    });
  }

  const scopedPatients = await getDoctorScopedPatients(state, user, users);
  const patient = scopedPatients.get(draft.patientId);

  if (!patient) {
    throw createHttpError(400, "Please review the medical record details provided.", {
      errors: {
        patientId: "Please select a patient.",
      },
    });
  }

  if (draft.appointmentId && !patient.appointmentIds.has(draft.appointmentId)) {
    throw createHttpError(400, "Please review the medical record details provided.", {
      errors: {
        appointmentId: "Selected appointment does not belong to this patient.",
      },
    });
  }

  const appointment = draft.appointmentId
    ? getAppointmentById(state, draft.appointmentId)
    : undefined;

  if (appointment && appointment.doctorId !== user.doctorId) {
    throw createHttpError(400, "Please review the medical record details provided.", {
      errors: {
        appointmentId: "Selected appointment does not belong to this patient.",
      },
    });
  }

  const doctor = getDoctorById(state, user.doctorId ?? "");
  if (!doctor) {
    throw createHttpError(400, "This doctor account is missing a valid staff profile.");
  }

  const record: MedicalRecordRecord = {
    id: createMedicalRecordId(),
    patientId: patient.patientId,
    patientName: patient.patientName,
    doctorId: doctor.id,
    doctorName: doctor.name,
    appointmentId: draft.appointmentId,
    hospitalId: doctor.organizationId,
    organizationId: doctor.organizationId,
    visitDate: draft.visitDate,
    diagnosis: draft.diagnosis.trim(),
    clinicalNotes: draft.clinicalNotes.trim(),
    treatmentAdvice: draft.treatmentAdvice.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: undefined,
  };

  await measurePerfStep("medical-record.write", () => insertMedicalRecord(record));
  await writeAuditLog({
    organizationId: doctor.organizationId,
    actorUserId: user.id,
    action: "medical-record.created",
    entityType: "medical-record",
    entityId: record.id,
    metadata: {
      patientId: record.patientId,
    },
  });

  return {
    patch: {
      medicalRecords: [record],
    },
  };
}

export async function updateMedicalRecord(
  user: SafeUser,
  recordId: string,
  draft: Pick<MedicalRecordDraft, "diagnosis" | "clinicalNotes" | "treatmentAdvice">,
) {
  if (user.role !== "doctor") {
    throw createHttpError(403, "You do not have access to edit medical records.");
  }

  const state = await measurePerfStep("medical-record.update.load-state", () => loadHospitalState());
  const recordIndex = state.medicalRecords.findIndex((record) => record.id === recordId);

  if (recordIndex === -1) {
    throw createHttpError(404, "Medical record not found.");
  }

  const record = state.medicalRecords[recordIndex];

  if (record.organizationId !== user.organizationId) {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  if (record.doctorId !== user.doctorId) {
    throw createHttpError(403, "You can only edit records that you created.");
  }

  if (!canEditMedicalRecord(record, user)) {
    throw createHttpError(403, "Editing period ended.");
  }

  const validation = validateMedicalRecordDraft({
    patientId: record.patientId,
    appointmentId: record.appointmentId,
    visitDate: record.visitDate,
    diagnosis: draft.diagnosis,
    clinicalNotes: draft.clinicalNotes,
    treatmentAdvice: draft.treatmentAdvice,
  });

  if (!validation.isValid) {
    throw createHttpError(400, "Please review the medical record details provided.", {
      errors: {
        diagnosis: validation.errors.diagnosis,
        clinicalNotes: validation.errors.clinicalNotes,
        treatmentAdvice: validation.errors.treatmentAdvice,
      },
    });
  }

  await measurePerfStep("medical-record.update.write", () =>
    updateMedicalRecordDetails({
      recordId,
      organizationId: record.organizationId,
      doctorId: record.doctorId,
      diagnosis: draft.diagnosis.trim(),
      clinicalNotes: draft.clinicalNotes.trim(),
      treatmentAdvice: draft.treatmentAdvice.trim(),
      updatedAt: new Date().toISOString(),
    }),
  );
  await writeAuditLog({
    organizationId: record.organizationId,
    actorUserId: user.id,
    action: "medical-record.updated",
    entityType: "medical-record",
    entityId: recordId,
  });

  return {
    patch: {
      medicalRecords: [
        {
          ...record,
          diagnosis: draft.diagnosis.trim(),
          clinicalNotes: draft.clinicalNotes.trim(),
          treatmentAdvice: draft.treatmentAdvice.trim(),
          updatedAt: new Date().toISOString(),
        },
      ],
    },
  };
}

export async function createPrescription(user: SafeUser, draft: PrescriptionDraft) {
  if (user.role !== "doctor") {
    throw createHttpError(403, "You do not have access to create prescriptions.");
  }

  const [state, loadedUsers] = await measurePerfStep("prescription.load-context", () =>
    Promise.all([loadHospitalState(), loadUsers()]),
  );
  const normalizedDraft = normalizePrescriptionDraft(draft);
  const validation = validatePrescriptionDraft(normalizedDraft);

  if (!validation.isValid) {
    throw createHttpError(400, "Please review the prescription details provided.", {
      errors: validation.errors,
    });
  }

  const scopedPatients = await getDoctorScopedPatients(state, user, loadedUsers);
  const patient = scopedPatients.get(normalizedDraft.patientId);

  if (!patient) {
    throw createHttpError(400, "Please review the prescription details provided.", {
      errors: {
        patientId: "Please select a patient.",
      },
    });
  }

  if (normalizedDraft.appointmentId && !patient.appointmentIds.has(normalizedDraft.appointmentId)) {
    throw createHttpError(400, "Please review the prescription details provided.", {
      errors: {
        appointmentId: "Selected appointment does not belong to this patient.",
      },
    });
  }

  const appointment = normalizedDraft.appointmentId
    ? getAppointmentById(state, normalizedDraft.appointmentId)
    : undefined;

  if (appointment && appointment.doctorId !== user.doctorId) {
    throw createHttpError(400, "Please review the prescription details provided.", {
      errors: {
        appointmentId: "Selected appointment does not belong to this patient.",
      },
    });
  }

  const doctor = getDoctorById(state, user.doctorId ?? "");
  if (!doctor) {
    throw createHttpError(400, "This doctor account is missing a valid staff profile.");
  }

  const catalogById = new Map(
    state.medicineCatalog
      .filter((medicine) => medicine.organizationId === doctor.organizationId)
      .map((medicine) => [medicine.id, medicine] as const),
  );
  const normalizedMedicines = normalizedDraft.medicines.map((medicine, index) => {
    const catalogMedicine = medicine.medicineId ? catalogById.get(medicine.medicineId) : undefined;

    if (!catalogMedicine) {
      throw createHttpError(400, "Please review the prescription details provided.", {
        errors: {
          [`medicines.${index}.medicineId`]: "Medicine is not linked to the hospital catalog.",
        },
      });
    }

    return {
      ...medicine,
      medicineId: catalogMedicine.id,
      medicineName: catalogMedicine.name,
      strength: catalogMedicine.strength,
      doseUnit: catalogMedicine.unit,
      dosage: `${medicine.doseQuantity ?? 1} ${catalogMedicine.unit}`.trim(),
      totalQuantity: getMedicineRequiredQuantity({
        ...medicine,
        medicineName: catalogMedicine.name,
        strength: catalogMedicine.strength,
        doseUnit: catalogMedicine.unit,
      }),
    };
  });

  const prescription: PrescriptionRecord = {
    id: createPrescriptionId(),
    patientId: patient.patientId,
    patientName: patient.patientName,
    doctorId: doctor.id,
    doctorName: doctor.name,
    hospitalId: doctor.organizationId,
    organizationId: doctor.organizationId,
    appointmentId: normalizedDraft.appointmentId,
    medicines: normalizedMedicines,
    instructions: normalizedDraft.instructions,
    status: "Issued",
    createdAt: new Date().toISOString(),
  };

  await measurePerfStep("prescription.write", () => insertPrescription(prescription));
  const pharmacistUserIds = loadedUsers
      .filter(
        (currentUser) =>
          currentUser.role === "pharmacist" &&
          currentUser.organizationId === doctor.organizationId,
      )
      .map((currentUser) => currentUser.id);
  const createdNotifications = await notifyUsers({
    organizationId: doctor.organizationId,
    userIds: [patient.patientId, ...pharmacistUserIds],
    title: "Prescription issued",
    message: `${doctor.name} issued a prescription for ${patient.patientName}.`,
    category: "Prescription",
    relatedEntityType: "prescription",
    relatedEntityId: prescription.id,
  });
  await writeAuditLog({
    organizationId: doctor.organizationId,
    actorUserId: user.id,
    action: "prescription.created",
    entityType: "prescription",
    entityId: prescription.id,
    metadata: {
      patientId: prescription.patientId,
    },
  });

  return {
    patch: {
      prescriptions: [prescription],
      notifications: createdNotifications.filter((notification) => notification.userId === user.id),
    },
  };
}

export async function dispensePrescription(
  user: SafeUser,
  prescriptionId: string,
  status: PrescriptionStatus,
) {
  if (user.role !== "pharmacist") {
    throw createHttpError(403, "You do not have access to dispense prescriptions.");
  }

  if (status !== "Dispensed") {
    throw createHttpError(400, "Only dispensing updates are supported in this workflow.");
  }

  const state = await measurePerfStep("prescription.dispense.load-state", () => loadHospitalState());
  const prescription = state.prescriptions.find((item) => item.id === prescriptionId);

  if (!prescription) {
    throw createHttpError(404, "Prescription not found.");
  }

  if (prescription.organizationId !== user.organizationId) {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  if (prescription.status === "Dispensed") {
    throw createHttpError(400, "This prescription has already been dispensed.");
  }

  const today = getCurrentLocalDateIso();
  const normalizedMedicines = prescription.medicines.map((medicine) =>
    normalizePrescriptionMedicine(medicine),
  );
  const inventoryByMedicine = new Map<string, InventoryItemRecord[]>();
  for (const item of state.inventoryItems) {
    if (
      item.organizationId !== user.organizationId ||
      item.quantityInStock <= 0 ||
      item.expiryDate < today
    ) {
      continue;
    }

    const key = getInventoryItemKey(item);
    const current = inventoryByMedicine.get(key) ?? [];
    current.push(item);
    inventoryByMedicine.set(key, current);
  }

  const updatedInventoryMap = new Map<string, InventoryItemRecord>();
  for (const medicine of normalizedMedicines) {
    const medicineKey = getMedicineInventoryKey(medicine);
    const availableBatches = [...(inventoryByMedicine.get(medicineKey) ?? [])].sort((left, right) =>
      left.expiryDate.localeCompare(right.expiryDate),
    );
    const requiredQuantity = getMedicineRequiredQuantity(medicine);
    const availableQuantity = availableBatches.reduce(
      (sum, item) => sum + item.quantityInStock,
      0,
    );

    if (availableQuantity < requiredQuantity) {
      throw createHttpError(
        400,
        `Insufficient stock for ${buildPrescriptionMedicineLabel(medicine)}. Available: ${availableQuantity}, required: ${requiredQuantity}.`,
      );
    }

    let remaining = requiredQuantity;
    for (const batch of availableBatches) {
      if (remaining <= 0) {
        break;
      }

      const consumed = Math.min(batch.quantityInStock, remaining);
      const nextBatch: InventoryItemRecord = {
        ...batch,
        quantityInStock: batch.quantityInStock - consumed,
        updatedAt: new Date().toISOString(),
      };
      updatedInventoryMap.set(nextBatch.id, nextBatch);
      remaining -= consumed;
    }
  }

  const dispensedAt = new Date().toISOString();
  const updatedPrescription: PrescriptionRecord = {
    ...prescription,
    medicines: normalizedMedicines,
    status: "Dispensed",
    dispensedAt,
    dispensedBy: {
      id: user.id,
      name: user.displayName,
    },
  };

  const existingInvoice = state.invoices.find(
    (invoice) =>
      invoice.organizationId === prescription.organizationId &&
      invoice.sourceType === "prescription" &&
      invoice.sourceId === prescription.id,
  );
  const createdInvoice =
    existingInvoice ??
    buildInvoiceRecord({
      patientId: prescription.patientId,
      patientName: prescription.patientName,
      organizationId: prescription.organizationId,
      hospitalId: prescription.hospitalId,
      sourceType: "prescription",
      sourceId: prescription.id,
      dueDate: today,
      items: normalizedMedicines.map((medicine) => ({
        description: buildPrescriptionMedicineLabel(medicine),
        category: "Medicine",
        quantity: getMedicineRequiredQuantity(medicine),
        unitAmountCents: getMedicineUnitPriceCents(medicine, state.inventoryItems),
      })),
    });

  await withTransaction(async (client) => {
    for (const item of updatedInventoryMap.values()) {
      await client.query(
        `update inventory_items
         set medicine_id = $3,
             medicine_name = $4,
             generic_name = $5,
             batch_number = $6,
             quantity_in_stock = $7,
             unit = $8,
             unit_price_cents = $9,
             expiry_date = $10,
             reorder_level = $11,
             manufacturer = $12,
             updated_at = $13
         where id = $1 and organization_id = $2`,
        [
          item.id,
          item.organizationId,
          item.medicineId ?? null,
          item.medicineName,
          item.genericName ?? null,
          item.batchNumber,
          item.quantityInStock,
          item.unit,
          item.unitPriceCents,
          item.expiryDate,
          item.reorderLevel,
          item.manufacturer ?? null,
          item.updatedAt,
        ],
      );
    }

    await client.query(
      `update prescriptions
       set status = 'Dispensed',
           dispensed_at = $3,
           dispensed_by_id = $4,
           dispensed_by_name = $5
       where id = $1 and organization_id = $2 and status <> 'Dispensed'`,
      [
        prescriptionId,
        prescription.organizationId,
        dispensedAt,
        user.id,
        user.displayName,
      ],
    );

    if (!existingInvoice) {
      await client.query(
        `insert into invoices (
          id, invoice_number, organization_id, hospital_id, patient_id, patient_name, source_type,
          source_id, due_date, subtotal_cents, total_cents, amount_paid_cents, amount_due_cents,
          payment_status, created_at, updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        on conflict do nothing`,
        [
          createdInvoice.id,
          createdInvoice.invoiceNumber,
          createdInvoice.organizationId,
          createdInvoice.hospitalId,
          createdInvoice.patientId,
          createdInvoice.patientName,
          createdInvoice.sourceType ?? null,
          createdInvoice.sourceId ?? null,
          createdInvoice.dueDate ?? null,
          createdInvoice.subtotalCents,
          createdInvoice.totalCents,
          createdInvoice.amountPaidCents,
          createdInvoice.amountDueCents,
          createdInvoice.paymentStatus,
          createdInvoice.createdAt,
          createdInvoice.createdAt,
        ],
      );

      for (const item of createdInvoice.items) {
        await client.query(
          `insert into invoice_items (
            id, invoice_id, organization_id, description, category, quantity, unit_amount_cents,
            total_amount_cents, source_type, source_id
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            item.id,
            item.invoiceId,
            item.organizationId,
            item.description,
            item.category,
            item.quantity,
            item.unitAmountCents,
            item.totalAmountCents,
            item.sourceType ?? null,
            item.sourceId ?? null,
          ],
        );
      }
    }
  });
  const pharmacistUsers = (await loadUsers())
    .filter(
      (currentUser) =>
        currentUser.role === "pharmacist" &&
        currentUser.organizationId === prescription.organizationId,
    )
    .map((currentUser) => currentUser.id);
  const createdNotifications = await notifyUsers({
    organizationId: prescription.organizationId,
    userIds: [prescription.patientId],
    title: "Prescription dispensed",
    message: `${prescription.patientName} prescription is ready from the pharmacy.`,
    category: "Prescription",
    relatedEntityType: "prescription",
    relatedEntityId: prescription.id,
  });
  const billingNotifications = !existingInvoice
    ? await notifyUsers({
        organizationId: prescription.organizationId,
        userIds: [prescription.patientId],
        title: "Invoice generated",
        message: `Invoice ${createdInvoice.invoiceNumber} was created for dispensed medicines.`,
        category: "Billing",
        relatedEntityType: "invoice",
        relatedEntityId: createdInvoice.id,
      })
    : [];
  const lowStockNotifications: NotificationRecord[] = [];
  for (const item of updatedInventoryMap.values()) {
    if (item.quantityInStock <= item.reorderLevel) {
      const generated = await notifyUsers({
        organizationId: item.organizationId,
        userIds: pharmacistUsers,
        title: item.quantityInStock <= 0 ? "Medicine out of stock" : "Low stock warning",
        message: `${item.medicineName} batch ${item.batchNumber} has ${item.quantityInStock} ${item.unit}${item.quantityInStock === 1 ? "" : "s"} remaining.`,
        category: "Inventory",
        relatedEntityType: "inventory-item",
        relatedEntityId: item.id,
      });
      lowStockNotifications.push(...generated);
    }
  }
  await writeAuditLog({
    organizationId: prescription.organizationId,
    actorUserId: user.id,
    action: "prescription.dispensed",
    entityType: "prescription",
    entityId: prescriptionId,
  });

  return {
    patch: {
      prescriptions: [updatedPrescription],
      invoices: !existingInvoice ? [createdInvoice] : [],
      inventoryItems: [...updatedInventoryMap.values()],
      notifications: [...createdNotifications, ...billingNotifications, ...lowStockNotifications].filter(
        (notification) => notification.userId === user.id,
      ),
    },
  };
}

export async function createAppointment(user: SafeUser, draft: AppointmentDraft) {
  const canCreateAppointment =
    user.role === "patient" ||
    user.role === "receptionist" ||
    user.role === "administrator";

  if (!canCreateAppointment) {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  if (user.role === "patient" && !user.patientName?.trim() && !user.displayName.trim()) {
    throw createHttpError(400, "This patient account is missing a valid profile linkage.");
  }

  const state = await measurePerfStep("appointment.create.load-state", () => loadHospitalState());
  const effectiveDraft: AppointmentDraft =
    user.role === "patient"
      ? {
          ...draft,
          patientName: user.patientName ?? user.displayName,
        }
      : draft;
  const validation = validateAppointmentDraft(state, effectiveDraft);

  if (!validation.isValid) {
    throw createHttpError(400, "Please correct the appointment details provided.", {
      errors: validation.errors,
    });
  }

  const doctor = getDoctorById(state, effectiveDraft.doctorId);
  if (!doctor) {
    throw createHttpError(400, "The selected doctor could not be found.");
  }

  if (doctor.organizationId !== getUserOrganizationId(user, state)) {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  const appointment: AppointmentRecord = {
    id: createAppointmentId(state),
    organizationId: doctor.organizationId,
    patientId: user.role === "patient" ? user.id : undefined,
    patientName: effectiveDraft.patientName.trim(),
    doctorId: doctor.id,
    departmentId: doctor.departmentId,
    appointmentDate: effectiveDraft.appointmentDate,
    appointmentTime: effectiveDraft.appointmentTime,
    reasonForAppointment: effectiveDraft.reasonForAppointment.trim(),
    status: "Scheduled",
  };

    await measurePerfStep("appointment.create.write", () => insertAppointment(appointment));
    const users = await loadUsers();
    const doctorUsers = users.filter(
      (currentUser) =>
        currentUser.role === "doctor" &&
        currentUser.organizationId === appointment.organizationId &&
        currentUser.doctorId === appointment.doctorId,
    );
    const createdNotifications = await notifyUsers({
      organizationId: appointment.organizationId,
      userIds: [
        appointment.patientId ?? user.id,
        ...doctorUsers.map((doctorUser) => doctorUser.id),
      ],
      title: "Appointment booked",
      message: `${appointment.patientName} is scheduled for ${appointment.appointmentDate} at ${appointment.appointmentTime}.`,
      category: "Appointment",
      relatedEntityType: "appointment",
      relatedEntityId: appointment.id,
    });
    await writeAuditLog({
      organizationId: appointment.organizationId,
      actorUserId: user.id,
      action: "appointment.created",
    entityType: "appointment",
    entityId: appointment.id,
    metadata: {
      doctorId: appointment.doctorId,
    },
  });
  const nextState: HospitalState = {
    ...state,
    appointments: [appointment, ...state.appointments],
  };

  return {
      patch: {
        appointments: [appointment],
        notifications: createdNotifications.filter((notification) => notification.userId === user.id),
        meta: {
          appointmentSlotLoads: getAppointmentSlotLoads(nextState, appointment.organizationId),
        },
      },
    };
}

export async function updateAppointment(
  user: SafeUser,
  appointmentId: string,
  draft: AppointmentDraft,
) {
  const state = await measurePerfStep("appointment.update.load-state", () => loadHospitalState());
  const validation = validateAppointmentDraft(state, draft, appointmentId);

  if (!validation.isValid) {
    throw createHttpError(400, "Please correct the appointment details provided.", {
      errors: validation.errors,
    });
  }

  const doctor = getDoctorById(state, draft.doctorId);
  if (!doctor) {
    throw createHttpError(400, "The selected doctor could not be found.");
  }

  const currentAppointment = getAppointmentById(state, appointmentId);
  if (!currentAppointment) {
    throw createHttpError(404, "Appointment not found.");
  }

  const updatedAppointment: AppointmentRecord = {
    ...currentAppointment,
    patientName: draft.patientName.trim(),
    doctorId: doctor.id,
    departmentId: doctor.departmentId,
    appointmentDate: draft.appointmentDate,
    appointmentTime: draft.appointmentTime,
    reasonForAppointment: draft.reasonForAppointment.trim(),
  };
  const updatedQueueEntries = state.queueEntries
    .filter((entry) => entry.appointmentId === appointmentId)
    .map((entry) => ({
      ...entry,
      patientName: draft.patientName.trim(),
      doctorId: doctor.id,
      departmentId: doctor.departmentId,
      createdAt: draft.appointmentTime,
      updatedAt: draft.appointmentTime,
    }));

  await measurePerfStep("appointment.update.write", async () => {
    await updateAppointmentRecord({
      appointmentId,
      organizationId: updatedAppointment.organizationId,
      patientName: updatedAppointment.patientName,
      doctorId: updatedAppointment.doctorId,
      departmentId: updatedAppointment.departmentId,
      appointmentDate: updatedAppointment.appointmentDate,
      appointmentTime: updatedAppointment.appointmentTime,
      reasonForAppointment: updatedAppointment.reasonForAppointment,
    });

    if (updatedQueueEntries.length > 0) {
      await updateQueueEntriesForAppointment({
        organizationId: updatedAppointment.organizationId,
        appointmentId,
        patientName: updatedAppointment.patientName,
        doctorId: updatedAppointment.doctorId,
        departmentId: updatedAppointment.departmentId,
        createdAt: updatedAppointment.appointmentTime,
        updatedAt: updatedAppointment.appointmentTime,
      });
    }
  });

  const nextState: HospitalState = {
    ...state,
    appointments: state.appointments.map((appointment) =>
      appointment.id === appointmentId ? updatedAppointment : appointment,
    ),
    queueEntries: state.queueEntries.map((entry) =>
      entry.appointmentId === appointmentId
        ? {
            ...entry,
            patientName: updatedAppointment.patientName,
            doctorId: updatedAppointment.doctorId,
            departmentId: updatedAppointment.departmentId,
            createdAt: updatedAppointment.appointmentTime,
            updatedAt: updatedAppointment.appointmentTime,
          }
        : entry,
    ),
  };

  return {
    patch: {
      appointments: [updatedAppointment],
      queueEntries: updatedQueueEntries,
      meta: {
        appointmentSlotLoads: getAppointmentSlotLoads(nextState, updatedAppointment.organizationId),
      },
    },
  };
}

export async function setAppointmentStatus(
  user: SafeUser,
  appointmentId: string,
  status: AppointmentStatus,
) {
  const state = await measurePerfStep("appointment.status.load-state", () => loadHospitalState());
  const appointment = getAppointmentById(state, appointmentId);

  if (!appointment) {
    throw createHttpError(404, "Appointment not found.");
  }

  const isPatientOwner =
    user.role === "patient" && appointment.patientName === (user.patientName ?? user.displayName);
  const isOperationsRole =
    user.role === "administrator" || user.role === "receptionist";
  const isAssignedDoctor =
    user.role === "doctor" && user.doctorId === appointment.doctorId;
  const isReceptionist = user.role === "receptionist";
  const doctorAllowedStatuses =
    appointment.status === "Checked in"
      ? ["In consultation"]
      : appointment.status === "In consultation"
        ? ["Completed"]
        : appointment.status === "Scheduled"
          ? ["Cancelled"]
          : [];
  const receptionistAllowedStatuses =
    appointment.status === "Scheduled" ? ["Checked in", "Cancelled"] : [];

  if (!isPatientOwner && !isOperationsRole && !isAssignedDoctor) {
    throw createHttpError(403, "You do not have access to update this appointment.");
  }

  if (isPatientOwner && status !== "Cancelled") {
    throw createHttpError(403, "Patients can only cancel their own scheduled appointments.");
  }

  if (isPatientOwner && appointment.status !== "Scheduled") {
    throw createHttpError(400, "This appointment can no longer be cancelled.");
  }

  if (isAssignedDoctor && !doctorAllowedStatuses.includes(status)) {
    throw createHttpError(
      403,
      "Doctors can only start, complete, or cancel appointments assigned to them when allowed.",
    );
  }

  if (isReceptionist && !receptionistAllowedStatuses.includes(status)) {
    throw createHttpError(
      403,
      "Reception can only check in or cancel scheduled appointments.",
    );
  }

  const allowed = getAllowedAppointmentStatuses(appointment.status);
  if (!allowed.includes(status)) {
    throw createHttpError(400, "That appointment status transition is not allowed.");
  }

  let nextQueueEntries = state.queueEntries;

  if (status === "Checked in") {
    const existingQueueEntry = state.queueEntries.find(
      (entry) => entry.appointmentId === appointment.id && entry.status !== "Completed",
    );

    if (!existingQueueEntry) {
      nextQueueEntries = [
        createQueueEntryFromAppointment(state, appointment),
        ...state.queueEntries,
      ];
    }
  }

  if (status === "Cancelled") {
    nextQueueEntries = nextQueueEntries.map((entry) =>
      entry.appointmentId === appointment.id && entry.status !== "Completed"
        ? { ...entry, status: "Completed", updatedAt: appointment.appointmentTime }
        : entry,
    );
  }

  if (status === "In consultation") {
    nextQueueEntries = nextQueueEntries.map((entry) =>
      entry.appointmentId === appointment.id && entry.status !== "Completed"
        ? { ...entry, status: "In consultation", updatedAt: appointment.appointmentTime }
        : entry,
    );
  }

  if (status === "Completed") {
    nextQueueEntries = nextQueueEntries.map((entry) =>
      entry.appointmentId === appointment.id
        ? { ...entry, status: "Completed", updatedAt: appointment.appointmentTime }
        : entry,
    );
  }

  const nextState: HospitalState = {
    ...state,
    appointments: state.appointments.map((currentAppointment) =>
      currentAppointment.id === appointment.id
        ? { ...currentAppointment, status }
        : currentAppointment,
    ),
    queueEntries: nextQueueEntries,
  };

  const updatedAppointment: AppointmentRecord = { ...appointment, status };
  const changedQueueEntries = nextQueueEntries.filter((entry) => entry.appointmentId === appointment.id);
  let createdInvoice: InvoiceRecord | null = null;

  if (
    status === "Completed" &&
    !state.invoices.some(
      (invoice) =>
        invoice.organizationId === appointment.organizationId &&
        invoice.sourceType === "appointment" &&
        invoice.sourceId === appointment.id,
    )
  ) {
    const users = await loadUsers();
    const doctorUser = users.find(
      (currentUser) =>
        currentUser.role === "doctor" &&
        currentUser.organizationId === appointment.organizationId &&
        currentUser.doctorId === appointment.doctorId,
    );
    createdInvoice = buildInvoiceRecord({
      patientId: appointment.patientId ?? createExternalPatientId(appointment.patientName),
      patientName: appointment.patientName,
      organizationId: appointment.organizationId,
      hospitalId: appointment.organizationId,
      sourceType: "appointment",
      sourceId: appointment.id,
      dueDate: appointment.appointmentDate,
      items: [
        {
          description: `Consultation with ${doctorUser?.displayName ?? "Assigned doctor"}`,
          category: "Consultation",
          quantity: 1,
          unitAmountCents: parseCurrencyTextToCents(doctorUser?.consultationFee),
        },
      ],
    });
  }

  await measurePerfStep("appointment.status.write", async () => {
    await updateAppointmentStatusById({
      appointmentId: appointment.id,
      organizationId: appointment.organizationId,
      status,
    });

    if (status === "Checked in") {
      const existingQueueEntry = state.queueEntries.find(
        (entry) => entry.appointmentId === appointment.id && entry.status !== "Completed",
      );

      if (existingQueueEntry) {
        await updateQueueStatusesByAppointment({
          organizationId: appointment.organizationId,
          appointmentId: appointment.id,
          status: existingQueueEntry.status,
          updatedAt: existingQueueEntry.updatedAt,
          excludeCompleted: true,
        });
      } else if (changedQueueEntries[0]) {
        await insertQueueEntry(changedQueueEntries[0]);
      }
    }

    if (status === "Cancelled" || status === "In consultation" || status === "Completed") {
      await updateQueueStatusesByAppointment({
        organizationId: appointment.organizationId,
        appointmentId: appointment.id,
        status: changedQueueEntries[0]?.status ?? "Completed",
        updatedAt: changedQueueEntries[0]?.updatedAt ?? appointment.appointmentTime,
        excludeCompleted: status !== "Completed",
      });
    }

    if (createdInvoice) {
      await insertInvoice(createdInvoice);
      await insertInvoiceItems(createdInvoice.items);
    }
  });
  const patientNotificationTarget = appointment.patientId ?? user.id;
  const createdNotifications = await notifyUsers({
    organizationId: appointment.organizationId,
    userIds: [patientNotificationTarget],
    title:
      status === "Completed"
        ? "Appointment completed"
        : status === "Cancelled"
          ? "Appointment cancelled"
          : status === "Checked in"
            ? "Appointment checked in"
            : "Consultation started",
    message: `${appointment.patientName} appointment is now ${status}.`,
    category: "Appointment",
    relatedEntityType: "appointment",
    relatedEntityId: appointment.id,
  });
  const billingNotifications =
    createdInvoice && appointment.patientId
      ? await notifyUsers({
          organizationId: appointment.organizationId,
          userIds: [appointment.patientId],
          title: "Invoice generated",
          message: `Invoice ${createdInvoice.invoiceNumber} was created after the consultation.`,
          category: "Billing",
          relatedEntityType: "invoice",
          relatedEntityId: createdInvoice.id,
        })
      : [];
  if (status === "Cancelled" || status === "Checked in") {
    await writeAuditLog({
      organizationId: appointment.organizationId,
      actorUserId: user.id,
      action:
        status === "Cancelled"
          ? "appointment.cancelled"
          : "appointment.checked-in",
      entityType: "appointment",
      entityId: appointment.id,
    });
  }
  return {
    patch: {
      appointments: [updatedAppointment],
      queueEntries: changedQueueEntries,
      invoices: createdInvoice ? [createdInvoice] : [],
      notifications: [...createdNotifications, ...billingNotifications].filter(
        (notification) => notification.userId === user.id,
      ),
      meta: {
        appointmentSlotLoads: getAppointmentSlotLoads(nextState, appointment.organizationId),
      },
    },
  };
}

export async function advanceQueue(
  user: SafeUser,
  queueEntryId: string,
  status: QueueStatus,
) {
  const state = await measurePerfStep("queue.load-state", () => loadHospitalState());
  const queueEntry = state.queueEntries.find((entry) => entry.id === queueEntryId);

  if (!queueEntry) {
    throw createHttpError(404, "Queue entry not found.");
  }

  const allowed = getAllowedQueueStatuses(queueEntry.status);
  if (!allowed.includes(status)) {
    throw createHttpError(400, "That queue transition is not allowed.");
  }

  const linkedAppointmentId = queueEntry.appointmentId;
  let nextAppointments = state.appointments;

  if (linkedAppointmentId) {
    const appointmentStatus: AppointmentStatus =
      status === "Waiting" || status === "Called"
        ? "Checked in"
        : status === "In consultation"
          ? "In consultation"
          : "Completed";

    nextAppointments = state.appointments.map((appointment) =>
      appointment.id === linkedAppointmentId
        ? { ...appointment, status: appointmentStatus }
        : appointment,
    );
  }

  const updatedQueueEntry = { ...queueEntry, status, updatedAt: queueEntry.updatedAt };
  const updatedAppointment = linkedAppointmentId
    ? nextAppointments.find((appointment) => appointment.id === linkedAppointmentId)
    : undefined;

  await measurePerfStep("queue.write", async () => {
    await updateQueueEntryById({
      queueEntryId: queueEntry.id,
      organizationId: queueEntry.organizationId,
      status,
      updatedAt: queueEntry.updatedAt,
    });

    if (updatedAppointment) {
      await updateAppointmentStatusById({
        appointmentId: updatedAppointment.id,
        organizationId: updatedAppointment.organizationId,
        status: updatedAppointment.status,
      });
    }
  });
  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "queue.updated",
    entityType: "queue-entry",
    entityId: queueEntry.id,
    metadata: {
      status,
    },
  });
  return {
    patch: {
      queueEntries: [updatedQueueEntry],
      appointments: updatedAppointment ? [updatedAppointment] : [],
    },
  };
}

type DepartmentDraft = {
  code: string;
  name: string;
  description: string;
  status: DepartmentStatus;
  location: string;
};

type HospitalSettingsDraft = {
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
};

type StaffDraft = {
  displayName: string;
  email: string;
  role: "doctor" | "receptionist" | "laboratory" | "pharmacist";
  departmentId?: string;
  specialization?: string;
  status: string;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateDepartmentDraft(state: HospitalState, draft: DepartmentDraft) {
  const errors: Record<string, string> = {};

  if (draft.code.trim().length < 2) {
    errors.code = "Enter a department code with at least 2 characters.";
  }

  if (draft.name.trim().length < 2) {
    errors.name = "Enter a department name with at least 2 characters.";
  }

  if (draft.description.trim().length < 10) {
    errors.description = "Enter a clearer department description.";
  }

  if (draft.location.trim().length < 4) {
    errors.location = "Enter a valid department location.";
  }

  const duplicateCode = state.departments.find(
    (department) => department.code.toLowerCase() === draft.code.trim().toLowerCase(),
  );
  if (duplicateCode) {
    errors.code = "That department code is already in use.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function validateHospitalSettingsDraft(draft: HospitalSettingsDraft) {
  const errors: Record<string, string> = {};

  if (draft.hospitalName.trim().length < 2) {
    errors.hospitalName = "Enter a valid hospital name.";
  }

  if (draft.address.trim().length < 5) {
    errors.address = "Enter a valid hospital address.";
  }

  if (draft.city.trim().length < 2) {
    errors.city = "Enter a valid city.";
  }

  if (draft.state.trim().length < 2) {
    errors.state = "Enter a valid state.";
  }

  if (draft.contactPhone.trim().length < 7) {
    errors.contactPhone = "Enter a valid contact phone number.";
  }

  if (!draft.contactEmail.includes("@")) {
    errors.contactEmail = "Enter a valid contact email address.";
  }

  if (draft.emergencyContact.trim().length < 7) {
    errors.emergencyContact = "Enter a valid emergency contact number.";
  }

  if (draft.operatingHours.trim().length < 5) {
    errors.operatingHours = "Enter valid operating hours.";
  }

  if (draft.timezone.trim().length < 3) {
    errors.timezone = "Enter a valid timezone.";
  }

  if (draft.defaultLanguage.trim().length < 2) {
    errors.defaultLanguage = "Enter a valid default language.";
  }

  const capacityFields: Array<keyof Pick<
    HospitalSettingsDraft,
    | "defaultConsultationSlotDurationMinutes"
    | "defaultDoctorSlotCapacity"
    | "morningSessionCapacity"
    | "afternoonSessionCapacity"
    | "eveningSessionCapacity"
    | "defaultLabSlotCapacity"
  >> = [
    "defaultConsultationSlotDurationMinutes",
    "defaultDoctorSlotCapacity",
    "morningSessionCapacity",
    "afternoonSessionCapacity",
    "eveningSessionCapacity",
    "defaultLabSlotCapacity",
  ];

  for (const field of capacityFields) {
    const value = draft[field];
    if (!Number.isInteger(value) || value < 1) {
      errors[field] = "Enter a value of at least 1.";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function validateStaffDraft(state: HospitalState, users: UserRecord[], draft: StaffDraft) {
  const errors: Record<string, string> = {};

  if (draft.displayName.trim().length < 2) {
    errors.displayName = "Enter a full name with at least 2 characters.";
  }

  const email = draft.email.trim().toLowerCase();
  if (!email.includes("@")) {
    errors.email = "Enter a valid email address.";
  }

  if (users.some((user) => user.email.toLowerCase() === email)) {
    errors.email = "An account already exists with that email address.";
  }

  if (draft.role === "doctor") {
    if (!draft.departmentId) {
      errors.departmentId = "Select a department for the doctor.";
    }

    if (!draft.specialization || draft.specialization.trim().length < 2) {
      errors.specialization = "Enter a doctor specialization.";
    }
  }

  if (
    draft.departmentId &&
    !state.departments.some((department) => department.id === draft.departmentId)
  ) {
    errors.departmentId = "Select a valid department.";
  }

  if (draft.status.trim().length < 2) {
    errors.status = "Select a staff status.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function mapDoctorStatus(status: string): DoctorStatus {
  if (status === "On break") {
    return "On break";
  }

  if (status === "Off duty") {
    return "Off duty";
  }

  return "Available";
}

export async function createDepartment(user: SafeUser, draft: DepartmentDraft) {
  const state = await loadHospitalState();
  const validation = validateDepartmentDraft(state, draft);

  if (!validation.isValid) {
    throw createHttpError(400, "Please review the department details provided.", {
      errors: validation.errors,
    });
  }

  const department: DepartmentRecord = {
    id: `dept-${slugify(draft.name)}-${randomBytes(3).toString("hex")}`,
    organizationId: user.organizationId,
    code: draft.code.trim().toUpperCase(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    status: draft.status,
    location: draft.location.trim(),
  };

  await saveHospitalState({
    ...state,
    departments: [department, ...state.departments],
  });

  return getScopedHospitalStateForUser(user);
}

export async function updateHospitalSettings(user: SafeUser, draft: HospitalSettingsDraft) {
  if (user.role !== "administrator") {
    throw createHttpError(403, "You do not have access to update hospital settings.");
  }

  const state = await loadHospitalState();
  const validation = validateHospitalSettingsDraft(draft);

  if (!validation.isValid) {
    throw createHttpError(400, "Please review the hospital settings provided.", {
      errors: validation.errors,
    });
  }

  const nextSessions = state.bookingCapacity.sessions.map((session) => {
    if (session.id === "morning") {
      return { ...session, maxAppointments: draft.morningSessionCapacity };
    }

    if (session.id === "afternoon") {
      return { ...session, maxAppointments: draft.afternoonSessionCapacity };
    }

    if (session.id === "evening") {
      return { ...session, maxAppointments: draft.eveningSessionCapacity };
    }

    return session;
  });

  const nextState: HospitalState = {
    ...state,
    organization: {
      ...state.organization,
      name: draft.hospitalName.trim(),
      address: draft.address.trim(),
      city: draft.city.trim(),
      state: draft.state.trim(),
      contactPhone: draft.contactPhone.trim(),
      contactEmail: draft.contactEmail.trim().toLowerCase(),
      emergencyContact: draft.emergencyContact.trim(),
      operatingHours: draft.operatingHours.trim(),
      timezone: draft.timezone.trim(),
      defaultLanguage: draft.defaultLanguage.trim(),
      emergencyServicesEnabled: draft.emergencyServicesEnabled,
      defaultConsultationSlotDurationMinutes: draft.defaultConsultationSlotDurationMinutes,
    },
    bookingCapacity: {
      ...state.bookingCapacity,
      defaultMaxAppointmentsPerSession:
        Math.max(
          draft.morningSessionCapacity,
          draft.afternoonSessionCapacity,
          draft.eveningSessionCapacity,
        ),
      doctorSlotCapacity: draft.defaultDoctorSlotCapacity,
      labSlotCapacity: draft.defaultLabSlotCapacity,
      sessions: nextSessions,
    },
  };

  await measurePerfStep("settings.write", () =>
    upsertHospitalSettings({
      organization: nextState.organization,
      doctorSlotCapacity: nextState.bookingCapacity.doctorSlotCapacity,
      defaultMaxAppointmentsPerSession: nextState.bookingCapacity.defaultMaxAppointmentsPerSession,
      labSlotCapacity: nextState.bookingCapacity.labSlotCapacity,
      configuredSupportLines: nextState.configuredSupportLines,
      sessions: nextState.bookingCapacity.sessions,
    }),
  );
  return {
    patch: {
      organization: nextState.organization,
      bookingCapacity: nextState.bookingCapacity,
      meta: {
        appointmentSlotLoads: getAppointmentSlotLoads(nextState, nextState.organization.id),
        labSlotLoads: getLabSlotLoads(nextState, nextState.organization.id),
      },
    },
  };
}

export async function recordInvoicePayment(
  user: SafeUser,
  invoiceId: string,
  draft: PaymentDraft,
) {
  const state = await measurePerfStep("billing.load-state", () => loadHospitalState());
  const invoice = state.invoices.find((currentInvoice) => currentInvoice.id === invoiceId);

  if (!invoice) {
    throw createHttpError(404, "Invoice not found.");
  }

  const canManageBilling = user.role === "administrator" || user.role === "receptionist";
  const isPatientOwner = user.role === "patient" && invoice.patientId === user.id;

  if (!canManageBilling && !isPatientOwner) {
    throw createHttpError(403, "You do not have access to this invoice.");
  }

  if (invoice.amountDueCents <= 0 || invoice.paymentStatus === "Paid") {
    throw createHttpError(400, "This invoice has already been paid.", {
      errors: { amount: "This invoice has already been paid." },
    });
  }

  if (draft.amount <= 0) {
    throw createHttpError(400, "Payment amount must be greater than zero.", {
      errors: { amount: "Payment amount must be greater than zero." },
    });
  }

  const amountCents = Math.round(draft.amount * 100);
  if (amountCents > invoice.amountDueCents) {
    throw createHttpError(400, "Payment cannot exceed the outstanding balance.", {
      errors: { amount: "Payment cannot exceed the outstanding balance." },
    });
  }

  const payment: PaymentRecord = {
    id: createPaymentId(),
    invoiceId: invoice.id,
    patientId: invoice.patientId,
    organizationId: invoice.organizationId,
    amountCents,
    method: draft.method,
    referenceNumber: draft.referenceNumber?.trim() || undefined,
    paidAt: new Date().toISOString(),
    recordedBy: {
      id: user.id,
      name: user.displayName,
    },
  };
  const amountPaidCents = invoice.amountPaidCents + amountCents;
  const amountDueCents = Math.max(0, invoice.totalCents - amountPaidCents);
  const paymentStatus = buildInvoiceStatus(invoice.totalCents, amountPaidCents);
  const updatedInvoice: InvoiceRecord = {
    ...invoice,
    amountPaidCents,
    amountDueCents,
    paymentStatus,
    payments: [payment, ...invoice.payments],
  };

  await measurePerfStep("billing.write", () =>
    withTransaction(async (client) => {
      await client.query(
        `insert into payments (
          id, invoice_id, organization_id, patient_id, amount_cents, method, reference_number,
          paid_at, recorded_by_id, recorded_by_name
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          payment.id,
          payment.invoiceId,
          payment.organizationId,
          payment.patientId,
          payment.amountCents,
          payment.method,
          payment.referenceNumber ?? null,
          payment.paidAt,
          payment.recordedBy?.id ?? null,
          payment.recordedBy?.name ?? null,
        ],
      );
      await client.query(
        `update invoices
         set amount_paid_cents = $3,
             amount_due_cents = $4,
             payment_status = $5,
             updated_at = now()
         where id = $1 and organization_id = $2`,
        [
          invoice.id,
          invoice.organizationId,
          amountPaidCents,
          amountDueCents,
          paymentStatus,
        ],
      );
    }),
  );
  const createdNotifications = await notifyUsers({
    organizationId: invoice.organizationId,
    userIds: [invoice.patientId],
    title: "Payment recorded",
    message: `A payment was recorded for invoice ${invoice.invoiceNumber}.`,
    category: "Billing",
    relatedEntityType: "invoice",
    relatedEntityId: invoice.id,
  });
  await writeAuditLog({
    organizationId: invoice.organizationId,
    actorUserId: user.id,
    action: "billing.payment-recorded",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: {
      paymentId: payment.id,
    },
  });

  return {
    patch: {
      invoices: [updatedInvoice],
      notifications: createdNotifications.filter((notification) => notification.userId === user.id),
    },
  };
}

export async function createInventoryBatch(user: SafeUser, draft: InventoryItemDraft) {
  if (user.role !== "pharmacist") {
    throw createHttpError(403, "You do not have access to add inventory.");
  }

  if (!draft.medicineName.trim()) {
    throw createHttpError(400, "Medicine name is required.", {
      errors: { medicineName: "Medicine name is required." },
    });
  }

  if (draft.quantityInStock <= 0) {
    throw createHttpError(400, "Quantity must be greater than zero.", {
      errors: { quantityInStock: "Quantity must be greater than zero." },
    });
  }

  if (!draft.expiryDate) {
    throw createHttpError(400, "Expiry date is required.", {
      errors: { expiryDate: "Expiry date is required." },
    });
  }

  const now = new Date().toISOString();
  const catalogMedicine = await ensureMedicineCatalogEntry({
    organizationId: user.organizationId,
    medicineName: draft.medicineName,
    unit: draft.unit,
    genericName: draft.genericName,
  });
  const item: InventoryItemRecord = {
    id: createInventoryItemId(),
    organizationId: user.organizationId,
    medicineId: catalogMedicine.id,
    medicineName: draft.medicineName.trim(),
    genericName: draft.genericName?.trim() || undefined,
    batchNumber: draft.batchNumber.trim(),
    quantityInStock: Math.round(draft.quantityInStock),
    unit: draft.unit.trim(),
    unitPriceCents: Math.round(draft.unitPrice * 100),
    expiryDate: draft.expiryDate,
    reorderLevel: Math.round(draft.reorderLevel),
    manufacturer: draft.manufacturer?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  await insertInventoryItem(item);
  await writeAuditLog({
    organizationId: item.organizationId,
    actorUserId: user.id,
    action: "inventory.batch-created",
    entityType: "inventory-item",
    entityId: item.id,
  });

  return {
    patch: {
      medicineCatalog: [catalogMedicine],
      inventoryItems: [item],
    },
  };
}

export async function updateInventoryBatch(
  user: SafeUser,
  inventoryItemId: string,
  draft: InventoryItemDraft,
) {
  if (user.role !== "pharmacist") {
    throw createHttpError(403, "You do not have access to update inventory.");
  }

  const state = await loadHospitalState();
  const existingItem = state.inventoryItems.find((item) => item.id === inventoryItemId);

  if (!existingItem) {
    throw createHttpError(404, "Inventory item not found.");
  }

  const updatedItem: InventoryItemRecord = {
    medicineId: existingItem.medicineId,
    ...existingItem,
    medicineName: draft.medicineName.trim(),
    genericName: draft.genericName?.trim() || undefined,
    batchNumber: draft.batchNumber.trim(),
    quantityInStock: Math.round(draft.quantityInStock),
    unit: draft.unit.trim(),
    unitPriceCents: Math.round(draft.unitPrice * 100),
    expiryDate: draft.expiryDate,
    reorderLevel: Math.round(draft.reorderLevel),
    manufacturer: draft.manufacturer?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };

  const catalogMedicine = await ensureMedicineCatalogEntry({
    organizationId: updatedItem.organizationId,
    medicineName: updatedItem.medicineName,
    unit: updatedItem.unit,
    genericName: updatedItem.genericName,
  });
  updatedItem.medicineId = catalogMedicine.id;

  await updateInventoryItemRecord(updatedItem);
  await writeAuditLog({
    organizationId: updatedItem.organizationId,
    actorUserId: user.id,
    action: "inventory.batch-updated",
    entityType: "inventory-item",
    entityId: updatedItem.id,
  });

  return {
    patch: {
      medicineCatalog: [catalogMedicine],
      inventoryItems: [updatedItem],
    },
  };
}

export async function markNotificationAsRead(user: SafeUser, notificationId: string) {
  const state = await loadHospitalState();
  const notification = state.notifications.find((item) => item.id === notificationId);

  if (!notification || notification.organizationId !== user.organizationId || notification.userId !== user.id) {
    throw createHttpError(404, "Notification not found.");
  }

  if (!notification.read) {
    await markNotificationReadById({
      notificationId,
      organizationId: user.organizationId,
      userId: user.id,
    });
  }

  return {
    patch: {
      notifications: [{ ...notification, read: true }],
    },
  };
}

export async function markAllUserNotificationsRead(user: SafeUser) {
  const state = await loadHospitalState();
  const updatedNotifications = state.notifications
    .filter((notification) => notification.organizationId === user.organizationId && notification.userId === user.id)
    .map((notification) => ({ ...notification, read: true }));

  await markAllNotificationsRead({
    organizationId: user.organizationId,
    userId: user.id,
  });

  return {
    patch: {
      notifications: updatedNotifications,
    },
  };
}

export async function createLabRequest(user: SafeUser, draft: LabRequestDraft) {
  if (user.role !== "patient") {
    throw createHttpError(403, "Only patients can create lab test requests.");
  }

  const state = await loadHospitalState();
  const validation = validateLabRequestDraft(state, draft);

  if (!validation.isValid) {
    throw createHttpError(400, "Please correct the lab test details provided.", {
      errors: validation.errors,
    });
  }

  const selectedTest = state.labTests.find((test) => test.id === draft.testId);
  if (!selectedTest) {
    throw createHttpError(400, "The selected lab test could not be found.");
  }

  if ((selectedTest.priceCents ?? 0) <= 0) {
    throw createHttpError(400, "Billing price is not configured for this service.", {
      errors: { testId: "Billing price is not configured for this service." },
    });
  }

    const request: LabRequestRecord = {
    id: createLabRequestId(state),
    patientId: user.id,
    hospitalId: user.organizationId,
    organizationId: user.organizationId,
    patientName: user.patientName ?? user.displayName,
    testId: selectedTest.id,
    testName: selectedTest.name,
    departmentId: "dept-laboratory",
    requestedDate: draft.requestedDate,
    requestedTime: draft.requestedTime,
    status: "Requested",
      createdAt: new Date().toISOString(),
    };

    const invoice =
      state.invoices.find(
        (currentInvoice) =>
          currentInvoice.organizationId === request.organizationId &&
          currentInvoice.sourceType === "lab-request" &&
          currentInvoice.sourceId === request.id,
      ) ??
      buildInvoiceRecord({
        patientId: request.patientId,
        patientName: request.patientName,
        organizationId: request.organizationId,
        hospitalId: request.hospitalId,
        sourceType: "lab-request",
        sourceId: request.id,
        dueDate: request.requestedDate,
        items: [
          {
            description: request.testName,
            category: "Laboratory",
            quantity: 1,
            unitAmountCents: selectedTest.priceCents ?? 0,
          },
        ],
      });

    const nextState: HospitalState = {
      ...state,
      labRequests: [request, ...state.labRequests],
      invoices: state.invoices.some((currentInvoice) => currentInvoice.sourceId === request.id)
        ? state.invoices
        : [invoice, ...state.invoices],
    };

    await measurePerfStep("lab-request.create.write", () => insertLabRequest(request));
    if (!state.invoices.some((currentInvoice) => currentInvoice.sourceId === request.id)) {
      await insertInvoice(invoice);
      await insertInvoiceItems(invoice.items);
    }
    const users = await loadUsers();
    const labUserIds = users
      .filter(
        (currentUser) =>
          currentUser.role === "laboratory" &&
          currentUser.organizationId === request.organizationId,
      )
      .map((currentUser) => currentUser.id);
    const createdNotifications = await notifyUsers({
      organizationId: request.organizationId,
      userIds: [user.id, ...labUserIds],
      title: "Laboratory request booked",
      message: `${request.testName} was requested for ${request.requestedDate} at ${request.requestedTime}.`,
      category: "Laboratory",
      relatedEntityType: "lab-request",
      relatedEntityId: request.id,
    });
    const billingNotifications = !state.invoices.some((currentInvoice) => currentInvoice.sourceId === request.id)
      ? await notifyUsers({
          organizationId: request.organizationId,
          userIds: [user.id],
          title: "Invoice generated",
          message: `Invoice ${invoice.invoiceNumber} was created for ${request.testName}.`,
          category: "Billing",
          relatedEntityType: "invoice",
          relatedEntityId: invoice.id,
        })
      : [];
    await writeAuditLog({
      organizationId: user.organizationId,
      actorUserId: user.id,
    action: "lab-request.created",
    entityType: "lab-request",
    entityId: request.id,
    metadata: {
      testId: request.testId,
    },
  });
  return {
      patch: {
        labRequests: [request],
        invoices: !state.invoices.some((currentInvoice) => currentInvoice.sourceId === request.id)
          ? [invoice]
          : [],
        notifications: [...createdNotifications, ...billingNotifications].filter(
          (notification) => notification.userId === user.id,
        ),
        meta: {
          labSlotLoads: getLabSlotLoads(nextState, request.organizationId),
        },
    },
  };
}

export async function createPatientProfile(user: SafeUser, draft: PatientProfileDraft) {
  if (user.role !== "receptionist") {
    throw createHttpError(403, "You do not have access to create patient profiles.");
  }

  const users = await loadUsers();
  const validation = validatePatientProfileDraft(users, user.organizationId, draft);

  if (!validation.isValid) {
    throw createHttpError(400, "Please review the patient profile details provided.", {
      errors: validation.errors,
    });
  }

  const passwordHash = await hashPassword(draft.password.trim());
  const formattedAddress = formatStructuredAddress(draft);
  const nextUser: UserRecord = {
    id: `user-patient-${randomBytes(6).toString("hex")}`,
    organizationId: user.organizationId,
    email: draft.email.trim().toLowerCase(),
    displayName: draft.fullName.trim(),
    role: "patient",
    passwordHash,
    patientName: draft.fullName.trim(),
    phoneNumber: draft.phoneNumber.trim(),
    gender: draft.gender.trim(),
    dateOfBirth: draft.dateOfBirth,
    bloodGroup: draft.bloodGroup.trim(),
    address: formattedAddress,
    addressLine1: draft.addressLine1.trim(),
    addressLine2: draft.addressLine2?.trim() || undefined,
    city: draft.city.trim(),
    state: draft.state.trim(),
    postalCode: draft.postalCode.trim(),
    emergencyContactName: draft.emergencyContactName.trim(),
    emergencyContactPhone: draft.emergencyContactPhone.trim(),
    emergencyContact: `${draft.emergencyContactName.trim()} · ${draft.emergencyContactPhone.trim()}`,
    allergies: draft.allergies.trim() || "None reported",
    medicalConditions: draft.medicalConditions.trim() || "None reported",
    preferredLanguage: draft.preferredLanguage?.trim() || "English",
    emailVerified: false,
    passwordResetRequired: false,
  };

  await saveUsers([...users, nextUser]);
  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "patient.registration.created-by-staff",
    entityType: "user",
    entityId: nextUser.id,
  });
  return getScopedHospitalStateForUser(user);
}

export async function updatePatientProfile(user: SafeUser, draft: UserProfileDraft) {
  const [state, users] = await Promise.all([loadHospitalState(), loadUsers()]);
  const normalizedDraft = normalizeProfileDraftForRole(user.role, draft as Record<string, unknown>);
  const validation = validateSharedProfileDraft(user.role, normalizedDraft);

  if (!validation.isValid) {
    throw createHttpError(400, "Please review the profile details provided.", {
      errors: validation.errors,
    });
  }

  const userIndex = users.findIndex((currentUser) => currentUser.id === user.id);
  if (userIndex === -1) {
    throw createHttpError(404, "Patient profile not found.");
  }

  const currentUser = users[userIndex];
  const previousName = currentUser.patientName ?? currentUser.displayName;
  const nextName = normalizedDraft.fullName.trim();
  const normalizedEmergency = normalizeEmergencyContactFields({
    emergencyContact: currentUser.emergencyContact,
    emergencyContactName: normalizedDraft.emergencyContactName,
    emergencyContactPhone: normalizedDraft.emergencyContactPhone,
  });
  const formattedAddress = formatStructuredAddress({
    addressLine1: normalizedDraft.addressLine1,
    addressLine2: normalizedDraft.addressLine2,
    city: normalizedDraft.city,
    state: normalizedDraft.state,
    postalCode: normalizedDraft.postalCode,
    fallbackAddress: normalizedDraft.address || currentUser.address,
  });
  const nextUsers = [...users];
  const nextUser: UserRecord = {
    ...currentUser,
    displayName: nextName,
    phoneNumber: normalizedDraft.phoneNumber?.trim() || undefined,
    gender: normalizedDraft.gender?.trim() || undefined,
    dateOfBirth: normalizedDraft.dateOfBirth || undefined,
    bloodGroup: normalizedDraft.bloodGroup?.trim() || undefined,
    address: formattedAddress,
    addressLine1: normalizedDraft.addressLine1?.trim() || undefined,
    addressLine2: normalizedDraft.addressLine2?.trim() || undefined,
    city: normalizedDraft.city?.trim() || undefined,
    state: normalizedDraft.state?.trim() || undefined,
    postalCode: normalizedDraft.postalCode?.trim() || undefined,
    emergencyContactName: normalizedEmergency.emergencyContactName,
    emergencyContactPhone: normalizedEmergency.emergencyContactPhone,
    emergencyContact:
      normalizedEmergency.emergencyContactName && normalizedEmergency.emergencyContactPhone
        ? `${normalizedEmergency.emergencyContactName} · ${normalizedEmergency.emergencyContactPhone}`
        : currentUser.emergencyContact,
    allergies: normalizedDraft.allergies?.trim() || undefined,
    medicalConditions: normalizedDraft.medicalConditions?.trim() || undefined,
    preferredLanguage: normalizedDraft.preferredLanguage?.trim() || undefined,
    qualifications: normalizedDraft.qualifications?.trim() || undefined,
    experience: normalizedDraft.experience?.trim() || undefined,
    languages: normalizedDraft.languages?.trim() || undefined,
    consultationFee: normalizedDraft.consultationFee?.trim() || undefined,
    availableTimings: normalizedDraft.availableTimings?.trim() || undefined,
    deskLabel: normalizedDraft.deskLabel?.trim() || undefined,
    consultationMode: normalizedDraft.consultationMode?.trim() || undefined,
  };

  if (user.role === "patient") {
    nextUser.patientName = nextName;
    nextUser.allergies = normalizedDraft.allergies?.trim() || "None reported";
    nextUser.medicalConditions = normalizedDraft.medicalConditions?.trim() || "None reported";
  }

  nextUsers[userIndex] = nextUser;

  const nextState: HospitalState = {
    ...state,
    doctors:
      user.role === "doctor" && user.doctorId
        ? state.doctors.map((doctor) =>
            doctor.id === user.doctorId
              ? {
                  ...doctor,
                  name: nextName,
                  availability:
                    normalizedDraft.availableTimings?.trim() || doctor.availability,
                  shiftLabel:
                    normalizedDraft.availableTimings?.trim() || doctor.shiftLabel,
                }
              : doctor,
          )
        : state.doctors,
    appointments:
      user.role === "patient"
        ? state.appointments.map((appointment) =>
            appointment.patientId === user.id || appointment.patientName === previousName
              ? {
                  ...appointment,
                  patientId: user.id,
                  patientName: nextName,
                }
              : appointment,
          )
        : state.appointments,
    queueEntries:
      user.role === "patient"
        ? state.queueEntries.map((entry) =>
            entry.patientName === previousName ? { ...entry, patientName: nextName } : entry,
          )
        : state.queueEntries,
    labRequests:
      user.role === "patient"
        ? state.labRequests.map((request) =>
            request.patientId === user.id || request.patientName === previousName
              ? {
                  ...request,
                  patientId: user.id,
                  patientName: nextName,
                }
              : request,
          )
        : state.labRequests,
    medicalRecords:
      user.role === "patient"
        ? state.medicalRecords.map((record) =>
            record.patientId === user.id || record.patientName === previousName
              ? {
                  ...record,
                  patientId: user.id,
                  patientName: nextName,
                }
              : record,
          )
        : user.role === "doctor" && user.doctorId
          ? state.medicalRecords.map((record) =>
              record.doctorId === user.doctorId ? { ...record, doctorName: nextName } : record,
            )
          : state.medicalRecords,
    prescriptions:
      user.role === "patient"
        ? state.prescriptions.map((prescription) =>
            prescription.patientId === user.id || prescription.patientName === previousName
              ? {
                  ...prescription,
                  patientId: user.id,
                  patientName: nextName,
                }
              : prescription,
          )
        : user.role === "doctor" && user.doctorId
          ? state.prescriptions.map((prescription) =>
              prescription.doctorId === user.doctorId
                ? { ...prescription, doctorName: nextName }
                : prescription,
            )
          : state.prescriptions,
  };

  await Promise.all([saveUsers(nextUsers), saveHospitalState(nextState)]);

  return {
    sessionUser: toSafeUserSummary(nextUsers[userIndex]),
  };
}

export async function createStaffMember(user: SafeUser, draft: StaffDraft) {
  const [state, users] = await Promise.all([loadHospitalState(), loadUsers()]);
  const validation = validateStaffDraft(state, users, draft);

  if (!validation.isValid) {
    throw createHttpError(400, "Please review the staff details provided.", {
      errors: validation.errors,
    });
  }

  const passwordHash = await hashPassword(DEMO_ACCOUNT_PASSWORD);
  const nextUser: UserRecord = {
    id: `user-staff-${randomBytes(6).toString("hex")}`,
    organizationId: user.organizationId,
    email: draft.email.trim().toLowerCase(),
    displayName: draft.displayName.trim(),
    role: draft.role,
    passwordHash,
    departmentId: draft.departmentId,
    staffStatus: draft.status.trim(),
  };

  let nextState = state;

  if (draft.role === "doctor") {
    const doctorId = `doc-${slugify(draft.displayName)}-${randomBytes(3).toString("hex")}`;
    nextUser.doctorId = doctorId;

    nextState = {
      ...state,
      doctors: [
        {
          id: doctorId,
          organizationId: user.organizationId,
          name: draft.displayName.trim(),
          specialization: draft.specialization!.trim(),
          departmentId: draft.departmentId!,
          status: mapDoctorStatus(draft.status),
          availability: "Available for scheduling",
          shiftLabel: "Shift to be assigned",
        },
        ...state.doctors,
      ],
    };
  }

  await Promise.all([
    saveUsers([...users, nextUser]),
    saveHospitalState(nextState),
  ]);
  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "staff.created",
    entityType: "user",
    entityId: nextUser.id,
    metadata: {
      role: nextUser.role,
    },
  });

  return getScopedHospitalStateForUser(user);
}

export async function updateUserAccountStatus(
  user: SafeUser,
  targetUserId: string,
  status: "Active" | "Deactivated",
) {
  if (user.role !== "administrator") {
    throw createHttpError(403, "You do not have access to manage account status.");
  }

  if (user.id === targetUserId) {
    throw createHttpError(400, "You cannot change the status of your own signed-in account.");
  }

  const users = await loadUsers();
  const userIndex = users.findIndex((currentUser) => currentUser.id === targetUserId);

  if (userIndex === -1) {
    throw createHttpError(404, "User account not found.");
  }

  const targetUser = users[userIndex];

  if (targetUser.organizationId !== user.organizationId) {
    throw createHttpError(403, "You do not have access to manage this account.");
  }

  if (targetUser.role === "patient") {
    throw createHttpError(400, "This staff management area can only manage staff and administrator accounts.");
  }

  const currentStatus = targetUser.staffStatus?.trim() || "Active";
  if (currentStatus === status) {
    return getScopedHospitalStateForUser(user);
  }

  const nextUsers = [...users];
  nextUsers[userIndex] = {
    ...targetUser,
    staffStatus: status,
  };

  await saveUsers(nextUsers);

  if (status === "Deactivated") {
    await revokeSessionsForUser(targetUser.id);
  }

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: status === "Deactivated" ? "user.account.deactivated" : "user.account.reactivated",
    entityType: "user",
    entityId: targetUser.id,
    metadata: {
      role: targetUser.role,
      email: targetUser.email,
    },
  });

  return getScopedHospitalStateForUser(user);
}
