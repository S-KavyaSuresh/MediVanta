import createHttpError from "http-errors";
import { randomBytes } from "node:crypto";

import type {
  AppointmentDraft,
  AppointmentRecord,
  AppointmentSlotLoadRecord,
  AppointmentStatus,
  ClinicalAttachmentDraft,
  ClinicalAttachmentRecord,
  DepartmentRecord,
  DepartmentStatus,
  DoctorRecord,
  DoctorStatus,
  EmergencyVisitDraft,
  EmergencyVisitRecord,
  FamilyMemberDraft,
  FamilyMemberRecord,
  HospitalBranchRecord,
  HospitalState,
  HospitalStateResponse,
  InventoryItemDraft,
  InventoryItemRecord,
  InvoiceItemRecord,
  InvoiceRecord,
  InvoiceStatus,
  MedicalHistoryEntryDraft,
  MedicalHistoryEntryRecord,
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
  PatientJourneyRecord,
  PrescriptionDraft,
  PrescriptionRecord,
  PrescriptionStatus,
  QueuePriority,
  QueueEntryRecord,
  QueueStatus,
  SafeUser,
  TelemedicineMessageRecord,
  TelemedicineSessionStatus,
  UserRole,
  UserRecord,
} from "../domain/types.js";
import { getPasswordPolicyErrors, hashPassword } from "../auth/password.js";
import { isDatabaseConfigured, query, withTransaction } from "../db/client.js";
import { loadHospitalState, loadUsers, saveHospitalState, saveUsers } from "./seed-service.js";
import { writeAuditLog } from "./audit-service.js";
import {
  type StoredClinicalFile,
  uploadClinicalFileToCloudinary,
} from "./cloudinary-storage-service.js";
import { getCurrentLocalDateIso } from "../utils/date.js";
import { measurePerfStep } from "../utils/perf-trace.js";
import {
  insertInvoice,
  insertInvoiceItems,
  insertInventoryItem,
  insertLabReport,
  insertLabRequest,
  insertMedicalRecord,
  insertNotifications,
  insertEmergencyVisit,
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
  updatePrescriptionRecord,
  updateEmergencyVisitRecord,
  updatePatientJourneyRecord,
  updateQueueEntryById,
  updateQueueEntriesForAppointment,
  updateQueueStatusesByAppointment,
} from "../repositories/postgres-store.js";

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  return Number(value);
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

function isCapacityConsumingLabRequest(status: LabRequestRecord["status"]) {
  return status !== "Completed" && status !== "Missed";
}

function getSessionForTime(state: HospitalState, time: string) {
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

function isDoctorOnBreakAtSlot(doctor: DoctorRecord | undefined, appointmentTime: string) {
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

function isClosedAppointmentTimeSlot(appointmentTime: string) {
  return appointmentTime === "13:00" || appointmentTime === "13:30";
}

function isActiveStaffUser(user: SafeUser | UserRecord) {
  return user.staffStatus?.trim().toLowerCase() !== "deactivated";
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

function shouldBecomeNoShow(appointment: AppointmentRecord, now = new Date()) {
  if (appointment.status !== "Scheduled") {
    return false;
  }

  return isAppointmentPastCloseWindow(appointment, now);
}

function isAppointmentPastCloseWindow(appointment: AppointmentRecord, now = new Date()) {
  const appointmentTime = new Date(`${appointment.appointmentDate}T${appointment.appointmentTime}:00`);
  if (Number.isNaN(appointmentTime.getTime())) {
    return false;
  }

  return now.getTime() > appointmentTime.getTime() + 30 * 60 * 1000;
}

function shouldAutoCloseOpenAppointment(appointment: AppointmentRecord, now = new Date()) {
  return (
    (appointment.status === "Checked in" || appointment.status === "In consultation") &&
    isAppointmentPastCloseWindow(appointment, now)
  );
}

async function reconcileNoShowAppointments(state: HospitalState, now = new Date()) {
  const staleAppointments = state.appointments.filter((appointment) => shouldBecomeNoShow(appointment, now));
  const openExpiredAppointments = state.appointments.filter((appointment) =>
    shouldAutoCloseOpenAppointment(appointment, now),
  );
  const appointmentsToClose = [...staleAppointments, ...openExpiredAppointments];

  if (appointmentsToClose.length === 0) {
    return state;
  }

  await Promise.all(
    appointmentsToClose.flatMap((appointment) => [
      updateAppointmentStatusById({
        appointmentId: appointment.id,
        organizationId: appointment.organizationId,
        status: shouldBecomeNoShow(appointment, now) ? "No Show" : "Completed",
      }),
      updateQueueStatusesByAppointment({
        organizationId: appointment.organizationId,
        appointmentId: appointment.id,
        status: "Completed",
        updatedAt: `${appointment.appointmentDate}T23:59:00`,
        excludeCompleted: true,
      }),
    ]),
  );

  return {
    ...state,
    appointments: state.appointments.map<AppointmentRecord>((appointment) =>
      shouldBecomeNoShow(appointment, now)
        ? { ...appointment, status: "No Show" as AppointmentStatus }
        : shouldAutoCloseOpenAppointment(appointment, now)
          ? { ...appointment, status: "Completed" as AppointmentStatus }
        : appointment,
    ),
    queueEntries: state.queueEntries.map<QueueEntryRecord>((entry) =>
      appointmentsToClose.some((appointment) => appointment.id === entry.appointmentId) &&
      entry.status !== "Completed"
        ? { ...entry, status: "Completed" as QueueStatus }
        : entry,
    ),
  };
}

function shouldBecomeMissedLabRequest(request: LabRequestRecord, now = new Date()) {
  if (request.status !== "Requested" && request.status !== "Scheduled") {
    return false;
  }

  const requestedAt = new Date(`${request.requestedDate}T${request.requestedTime}:00`);
  if (Number.isNaN(requestedAt.getTime())) {
    return false;
  }

  return now.getTime() > requestedAt.getTime() + 30 * 60 * 1000;
}

async function reconcileStaleLabRequests(state: HospitalState, now = new Date()) {
  const staleRequests = state.labRequests.filter((request) =>
    shouldBecomeMissedLabRequest(request, now),
  );

  if (staleRequests.length === 0) {
    return state;
  }

  await Promise.all(
    staleRequests.map((request) =>
      updateLabRequestStatusById({
        labRequestId: request.id,
        organizationId: request.organizationId,
        status: "Missed",
      }),
    ),
  );

  return {
    ...state,
    labRequests: state.labRequests.map<LabRequestRecord>((request) =>
      shouldBecomeMissedLabRequest(request, now) ? { ...request, status: "Missed" } : request,
    ),
  };
}

function getDoctorById(state: HospitalState, doctorId: string) {
  return state.doctors.find((doctor) => doctor.id === doctorId);
}

function getAppointmentById(state: HospitalState, appointmentId: string) {
  return state.appointments.find((appointment) => appointment.id === appointmentId);
}

function getFamilyMemberById(state: HospitalState, familyMemberId?: string) {
  if (!familyMemberId) {
    return undefined;
  }

  return state.familyMembers?.find((member) => member.id === familyMemberId);
}

function getPatientDisplayName(user: SafeUser) {
  return user.patientName ?? user.displayName;
}

function resolveClinicalPatientContext(
  state: HospitalState,
  user: SafeUser,
  input: {
    patientId?: string;
    familyMemberId?: string;
    appointmentId?: string;
  },
) {
  if (user.role === "patient") {
    if (input.patientId && input.patientId !== user.id) {
      throw createHttpError(403, "You do not have access to this workspace.");
    }

    const familyMember = getFamilyMemberById(state, input.familyMemberId);
    if (
      input.familyMemberId &&
      (!familyMember || familyMember.primaryPatientUserId !== user.id)
    ) {
      throw createHttpError(403, "You do not have access to this workspace.");
    }

    return {
      patientUserId: user.id,
      patientName: familyMember?.fullName ?? getPatientDisplayName(user),
      familyMember,
      appointment: undefined,
    };
  }

  if (!input.patientId?.trim()) {
    throw createHttpError(400, "A patient context is required for this update.");
  }

  const patientUserId = input.patientId.trim();
  const familyMember = getFamilyMemberById(state, input.familyMemberId);

  if (
    familyMember &&
    familyMember.primaryPatientUserId !== patientUserId
  ) {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  const appointment = input.appointmentId?.trim()
    ? getAppointmentById(state, input.appointmentId.trim())
    : undefined;

  if (appointment && appointment.patientId !== patientUserId) {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  if (user.role === "doctor") {
    const matchingAppointments = state.appointments.filter(
      (currentAppointment) =>
        currentAppointment.organizationId === user.organizationId &&
        currentAppointment.doctorId === user.doctorId &&
        currentAppointment.patientId === patientUserId,
    );

    if (matchingAppointments.length === 0) {
      throw createHttpError(403, "You do not have access to this workspace.");
    }

    if (appointment && appointment.doctorId !== user.doctorId) {
      throw createHttpError(403, "You do not have access to this workspace.");
    }

    if (familyMember) {
      const familyAppointmentMatch = appointment
        ? appointment.familyMemberId === familyMember.id
        : matchingAppointments.some(
            (currentAppointment) => currentAppointment.familyMemberId === familyMember.id,
          );

      if (!familyAppointmentMatch) {
        throw createHttpError(403, "You do not have access to this workspace.");
      }
    }

    return {
      patientUserId,
      patientName: familyMember?.fullName ?? appointment?.patientName ?? "Patient",
      familyMember,
      appointment,
    };
  }

  if (user.role === "administrator") {
    return {
      patientUserId,
      patientName: familyMember?.fullName ?? appointment?.patientName ?? "Patient",
      familyMember,
      appointment,
    };
  }

  throw createHttpError(403, "You do not have access to this workspace.");
}

function canPatientManageAppointment(appointment: AppointmentRecord, now = new Date()) {
  return (
    appointment.status === "Scheduled" &&
    appointment.appointmentDate >= getCurrentLocalDateIso(now) &&
    !isPastLocalAppointmentSlot(appointment.appointmentDate, appointment.appointmentTime, now)
  );
}

function isPatientOwnedAppointment(user: SafeUser, appointment: AppointmentRecord) {
  return (
    user.role === "patient" &&
    (appointment.patientId === user.id ||
      appointment.patientName === (user.patientName ?? user.displayName))
  );
}

function validateFamilyMemberDraft(draft: FamilyMemberDraft) {
  const errors: Record<string, string> = {};

  if (draft.fullName.trim().length < 2) {
    errors.fullName = "Enter a full name with at least 2 characters.";
  }

  if (draft.relationship.trim().length < 2) {
    errors.relationship = "Enter the relationship.";
  }

  if (draft.dateOfBirth) {
    const date = new Date(`${draft.dateOfBirth}T00:00:00`);
    if (Number.isNaN(date.getTime()) || draft.dateOfBirth > getCurrentLocalDateIso()) {
      errors.dateOfBirth = "Enter a valid date of birth.";
    }
  }

  if (draft.phoneNumber?.trim() && draft.phoneNumber.trim().length < 7) {
    errors.phoneNumber = "Enter a valid phone number.";
  }

  if (draft.emergencyContactPhone?.trim() && draft.emergencyContactPhone.trim().length < 7) {
    errors.emergencyContactPhone = "Enter a valid emergency contact phone number.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function validateMedicalHistoryDraft(user: SafeUser, draft: MedicalHistoryEntryDraft) {
  const errors: Record<string, string> = {};
  const categoryLabel = draft.category === "Surgery" ? "surgery" : "vaccination";

  if (user.role !== "patient" && !draft.patientId?.trim()) {
    errors.patientId = "Select a patient.";
  }

  if (!draft.recordedDate.trim()) {
    errors.recordedDate = `Select the ${categoryLabel} date.`;
  } else if (draft.recordedDate > getCurrentLocalDateIso()) {
    errors.recordedDate = `The ${categoryLabel} date cannot be in the future.`;
  }

  if (!draft.title.trim()) {
    errors.title =
      draft.category === "Surgery"
        ? "Enter the surgery/procedure name."
        : "Enter the vaccine name.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function validateClinicalAttachmentDraft(draft: ClinicalAttachmentDraft) {
  const errors: Record<string, string> = {};
  const maxFileSize = 5 * 1024 * 1024;

  if (draft.label.trim().length < 2) {
    errors.label = "Enter a label for this file.";
  }

  if (draft.fileName.trim().length < 3) {
    errors.fileName = "Enter a valid file name.";
  }

  if (!["application/pdf", "image/png", "image/jpeg"].includes(draft.contentType)) {
    errors.contentType = "Only PDF, PNG, and JPEG files are supported.";
  }

  if (draft.fileSize > maxFileSize) {
    errors.fileSize = "Files must be 5 MB or smaller.";
  }

  if (!draft.contentBase64.trim()) {
    errors.contentBase64 = "Please attach a valid file.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function canEditPrescription(prescription: PrescriptionRecord, user: SafeUser, now = Date.now()) {
  if (user.role !== "doctor" || prescription.doctorId !== user.doctorId) {
    return false;
  }

  if (prescription.status === "Dispensed") {
    return false;
  }

  const createdAt = new Date(prescription.createdAt).getTime();
  if (Number.isNaN(createdAt)) {
    return false;
  }

  return now - createdAt <= 3 * 60 * 60 * 1000;
}

function isTelemedicineJoinAvailable(appointment: AppointmentRecord, now = new Date()) {
  if (appointment.consultationMode !== "Online") {
    return {
      allowed: false,
      message: "This appointment is not scheduled as an online consultation.",
    };
  }

  if (appointment.status === "Cancelled" || appointment.status === "Completed") {
    return {
      allowed: false,
      message: "This consultation is no longer available.",
    };
  }

  const appointmentTime = new Date(`${appointment.appointmentDate}T${appointment.appointmentTime}:00`);
  if (Number.isNaN(appointmentTime.getTime())) {
    return {
      allowed: false,
      message: "This consultation is not available yet.",
    };
  }

  const joinWindowOpensAt = appointmentTime.getTime() - 10 * 60 * 1000;
  if (now.getTime() < joinWindowOpensAt) {
    return {
      allowed: false,
      message: "This consultation will be available 10 minutes before the appointment.",
    };
  }

  const joinWindowClosesAt = appointmentTime.getTime() + 30 * 60 * 1000;
  if (now.getTime() > joinWindowClosesAt && appointment.status !== "In consultation") {
    return {
      allowed: false,
      message: "This consultation window has closed.",
    };
  }

  return { allowed: true };
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

async function storeClinicalFileWithFallback(input: {
  contentBase64: string;
  fileName: string;
  contentType: string;
  folder: string;
}): Promise<StoredClinicalFile | null> {
  try {
    return await uploadClinicalFileToCloudinary(input);
  } catch (error) {
    console.warn(
      `[storage] External file storage unavailable; saving ${input.fileName} with database fallback.`,
      error instanceof Error ? error.message : error,
    );
    return null;
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
    priority: "Normal",
    status: "Waiting",
    createdAt: appointment.appointmentTime,
    updatedAt: appointment.appointmentTime,
  };
}

function createEmergencyVisitId() {
  return `EMG-${Date.now()}-${randomBytes(3).toString("hex")}`;
}

function createJourneyId() {
  return `JRN-${Date.now()}-${randomBytes(3).toString("hex")}`;
}

function createJourneyToken() {
  return randomBytes(16).toString("hex");
}

function getQueuePriorityRank(priority: QueuePriority) {
  switch (priority) {
    case "Emergency":
      return 3;
    case "Priority":
      return 2;
    default:
      return 1;
  }
}

function sortQueueEntriesForFlow(entries: QueueEntryRecord[]) {
  return [...entries].sort((left, right) => {
    const priorityDelta = getQueuePriorityRank(right.priority) - getQueuePriorityRank(left.priority);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return `${left.createdAt}-${left.id}`.localeCompare(`${right.createdAt}-${right.id}`);
  });
}

function estimateConsultationDurationMinutes(
  doctor: AppointmentRecord["doctorId"] | undefined,
  state: HospitalState,
) {
  const organizationDefault = state.organization.defaultConsultationSlotDurationMinutes ?? 20;
  if (!doctor) {
    return organizationDefault;
  }

  const relevantCompleted = state.appointments.filter(
    (appointment) =>
      appointment.doctorId === doctor &&
      appointment.status === "Completed" &&
      appointment.appointmentDate >= getCurrentLocalDateIso(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
  );

  if (relevantCompleted.length === 0) {
    return organizationDefault;
  }

  return organizationDefault;
}

function getQueueWaitEstimate(
  state: HospitalState,
  queueEntry: QueueEntryRecord,
) {
  const departmentEntries = sortQueueEntriesForFlow(
    state.queueEntries.filter(
      (entry) =>
        entry.departmentId === queueEntry.departmentId &&
        entry.status !== "Completed" &&
        !(entry.status === "In consultation" && entry.id !== queueEntry.id),
    ),
  );
  const targetIndex = departmentEntries.findIndex((entry) => entry.id === queueEntry.id);
  const patientsAhead = targetIndex < 0 ? 0 : targetIndex;
  const doctorMinutes = estimateConsultationDurationMinutes(queueEntry.doctorId, state);
  const baseMinutes = patientsAhead * doctorMinutes;
  const emergencyAhead = departmentEntries
    .slice(0, Math.max(0, targetIndex))
    .filter((entry) => entry.priority === "Emergency").length;
  const priorityAhead = departmentEntries
    .slice(0, Math.max(0, targetIndex))
    .filter((entry) => entry.priority === "Priority").length;

  return {
    estimatedMinutes: Math.max(0, baseMinutes + emergencyAhead * 8 + priorityAhead * 4),
    summary:
      patientsAhead > 0
        ? `${patientsAhead} patient${patientsAhead === 1 ? "" : "s"} ahead`
        : "Next in queue",
  };
}

function formatQueueWaitEstimate(estimate: ReturnType<typeof getQueueWaitEstimate>) {
  if (estimate.estimatedMinutes <= 0) {
    return estimate.summary;
  }

  return `${estimate.summary} · about ${estimate.estimatedMinutes} min`;
}

function findExistingJourneyForAppointment(state: HospitalState, appointmentId: string) {
  return (state.patientJourneys ?? []).find((journey) => journey.appointmentId === appointmentId);
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

export async function loadScopedNotificationsForUser(user: SafeUser) {
  const result = await query<{
    id: string;
    user_id: string;
    organization_id: string;
    title: string;
    message: string;
    category: NotificationRecord["category"];
    related_entity_type: string | null;
    related_entity_id: string | null;
    read: boolean;
    created_at: string | Date;
  }>(
    `select id, user_id, organization_id, title, message, category, related_entity_type,
            related_entity_id, read, created_at
       from notifications
      where organization_id = $1 and user_id = $2
      order by created_at desc
      limit 50`,
    [user.organizationId, user.id],
  );

  return result.rows.map((row): NotificationRecord => ({
    id: String(row.id),
    userId: String(row.user_id),
    organizationId: String(row.organization_id),
    title: String(row.title),
    message: String(row.message),
    category: row.category,
    relatedEntityType: row.related_entity_type ?? undefined,
    relatedEntityId: row.related_entity_id ?? undefined,
    read: Boolean(row.read),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  }));
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

async function notifyUsersOnceForEntity(input: {
  organizationId: string;
  userIds: string[];
  title: string;
  message: string;
  category: NotificationRecord["category"];
  relatedEntityType: string;
  relatedEntityId: string;
}) {
  const requestedUserIds = [...new Set(input.userIds.filter(Boolean))];

  if (requestedUserIds.length === 0) {
    return [] as NotificationRecord[];
  }

  const existingNotifications = await query<{ user_id: string }>(
    `select user_id
       from notifications
      where organization_id = $1
        and related_entity_type = $2
        and related_entity_id = $3
        and title = $4
        and user_id = any($5::text[])`,
    [
      input.organizationId,
      input.relatedEntityType,
      input.relatedEntityId,
      input.title,
      requestedUserIds,
    ],
  );

  const alreadyNotified = new Set(existingNotifications.rows.map((row) => String(row.user_id)));
  const pendingUserIds = requestedUserIds.filter((userId) => !alreadyNotified.has(userId));

  if (pendingUserIds.length === 0) {
    return [] as NotificationRecord[];
  }

  return notifyUsers({
    organizationId: input.organizationId,
    userIds: pendingUserIds,
    title: input.title,
    message: input.message,
    category: input.category,
    relatedEntityType: input.relatedEntityType,
    relatedEntityId: input.relatedEntityId,
  });
}

function buildInvoiceRecord(input: {
  patientId: string;
  patientName: string;
  familyMemberId?: string;
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
}): InvoiceRecord {
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
    ...(input.familyMemberId ? { familyMemberId: input.familyMemberId } : {}),
    organizationId: input.organizationId,
    hospitalId: input.hospitalId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    createdAt: new Date().toISOString(),
    dueDate: input.dueDate,
    subtotalCents,
    discountCents: 0,
    taxCents: 0,
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
  } else if (draft.appointmentDate < getCurrentLocalDateIso()) {
    errors.appointmentDate = "Appointment date cannot be in the past.";
  }

  if (!draft.appointmentTime) {
    errors.appointmentTime = "Select an appointment time.";
  } else if (!/^\d{2}:\d{2}$/.test(draft.appointmentTime)) {
    errors.appointmentTime = "Select a valid appointment time.";
  } else if (draft.appointmentDate && isPastLocalAppointmentSlot(draft.appointmentDate, draft.appointmentTime)) {
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
    draft.consultationMode &&
    !["In Person", "Online"].includes(draft.consultationMode)
  ) {
    errors.consultationMode = "Select a valid consultation mode.";
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

function getJourneyCurrentStep(state: HospitalState, appointment?: AppointmentRecord, queueEntry?: QueueEntryRecord) {
  if (!appointment && !queueEntry) {
    return "Registration";
  }

  if (appointment?.status === "Completed") {
    const hasPendingInvoice = state.invoices.some(
      (invoice) =>
        invoice.sourceType === "appointment" &&
        invoice.sourceId === appointment.id &&
        invoice.paymentStatus !== "Paid",
    );
    if (hasPendingInvoice) {
      return "Billing";
    }

    const hasIssuedPrescription = state.prescriptions.some(
      (prescription) =>
        prescription.appointmentId === appointment.id &&
        prescription.status === "Issued",
    );
    if (hasIssuedPrescription) {
      return "Pharmacy";
    }

    return "Completed";
  }

  if (queueEntry?.status === "In consultation" || appointment?.status === "In consultation") {
    return "Consultation";
  }

  if (queueEntry?.status === "Called") {
    return "Consultation";
  }

  if (queueEntry?.status === "Waiting") {
    return "Waiting";
  }

  if (appointment?.status === "Checked in") {
    return "Check In";
  }

  return "Registration";
}

function buildJourneySteps(state: HospitalState, appointment?: AppointmentRecord) {
  const steps: string[] = ["Registration", "Check In", "Waiting", "Consultation"];
  if (
    appointment &&
    state.labRequests.some(
      (request) =>
        request.patientId === appointment.patientId &&
        request.requestedDate >= appointment.appointmentDate,
    )
  ) {
    steps.push("Laboratory");
  }
  if (
    appointment &&
    state.prescriptions.some((prescription) => prescription.appointmentId === appointment.id)
  ) {
    steps.push("Pharmacy");
  }
  if (
    appointment &&
    state.invoices.some(
      (invoice) =>
        invoice.sourceType === "appointment" &&
        invoice.sourceId === appointment.id,
    )
  ) {
    steps.push("Billing");
  }
  steps.push("Completed");
  return [...new Set(steps)];
}

function canAccessJourney(user: SafeUser, journey: PatientJourneyRecord, state: HospitalState) {
  if (user.organizationId !== journey.organizationId) {
    return false;
  }

  if (user.role === "administrator" || user.role === "receptionist") {
    return true;
  }

  if (user.role === "patient") {
    return journey.patientId === user.id;
  }

  if (user.role === "doctor") {
    const appointment = journey.appointmentId
      ? state.appointments.find((item) => item.id === journey.appointmentId)
      : undefined;
    return appointment?.doctorId === user.doctorId;
  }

  if (user.role === "laboratory") {
    return true;
  }

  return false;
}

function buildOperationalAnalytics(state: HospitalState, scope: "today" | "7d" | "30d") {
  const today = getCurrentLocalDateIso();
  const days = scope === "today" ? 1 : scope === "7d" ? 7 : 30;
  const startDate = new Date(`${today}T00:00:00`);
  startDate.setDate(startDate.getDate() - (days - 1));
  const minDate = getCurrentLocalDateIso(startDate);
  const inRange = (date: string) => date >= minDate && date <= today;

  const appointments = state.appointments.filter((appointment) => inRange(appointment.appointmentDate));
  const todaysAppointments = state.appointments.filter((appointment) => appointment.appointmentDate === today);
  const labRequests = state.labRequests.filter((request) => inRange(request.requestedDate));
  const invoices = state.invoices.filter((invoice) => invoice.createdAt.slice(0, 10) >= minDate);
  const payments = invoices.flatMap((invoice) => invoice.payments).filter((payment) => payment.paidAt.slice(0, 10) >= minDate);
  const prescriptions = state.prescriptions.filter((prescription) => prescription.createdAt.slice(0, 10) >= minDate);

  const trendDays = Array.from({ length: days }, (_, index) => {
    const date = new Date(`${minDate}T00:00:00`);
    date.setDate(date.getDate() + index);
    const iso = getCurrentLocalDateIso(date);
    const dayAppointments = state.appointments.filter((appointment) => appointment.appointmentDate === iso);
    return {
      date: iso,
      appointments: dayAppointments.length,
      completed: dayAppointments.filter((appointment) => appointment.status === "Completed").length,
      cancelled: dayAppointments.filter((appointment) => appointment.status === "Cancelled").length,
      noShows: dayAppointments.filter((appointment) => appointment.status === "No Show").length,
      online: dayAppointments.filter((appointment) => appointment.consultationMode === "Online").length,
      inPerson: dayAppointments.filter((appointment) => appointment.consultationMode !== "Online").length,
    };
  });

  const departmentPerformance = state.departments.map((department) => {
    const departmentAppointments = appointments.filter((appointment) => appointment.departmentId === department.id);
    const departmentDoctors = state.doctors.filter((doctor) => doctor.departmentId === department.id);
    return {
      id: department.id,
      name: department.name,
      doctorCount: departmentDoctors.length,
      onDutyDoctorCount: departmentDoctors.filter((doctor) => doctor.status !== "Off duty").length,
      appointmentCount: departmentAppointments.length,
      patientVolume: new Set(departmentAppointments.map((appointment) => appointment.patientName)).size,
    };
  });

  const doctorPerformance = state.doctors.map((doctor) => {
    const doctorAppointments = appointments.filter((appointment) => appointment.doctorId === doctor.id);
    const currentQueue = state.queueEntries.filter(
      (entry) => entry.doctorId === doctor.id && entry.status !== "Completed",
    ).length;
    return {
      id: doctor.id,
      name: doctor.name,
      specialization: doctor.specialization,
      completedConsultations: doctorAppointments.filter((appointment) => appointment.status === "Completed").length,
      currentAppointmentCount: doctorAppointments.length,
      patientLoad: new Set(doctorAppointments.map((appointment) => appointment.patientName)).size,
      activeQueueCount: currentQueue,
    };
  });

  return {
    overview: {
      patientsToday: new Set(todaysAppointments.map((appointment) => appointment.patientName)).size,
      appointmentsToday: todaysAppointments.length,
      completedConsultations: appointments.filter((appointment) => appointment.status === "Completed").length,
      cancelledAppointments: appointments.filter((appointment) => appointment.status === "Cancelled").length,
      noShows: appointments.filter((appointment) => appointment.status === "No Show").length,
      activeQueue: state.queueEntries.filter((entry) => entry.status !== "Completed").length,
      revenueTodayCents: payments
        .filter((payment) => payment.paidAt.slice(0, 10) === today)
        .reduce((sum, payment) => sum + payment.amountCents, 0),
      outstandingBillingCents: state.invoices.reduce((sum, invoice) => sum + invoice.amountDueCents, 0),
      labRequestsToday: state.labRequests.filter((request) => request.requestedDate === today).length,
      prescriptionsIssued: prescriptions.filter((prescription) => prescription.status === "Issued").length,
      prescriptionsDispensed: prescriptions.filter((prescription) => prescription.status === "Dispensed").length,
    },
    trends: trendDays,
    doctorPerformance,
    departmentPerformance,
    laboratory: {
      requested: labRequests.filter((request) => request.status === "Requested").length,
      processing: labRequests.filter((request) => ["Sample Collected", "Processing"].includes(request.status)).length,
      completed: labRequests.filter((request) => request.status === "Completed").length,
      reportsCompleted: state.labReports.filter((report) => report.uploadedAt.slice(0, 10) >= minDate).length,
    },
    pharmacy: {
      dispensed: prescriptions.filter((prescription) => prescription.status === "Dispensed").length,
      medicineValueCents: invoices
        .flatMap((invoice) => invoice.items)
        .filter((item) => item.category === "Medicine")
        .reduce((sum, item) => sum + item.totalAmountCents, 0),
      lowStockCount: state.inventoryItems.filter((item) => item.quantityInStock <= item.reorderLevel && item.quantityInStock > 0).length,
      outOfStockCount: state.inventoryItems.filter((item) => item.quantityInStock <= 0).length,
      nearExpiryCount: state.inventoryItems.filter((item) => item.expiryDate >= today && item.expiryDate <= getCurrentLocalDateIso(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))).length,
    },
    billing: {
      revenueCents: payments.reduce((sum, payment) => sum + payment.amountCents, 0),
      paidInvoices: invoices.filter((invoice) => invoice.paymentStatus === "Paid").length,
      unpaidInvoices: invoices.filter((invoice) => invoice.paymentStatus !== "Paid").length,
      outstandingAmountCents: invoices.reduce((sum, invoice) => sum + invoice.amountDueCents, 0),
      consultationRevenueCents: invoices
        .flatMap((invoice) => invoice.items)
        .filter((item) => item.category === "Consultation")
        .reduce((sum, item) => sum + item.totalAmountCents, 0),
      labRevenueCents: invoices
        .flatMap((invoice) => invoice.items)
        .filter((item) => item.category === "Laboratory")
        .reduce((sum, item) => sum + item.totalAmountCents, 0),
      pharmacyRevenueCents: invoices
        .flatMap((invoice) => invoice.items)
        .filter((item) => item.category === "Medicine")
        .reduce((sum, item) => sum + item.totalAmountCents, 0),
    },
  };
}

async function buildSqlOperationalAnalytics(organizationId: string, scope: "today" | "7d" | "30d") {
  const today = getCurrentLocalDateIso();
  const days = scope === "today" ? 1 : scope === "7d" ? 7 : 30;
  const startDate = new Date(`${today}T00:00:00`);
  startDate.setDate(startDate.getDate() - (days - 1));
  const minDate = getCurrentLocalDateIso(startDate);
  const nearExpiryDate = getCurrentLocalDateIso(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  const safeAnalyticsQuery = async <T extends object>(
    label: string,
    request: Promise<{ rows: T[] }>,
    fallbackRows: T[],
  ) => {
    try {
      return await request;
    } catch (error) {
      console.warn(`[analytics] ${label} query failed`, error);
      return { rows: fallbackRows };
    }
  };

  const [
    overviewResult,
    trendResult,
    doctorResult,
    departmentResult,
    laboratoryResult,
    pharmacyResult,
    billingResult,
  ] = await Promise.all([
    safeAnalyticsQuery("overview", query<{
      patients_today: string | number;
      appointments_today: string | number;
      completed_consultations: string | number;
      cancelled_appointments: string | number;
      no_shows: string | number;
      active_queue: string | number;
      revenue_today_cents: string | number | null;
      outstanding_billing_cents: string | number | null;
      lab_requests_today: string | number;
      prescriptions_issued: string | number;
      prescriptions_dispensed: string | number;
    }>(
      `select
        (select count(distinct patient_name) from appointments where organization_id = $1 and appointment_date = $2) as patients_today,
        (select count(*) from appointments where organization_id = $1 and appointment_date = $2) as appointments_today,
        (select count(*) from appointments where organization_id = $1 and appointment_date between $3 and $2 and status = 'Completed') as completed_consultations,
        (select count(*) from appointments where organization_id = $1 and appointment_date between $3 and $2 and status = 'Cancelled') as cancelled_appointments,
        (select count(*) from appointments where organization_id = $1 and appointment_date between $3 and $2 and status = 'No Show') as no_shows,
        (select count(*) from queue_entries where organization_id = $1 and status <> 'Completed') as active_queue,
        (select coalesce(sum(amount_cents), 0) from payments where organization_id = $1 and paid_at::date = $2::date) as revenue_today_cents,
        (select coalesce(sum(amount_due_cents), 0) from invoices where organization_id = $1) as outstanding_billing_cents,
        (select count(*) from lab_requests where organization_id = $1 and requested_date = $2) as lab_requests_today,
        (select count(*) from prescriptions where organization_id = $1 and created_at::date between $3::date and $2::date and status = 'Issued') as prescriptions_issued,
        (select count(*) from prescriptions where organization_id = $1 and created_at::date between $3::date and $2::date and status = 'Dispensed') as prescriptions_dispensed`,
      [organizationId, today, minDate],
    ), []),
    safeAnalyticsQuery("trends", query<{
      date: string;
      appointments: string | number;
      completed: string | number;
      cancelled: string | number;
      no_shows: string | number;
      online: string | number;
      in_person: string | number;
    }>(
      `select
        day::date::text as date,
        count(a.id) as appointments,
        count(a.id) filter (where a.status = 'Completed') as completed,
        count(a.id) filter (where a.status = 'Cancelled') as cancelled,
        count(a.id) filter (where a.status = 'No Show') as no_shows,
        count(a.id) filter (where coalesce(a.consultation_mode, 'In Person') = 'Online') as online,
        count(a.id) filter (where coalesce(a.consultation_mode, 'In Person') <> 'Online') as in_person
       from generate_series($2::date, $3::date, interval '1 day') as day
       left join appointments a
         on a.organization_id = $1 and a.appointment_date = day::date::text
       group by day
       order by day asc`,
      [organizationId, minDate, today],
    ), []),
    safeAnalyticsQuery("doctor-performance", query<{
      id: string;
      name: string;
      specialization: string;
      completed_consultations: string | number;
      current_appointment_count: string | number;
      patient_load: string | number;
      active_queue_count: string | number;
    }>(
      `select
        d.id,
        d.name,
        d.specialization,
        (select count(*) from appointments a where a.organization_id = $1 and a.doctor_id = d.id and a.appointment_date between $2 and $3 and a.status = 'Completed') as completed_consultations,
        (select count(*) from appointments a where a.organization_id = $1 and a.doctor_id = d.id and a.appointment_date between $2 and $3) as current_appointment_count,
        (select count(distinct a.patient_name) from appointments a where a.organization_id = $1 and a.doctor_id = d.id and a.appointment_date between $2 and $3) as patient_load,
        (select count(*) from queue_entries q where q.organization_id = $1 and q.doctor_id = d.id and q.status <> 'Completed') as active_queue_count
       from doctors d
       where d.organization_id = $1
       order by d.name asc`,
      [organizationId, minDate, today],
    ), []),
    safeAnalyticsQuery("department-performance", query<{
      id: string;
      name: string;
      doctor_count: string | number;
      on_duty_doctor_count: string | number;
      appointment_count: string | number;
      patient_volume: string | number;
    }>(
      `select
        dep.id,
        dep.name,
        (select count(*) from doctors d where d.organization_id = $1 and d.department_id = dep.id) as doctor_count,
        (select count(*) from doctors d where d.organization_id = $1 and d.department_id = dep.id and d.status <> 'Off duty') as on_duty_doctor_count,
        (select count(*) from appointments a where a.organization_id = $1 and a.department_id = dep.id and a.appointment_date between $2 and $3) as appointment_count,
        (select count(distinct a.patient_name) from appointments a where a.organization_id = $1 and a.department_id = dep.id and a.appointment_date between $2 and $3) as patient_volume
       from departments dep
       where dep.organization_id = $1
       order by dep.name asc`,
      [organizationId, minDate, today],
    ), []),
    safeAnalyticsQuery("laboratory", query<{
      requested: string | number;
      processing: string | number;
      completed: string | number;
      reports_completed: string | number;
    }>(
      `select
        count(*) filter (where status = 'Requested' and requested_date between $2 and $3) as requested,
        count(*) filter (where status in ('Sample Collected', 'Processing') and requested_date between $2 and $3) as processing,
        count(*) filter (where status = 'Completed' and requested_date between $2 and $3) as completed,
        (select count(*) from lab_reports where organization_id = $1 and uploaded_at::date between $2::date and $3::date) as reports_completed
       from lab_requests
       where organization_id = $1`,
      [organizationId, minDate, today],
    ), []),
    safeAnalyticsQuery("pharmacy", query<{
      dispensed: string | number;
      medicine_value_cents: string | number | null;
      low_stock_count: string | number;
      out_of_stock_count: string | number;
      near_expiry_count: string | number;
    }>(
      `select
        (select count(*) from prescriptions where organization_id = $1 and created_at::date between $2::date and $3::date and status = 'Dispensed') as dispensed,
        (select coalesce(sum(ii.total_amount_cents), 0)
         from invoice_items ii
         inner join invoices i on i.id = ii.invoice_id
         where ii.organization_id = $1 and ii.category = 'Medicine' and i.created_at::date between $2::date and $3::date) as medicine_value_cents,
        (select count(*) from inventory_items where organization_id = $1 and quantity_in_stock <= reorder_level and quantity_in_stock > 0) as low_stock_count,
        (select count(*) from inventory_items where organization_id = $1 and quantity_in_stock <= 0) as out_of_stock_count,
        (select count(*)
         from inventory_items
         where organization_id = $1
           and expiry_date ~ '^\\d{4}-\\d{2}-\\d{2}$'
           and expiry_date::date >= $3::date
           and expiry_date::date <= $4::date) as near_expiry_count`,
      [organizationId, minDate, today, nearExpiryDate],
    ), []),
    safeAnalyticsQuery("billing", query<{
      revenue_cents: string | number | null;
      paid_invoices: string | number;
      unpaid_invoices: string | number;
      outstanding_amount_cents: string | number | null;
      consultation_revenue_cents: string | number | null;
      lab_revenue_cents: string | number | null;
      pharmacy_revenue_cents: string | number | null;
    }>(
      `select
        (select coalesce(sum(amount_cents), 0) from payments where organization_id = $1 and paid_at::date between $2::date and $3::date) as revenue_cents,
        count(*) filter (where payment_status = 'Paid' and created_at::date between $2::date and $3::date) as paid_invoices,
        count(*) filter (where payment_status <> 'Paid' and created_at::date between $2::date and $3::date) as unpaid_invoices,
        coalesce(sum(amount_due_cents) filter (where created_at::date between $2::date and $3::date), 0) as outstanding_amount_cents,
        (select coalesce(sum(ii.total_amount_cents), 0) from invoice_items ii inner join invoices i on i.id = ii.invoice_id where ii.organization_id = $1 and ii.category = 'Consultation' and i.created_at::date between $2::date and $3::date) as consultation_revenue_cents,
        (select coalesce(sum(ii.total_amount_cents), 0) from invoice_items ii inner join invoices i on i.id = ii.invoice_id where ii.organization_id = $1 and ii.category = 'Laboratory' and i.created_at::date between $2::date and $3::date) as lab_revenue_cents,
        (select coalesce(sum(ii.total_amount_cents), 0) from invoice_items ii inner join invoices i on i.id = ii.invoice_id where ii.organization_id = $1 and ii.category = 'Medicine' and i.created_at::date between $2::date and $3::date) as pharmacy_revenue_cents
       from invoices
       where organization_id = $1`,
      [organizationId, minDate, today],
    ), []),
  ]);

  const overview = overviewResult.rows[0];
  const laboratory = laboratoryResult.rows[0];
  const pharmacy = pharmacyResult.rows[0];
  const billing = billingResult.rows[0];

  return {
    overview: {
      patientsToday: asNumber(overview?.patients_today ?? 0),
      appointmentsToday: asNumber(overview?.appointments_today ?? 0),
      completedConsultations: asNumber(overview?.completed_consultations ?? 0),
      cancelledAppointments: asNumber(overview?.cancelled_appointments ?? 0),
      noShows: asNumber(overview?.no_shows ?? 0),
      activeQueue: asNumber(overview?.active_queue ?? 0),
      revenueTodayCents: asNumber(overview?.revenue_today_cents ?? 0),
      outstandingBillingCents: asNumber(overview?.outstanding_billing_cents ?? 0),
      labRequestsToday: asNumber(overview?.lab_requests_today ?? 0),
      prescriptionsIssued: asNumber(overview?.prescriptions_issued ?? 0),
      prescriptionsDispensed: asNumber(overview?.prescriptions_dispensed ?? 0),
    },
    trends: trendResult.rows.map((row) => ({
      date: row.date,
      appointments: asNumber(row.appointments),
      completed: asNumber(row.completed),
      cancelled: asNumber(row.cancelled),
      noShows: asNumber(row.no_shows),
      online: asNumber(row.online),
      inPerson: asNumber(row.in_person),
    })),
    doctorPerformance: doctorResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      specialization: row.specialization,
      completedConsultations: asNumber(row.completed_consultations),
      currentAppointmentCount: asNumber(row.current_appointment_count),
      patientLoad: asNumber(row.patient_load),
      activeQueueCount: asNumber(row.active_queue_count),
    })),
    departmentPerformance: departmentResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      doctorCount: asNumber(row.doctor_count),
      onDutyDoctorCount: asNumber(row.on_duty_doctor_count),
      appointmentCount: asNumber(row.appointment_count),
      patientVolume: asNumber(row.patient_volume),
    })),
    laboratory: {
      requested: asNumber(laboratory?.requested ?? 0),
      processing: asNumber(laboratory?.processing ?? 0),
      completed: asNumber(laboratory?.completed ?? 0),
      reportsCompleted: asNumber(laboratory?.reports_completed ?? 0),
    },
    pharmacy: {
      dispensed: asNumber(pharmacy?.dispensed ?? 0),
      medicineValueCents: asNumber(pharmacy?.medicine_value_cents ?? 0),
      lowStockCount: asNumber(pharmacy?.low_stock_count ?? 0),
      outOfStockCount: asNumber(pharmacy?.out_of_stock_count ?? 0),
      nearExpiryCount: asNumber(pharmacy?.near_expiry_count ?? 0),
    },
    billing: {
      revenueCents: asNumber(billing?.revenue_cents ?? 0),
      paidInvoices: asNumber(billing?.paid_invoices ?? 0),
      unpaidInvoices: asNumber(billing?.unpaid_invoices ?? 0),
      outstandingAmountCents: asNumber(billing?.outstanding_amount_cents ?? 0),
      consultationRevenueCents: asNumber(billing?.consultation_revenue_cents ?? 0),
      labRevenueCents: asNumber(billing?.lab_revenue_cents ?? 0),
      pharmacyRevenueCents: asNumber(billing?.pharmacy_revenue_cents ?? 0),
    },
  };
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

  if (draft.clinicalNotes && draft.clinicalNotes.trim().length > 500) {
    errors.clinicalNotes = "Clinical notes must be 500 characters or fewer.";
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

  if (draft.followUpDate && draft.followUpDate < getCurrentLocalDateIso()) {
    errors.followUpDate = "Follow-up date cannot be in the past.";
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
    familyMemberId: draft.familyMemberId?.trim() || undefined,
    medicines: draft.medicines.map((medicine) => {
      const normalizedMedicine = normalizePrescriptionMedicine(medicine);
      const resolvedQuantity = resolveMedicineTotalQuantity(normalizedMedicine);

      return {
        ...normalizedMedicine,
        totalQuantity: resolvedQuantity,
      };
    }),
    instructions: draft.instructions.trim(),
    followUpDate: draft.followUpDate?.trim() || undefined,
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
  if (role === "administrator") {
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
      invoices: [],
      inventoryItems:
        state.inventoryItems.filter((item) => item.organizationId === user.organizationId),
      familyMembers: (state.familyMembers ?? []).filter(
        (member) => member.organizationId === user.organizationId,
      ),
      medicalHistoryEntries: (state.medicalHistoryEntries ?? []).filter(
        (entry) => entry.organizationId === user.organizationId,
      ),
      clinicalAttachments: (state.clinicalAttachments ?? []).filter(
        (attachment) => attachment.organizationId === user.organizationId,
      ),
      telemedicineSessions: (state.telemedicineSessions ?? []).filter(
        (session) => session.organizationId === user.organizationId,
      ),
      emergencyVisits: (state.emergencyVisits ?? []).filter(
        (visit) => visit.organizationId === user.organizationId,
      ),
      patientJourneys: (state.patientJourneys ?? []).filter(
        (journey) => journey.organizationId === user.organizationId,
      ),
      notifications: getScopedNotificationsForUser(user, state),
    };
  }

  if (role === "receptionist") {
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
      inventoryItems: [],
      familyMembers: (state.familyMembers ?? []).filter(
        (member) => member.organizationId === user.organizationId,
      ),
      medicalHistoryEntries: (state.medicalHistoryEntries ?? []).filter(
        (entry) => entry.organizationId === user.organizationId,
      ),
      clinicalAttachments: (state.clinicalAttachments ?? []).filter(
        (attachment) => attachment.organizationId === user.organizationId,
      ),
      telemedicineSessions: (state.telemedicineSessions ?? []).filter(
        (session) => session.organizationId === user.organizationId,
      ),
      emergencyVisits: (state.emergencyVisits ?? []).filter(
        (visit) => visit.organizationId === user.organizationId,
      ),
      patientJourneys: (state.patientJourneys ?? []).filter(
        (journey) => journey.organizationId === user.organizationId,
      ),
      notifications: getScopedNotificationsForUser(user, state),
    };
  }

  if (role === "doctor") {
    const appointments = state.appointments.filter(
      (appointment) => appointment.doctorId === user.doctorId,
    );
    const appointmentIds = new Set(appointments.map((appointment) => appointment.id));
    const patientIds = new Set(
      appointments.map((appointment) => appointment.patientId).filter(Boolean) as string[],
    );
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
      familyMembers: (state.familyMembers ?? []).filter((member) =>
        patientIds.has(member.primaryPatientUserId) ||
        appointments.some((appointment) => appointment.familyMemberId === member.id),
      ),
      medicalHistoryEntries: (state.medicalHistoryEntries ?? []).filter((entry) =>
        patientIds.has(entry.patientUserId) ||
        appointments.some((appointment) => appointment.familyMemberId === entry.familyMemberId),
      ),
      clinicalAttachments: (state.clinicalAttachments ?? []).filter((attachment) =>
        patientIds.has(attachment.patientUserId) ||
        appointments.some((appointment) => appointment.familyMemberId === attachment.familyMemberId),
      ),
      telemedicineSessions: (state.telemedicineSessions ?? []).filter(
        (session) =>
          session.organizationId === user.organizationId &&
          (session.doctorUserId === user.id ||
            appointments.some((appointment) => appointment.id === session.appointmentId)),
      ),
      emergencyVisits: (state.emergencyVisits ?? []).filter(
        (visit) =>
          visit.organizationId === user.organizationId &&
          (visit.patientId ? patientIds.has(visit.patientId) : patientNames.has(visit.patientName)),
      ),
      patientJourneys: (state.patientJourneys ?? []).filter((journey) =>
        journey.organizationId === user.organizationId &&
        (journey.appointmentId ? appointmentIds.has(journey.appointmentId) : false),
      ),
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
      emergencyVisits: (state.emergencyVisits ?? []).filter((visit) => visit.organizationId === user.organizationId),
      patientJourneys: (state.patientJourneys ?? []).filter((journey) => journey.organizationId === user.organizationId),
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
      emergencyVisits: [],
      patientJourneys: [],
      invoices: [],
      inventoryItems: state.inventoryItems.filter((item) => item.organizationId === user.organizationId),
      notifications: getScopedNotificationsForUser(user, state),
    };
  }

  const appointments = state.appointments.filter(
    (appointment) =>
      appointment.patientId === user.id || appointment.patientName === user.patientName,
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
    familyMembers: (state.familyMembers ?? []).filter(
      (member) => member.primaryPatientUserId === user.id,
    ),
    medicalHistoryEntries: emailVerified
      ? (state.medicalHistoryEntries ?? []).filter(
          (entry) => entry.patientUserId === user.id,
        )
      : [],
    clinicalAttachments: emailVerified
      ? (state.clinicalAttachments ?? []).filter(
          (attachment) => attachment.patientUserId === user.id,
        )
      : [],
    telemedicineSessions: (state.telemedicineSessions ?? []).filter(
      (session) =>
        session.patientUserId === user.id &&
        appointments.some((appointment) => appointment.id === session.appointmentId),
    ),
    emergencyVisits: (state.emergencyVisits ?? []).filter(
      (visit) =>
        visit.patientId === user.id ||
        appointments.some((appointment) => appointment.id === visit.appointmentId),
    ),
    patientJourneys: (state.patientJourneys ?? []).filter(
      (journey) =>
        journey.patientId === user.id ||
        (journey.appointmentId ? appointmentIds.has(journey.appointmentId) : false),
    ),
  };
}

export async function getScopedHospitalStateForUser(user: SafeUser): Promise<HospitalStateResponse> {
  const state = await measurePerfStep("scope.load-state", () => loadHospitalState());
  const noShowReconciledState = await measurePerfStep("scope.reconcile-no-shows", () =>
    reconcileNoShowAppointments(state),
  );
  const labReconciledState = await measurePerfStep("scope.reconcile-lab-requests", () =>
    reconcileStaleLabRequests(noShowReconciledState),
  );
  const repairedInvoices = await measurePerfStep("scope.repair-zero-invoices", () =>
    repairBrokenZeroValueInvoices(labReconciledState),
  );
  const repairedState = buildInvoiceStateWithUpdates(labReconciledState, repairedInvoices);
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
  const users = await measurePerfStep("scope.load-users", () => loadUsers());
  const doctorProfiles = users
    .filter(
      (currentUser) =>
        currentUser.role === "doctor" && currentUser.organizationId === organizationId,
    )
    .map(toSafeUserSummary);

  if (user.role === "doctor") {
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
        doctorProfiles,
      },
    };
  }

  if (user.role !== "administrator") {
    return { state: scopedState, meta: { ...sharedMeta, doctorProfiles } };
  }

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
      doctorProfiles,
      userCounts,
      users: users.map(toSafeUserSummary),
    },
  };
}

export async function getFamilyMembers(user: SafeUser) {
  if (user.role !== "patient") {
    throw createHttpError(403, "You do not have access to manage family members.");
  }

  const scoped = await getScopedHospitalStateForUser(user);
  return {
    familyMembers: scoped.state.familyMembers ?? [],
  };
}

export async function getLabRequestsForUser(user: SafeUser) {
  const state = await reconcileNoShowAppointments(await loadHospitalState());

  return {
    labRequests: getScopedLabRequestsForUser(user, state),
  };
}

export async function getOperationalAnalytics(
  user: SafeUser,
  scope: "today" | "7d" | "30d",
) {
  if (user.role !== "administrator") {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  if (isDatabaseConfigured()) {
    return {
      analytics: await buildSqlOperationalAnalytics(user.organizationId, scope),
    };
  }

  const state = await reconcileNoShowAppointments(await loadHospitalState());
  const scopedState = withScopedState(user.role, user, state);

  return {
    analytics: buildOperationalAnalytics(scopedState, scope),
  };
}

type AdminBillingDaySort =
  | "newest"
  | "oldest"
  | "highest-revenue"
  | "highest-outstanding"
  | "most-invoices";

type AdminBillingInvoiceSort = "newest" | "oldest" | "highest-total" | "highest-due";

async function getOrganizationTimezone(organizationId: string) {
  const result = await query<{ timezone: string | null }>(
    "select timezone from organizations where id = $1",
    [organizationId],
  );

  return result.rows[0]?.timezone || "Asia/Calcutta";
}

function ensureAdminUser(user: SafeUser) {
  if (user.role !== "administrator") {
    throw createHttpError(403, "You do not have access to this workspace.");
  }
}

function createBranchId(name: string) {
  return `branch-${slugify(name)}-${randomBytes(3).toString("hex")}`;
}

function normalizeBranchCode(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").toUpperCase();
}

function mapBranch(row: Record<string, unknown>): HospitalBranchRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    code: String(row.code),
    name: String(row.name),
    address: String(row.address),
    city: String(row.city),
    state: asString(row.state),
    postalCode: asString(row.postal_code),
    phone: asString(row.phone),
    email: asString(row.email),
    active: row.active === true,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

type BranchDraft = {
  code?: string;
  name: string;
  address: string;
  city: string;
  state?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  active?: boolean;
};

function validateBranchDraft(draft: BranchDraft) {
  const errors: Partial<Record<keyof BranchDraft, string>> = {};

  if (draft.name.trim().length < 3) {
    errors.name = "Enter the branch name.";
  }

  if (draft.address.trim().length < 6) {
    errors.address = "Enter the branch address.";
  }

  if (draft.city.trim().length < 2) {
    errors.city = "Enter the branch city.";
  }

  if (draft.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
    errors.email = "Enter a valid branch email address.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export async function listHospitalBranches(
  user: SafeUser,
  input: { query?: string; status?: "All" | "Active" | "Inactive"; page?: number; pageSize?: number },
) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const search = `%${(input.query ?? "").trim().toLowerCase()}%`;
  const status = input.status ?? "All";

  const result = await query(
    `select *, count(*) over() as total_count
     from hospital_branches
     where organization_id = $1
       and ($2 = '%%' or lower(name || ' ' || code || ' ' || city || ' ' || address) like $2)
       and ($3 = 'All' or ($3 = 'Active' and active = true) or ($3 = 'Inactive' and active = false))
     order by active desc, name asc
     limit $4 offset $5`,
    [user.organizationId, search, status, pageSize, offset],
  );

  return {
    branches: result.rows.map(mapBranch),
    pagination: {
      page,
      pageSize,
      total: asNumber(result.rows[0]?.total_count ?? 0),
    },
  };
}

export async function createHospitalBranch(user: SafeUser, draft: BranchDraft) {
  ensureAdminUser(user);
  const validation = validateBranchDraft(draft);
  if (!validation.isValid) {
    throw createHttpError(400, "Please review the branch details provided.", {
      errors: validation.errors,
    });
  }

  const now = new Date().toISOString();
  const branch: HospitalBranchRecord = {
    id: createBranchId(draft.name),
    organizationId: user.organizationId,
    code: normalizeBranchCode(draft.code?.trim() || draft.name),
    name: draft.name.trim(),
    address: draft.address.trim(),
    city: draft.city.trim(),
    state: draft.state?.trim() || undefined,
    postalCode: draft.postalCode?.trim() || undefined,
    phone: draft.phone?.trim() || undefined,
    email: draft.email?.trim() || undefined,
    active: draft.active ?? true,
    createdAt: now,
    updatedAt: now,
  };

  await query(
    `insert into hospital_branches (
      id, organization_id, code, name, address, city, state, postal_code, phone, email, active, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      branch.id,
      branch.organizationId,
      branch.code,
      branch.name,
      branch.address,
      branch.city,
      branch.state ?? null,
      branch.postalCode ?? null,
      branch.phone ?? null,
      branch.email ?? null,
      branch.active,
      branch.createdAt,
      branch.updatedAt,
    ],
  );

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "branch.created",
    entityType: "branch",
    entityId: branch.id,
  });

  return getScopedHospitalStateForUser(user);
}

export async function updateHospitalBranch(user: SafeUser, branchId: string, draft: BranchDraft) {
  ensureAdminUser(user);
  const validation = validateBranchDraft(draft);
  if (!validation.isValid) {
    throw createHttpError(400, "Please review the branch details provided.", {
      errors: validation.errors,
    });
  }

  const existing = await query("select id from hospital_branches where id = $1 and organization_id = $2", [
    branchId,
    user.organizationId,
  ]);
  if (!existing.rows.length) {
    throw createHttpError(404, "Branch not found.");
  }

  await query(
    `update hospital_branches
     set code = $3,
         name = $4,
         address = $5,
         city = $6,
         state = $7,
         postal_code = $8,
         phone = $9,
         email = $10,
         active = $11,
         updated_at = $12
     where id = $1 and organization_id = $2`,
    [
      branchId,
      user.organizationId,
      normalizeBranchCode(draft.code?.trim() || draft.name),
      draft.name.trim(),
      draft.address.trim(),
      draft.city.trim(),
      draft.state?.trim() || null,
      draft.postalCode?.trim() || null,
      draft.phone?.trim() || null,
      draft.email?.trim() || null,
      draft.active ?? true,
      new Date().toISOString(),
    ],
  );

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "branch.updated",
    entityType: "branch",
    entityId: branchId,
  });

  return getScopedHospitalStateForUser(user);
}

export async function updateDoctorBranch(user: SafeUser, doctorId: string, branchId?: string) {
  ensureAdminUser(user);

  const doctorResult = await query("select id from doctors where id = $1 and organization_id = $2", [
    doctorId,
    user.organizationId,
  ]);
  if (!doctorResult.rows.length) {
    throw createHttpError(404, "Doctor not found.");
  }

  if (branchId) {
    const branchResult = await query(
      "select id from hospital_branches where id = $1 and organization_id = $2 and active = true",
      [branchId, user.organizationId],
    );
    if (!branchResult.rows.length) {
      throw createHttpError(400, "Select an active hospital branch.");
    }
  }

  await query("update doctors set branch_id = $3 where id = $1 and organization_id = $2", [
    doctorId,
    user.organizationId,
    branchId ?? null,
  ]);

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "doctor.branch.updated",
    entityType: "doctor",
    entityId: doctorId,
    metadata: { branchId },
  });

  return getScopedHospitalStateForUser(user);
}

export async function getAdminBillingDaySummaries(
  user: SafeUser,
  input: {
    page: number;
    pageSize: number;
    sort: AdminBillingDaySort;
    dateFrom?: string;
    dateTo?: string;
  },
) {
  ensureAdminUser(user);

  const dateFrom = input.dateFrom?.trim() ?? "";
  const dateTo = input.dateTo?.trim() ?? "";

  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw createHttpError(400, "Please review the billing date range.", {
      errors: {
        dateFrom: "From date cannot be later than To date.",
        dateTo: "To date cannot be earlier than From date.",
      },
    });
  }

  const timezone = await measurePerfStep("admin-billing.timezone", () =>
    getOrganizationTimezone(user.organizationId),
  );

  const orderByMap: Record<AdminBillingDaySort, string> = {
    newest: 'billing_day desc',
    oldest: 'billing_day asc',
    'highest-revenue': 'total_billed_cents desc, billing_day desc',
    'highest-outstanding': 'outstanding_cents desc, billing_day desc',
    'most-invoices': 'invoice_count desc, billing_day desc',
  };

  const offset = (input.page - 1) * input.pageSize;

  const [countResult, rowsResult] = await Promise.all([
    measurePerfStep("admin-billing.days-count", () =>
      query<{ total_days: number }>(
        `
          select count(*)::int as total_days
          from (
            select to_char(created_at at time zone $2, 'YYYY-MM-DD') as billing_day
            from invoices
            where organization_id = $1
              and ($3 = '' or (created_at at time zone $2)::date >= $3::date)
              and ($4 = '' or (created_at at time zone $2)::date <= $4::date)
            group by billing_day
          ) day_groups
        `,
        [user.organizationId, timezone, dateFrom, dateTo],
      ),
    ),
    measurePerfStep("admin-billing.days-query", () =>
      query<{
        billing_day: string;
        invoice_count: number;
        total_billed_cents: number;
        total_collected_cents: number;
        outstanding_cents: number;
        paid_count: number;
        pending_partial_count: number;
        consultation_revenue_cents: number;
        lab_revenue_cents: number;
        pharmacy_revenue_cents: number;
      }>(
        `
          with day_invoice_base as (
            select
              i.id,
              to_char(i.created_at at time zone $2, 'YYYY-MM-DD') as billing_day,
              i.total_cents,
              i.amount_paid_cents,
              i.amount_due_cents,
              i.payment_status
            from invoices i
            where i.organization_id = $1
              and ($3 = '' or (i.created_at at time zone $2)::date >= $3::date)
              and ($4 = '' or (i.created_at at time zone $2)::date <= $4::date)
          ),
          day_invoice_summary as (
            select
              billing_day,
              count(*)::int as invoice_count,
              coalesce(sum(total_cents), 0)::bigint as total_billed_cents,
              coalesce(sum(amount_paid_cents), 0)::bigint as total_collected_cents,
              coalesce(sum(amount_due_cents), 0)::bigint as outstanding_cents,
              count(*) filter (where payment_status = 'Paid')::int as paid_count,
              count(*) filter (where payment_status in ('Pending', 'Partially Paid'))::int as pending_partial_count
            from day_invoice_base
            group by billing_day
          ),
          day_category_summary as (
            select
              to_char(i.created_at at time zone $2, 'YYYY-MM-DD') as billing_day,
              coalesce(sum(case when ii.category = 'Consultation' then ii.total_amount_cents else 0 end), 0)::bigint as consultation_revenue_cents,
              coalesce(sum(case when ii.category = 'Laboratory' then ii.total_amount_cents else 0 end), 0)::bigint as lab_revenue_cents,
              coalesce(sum(case when ii.category = 'Medicine' then ii.total_amount_cents else 0 end), 0)::bigint as pharmacy_revenue_cents
            from invoices i
            left join invoice_items ii on ii.invoice_id = i.id
            where i.organization_id = $1
              and ($3 = '' or (i.created_at at time zone $2)::date >= $3::date)
              and ($4 = '' or (i.created_at at time zone $2)::date <= $4::date)
            group by billing_day
          )
          select
            summary.billing_day,
            summary.invoice_count,
            summary.total_billed_cents,
            summary.total_collected_cents,
            summary.outstanding_cents,
            summary.paid_count,
            summary.pending_partial_count,
            category.consultation_revenue_cents,
            category.lab_revenue_cents,
            category.pharmacy_revenue_cents
          from day_invoice_summary summary
          left join day_category_summary category on category.billing_day = summary.billing_day
          order by ${orderByMap[input.sort]}
          limit $5 offset $6
        `,
        [user.organizationId, timezone, dateFrom, dateTo, input.pageSize, offset],
      ),
    ),
  ]);

  return {
    summary: {
      page: input.page,
      pageSize: input.pageSize,
      totalDays: asNumber(countResult.rows[0]?.total_days ?? 0),
      sort: input.sort,
      rows: rowsResult.rows.map((row) => ({
        date: row.billing_day,
        invoiceCount: asNumber(row.invoice_count),
        totalBilledCents: asNumber(row.total_billed_cents),
        totalCollectedCents: asNumber(row.total_collected_cents),
        outstandingCents: asNumber(row.outstanding_cents),
        paidCount: asNumber(row.paid_count),
        pendingPartialCount: asNumber(row.pending_partial_count),
        consultationRevenueCents: asNumber(row.consultation_revenue_cents),
        labRevenueCents: asNumber(row.lab_revenue_cents),
        pharmacyRevenueCents: asNumber(row.pharmacy_revenue_cents),
      })),
    },
  };
}

export async function getAdminBillingDayDetails(
  user: SafeUser,
  input: {
    billingDate: string;
    page: number;
    pageSize: number;
    sort: AdminBillingInvoiceSort;
    queryText?: string;
    paymentStatus?: "All" | "Pending" | "Partially Paid" | "Paid" | "Cancelled";
    sourceType?: "All" | "appointment" | "lab-request" | "prescription" | "other";
  },
) {
  ensureAdminUser(user);

  const timezone = await measurePerfStep("admin-billing.timezone", () =>
    getOrganizationTimezone(user.organizationId),
  );
  const offset = (input.page - 1) * input.pageSize;
  const trimmedQuery = input.queryText?.trim() ?? "";
  const searchLike = trimmedQuery ? `%${trimmedQuery}%` : "";
  const paymentStatus = input.paymentStatus ?? "All";
  const sourceType = input.sourceType ?? "All";

  const orderByMap: Record<AdminBillingInvoiceSort, string> = {
    newest: "i.created_at desc, i.invoice_number desc",
    oldest: "i.created_at asc, i.invoice_number asc",
    "highest-total": "i.total_cents desc, i.created_at desc",
    "highest-due": "i.amount_due_cents desc, i.created_at desc",
  };

  const summaryResult = await measurePerfStep("admin-billing.day-summary", () =>
    query<{
      invoice_count: number;
      total_billed_cents: number;
      total_collected_cents: number;
      outstanding_cents: number;
      paid_count: number;
      pending_partial_count: number;
      consultation_revenue_cents: number;
      lab_revenue_cents: number;
      pharmacy_revenue_cents: number;
    }>(
      `
        with scoped_invoices as (
          select id, total_cents, amount_paid_cents, amount_due_cents, payment_status
          from invoices
          where organization_id = $1
            and to_char(created_at at time zone $2, 'YYYY-MM-DD') = $3
        )
        select
          count(*)::int as invoice_count,
          coalesce(sum(total_cents), 0)::bigint as total_billed_cents,
          coalesce(sum(amount_paid_cents), 0)::bigint as total_collected_cents,
          coalesce(sum(amount_due_cents), 0)::bigint as outstanding_cents,
          count(*) filter (where payment_status = 'Paid')::int as paid_count,
          count(*) filter (where payment_status in ('Pending', 'Partially Paid'))::int as pending_partial_count,
          coalesce(sum(case when ii.category = 'Consultation' then ii.total_amount_cents else 0 end), 0)::bigint as consultation_revenue_cents,
          coalesce(sum(case when ii.category = 'Laboratory' then ii.total_amount_cents else 0 end), 0)::bigint as lab_revenue_cents,
          coalesce(sum(case when ii.category = 'Medicine' then ii.total_amount_cents else 0 end), 0)::bigint as pharmacy_revenue_cents
        from scoped_invoices invoices
        left join invoice_items ii on ii.invoice_id = invoices.id
      `,
      [user.organizationId, timezone, input.billingDate],
    ),
  );

  const [countResult, rowsResult] = await Promise.all([
    measurePerfStep("admin-billing.day-count", () =>
      query<{ total_invoices: number }>(
        `
          select count(*)::int as total_invoices
          from invoices i
          where i.organization_id = $1
            and to_char(i.created_at at time zone $2, 'YYYY-MM-DD') = $3
            and ($4 = '' or i.invoice_number ilike $4 or i.patient_name ilike $4)
            and ($5 = 'All' or i.payment_status = $5)
            and ($6 = 'All' or coalesce(i.source_type, 'other') = $6)
        `,
        [user.organizationId, timezone, input.billingDate, searchLike, paymentStatus, sourceType],
      ),
    ),
    measurePerfStep("admin-billing.day-query", () =>
      query<{
        id: string;
        invoice_number: string;
        patient_name: string;
        family_member_id: string | null;
        source_type: string | null;
        created_at: string;
        total_cents: number;
        amount_paid_cents: number;
        amount_due_cents: number;
        payment_status: string;
        latest_payment_method: string | null;
      }>(
        `
          select
            i.id,
            i.invoice_number,
            i.patient_name,
            i.family_member_id,
            coalesce(i.source_type, 'other') as source_type,
            i.created_at,
            i.total_cents,
            i.amount_paid_cents,
            i.amount_due_cents,
            i.payment_status,
            latest_payment.method as latest_payment_method
          from invoices i
          left join lateral (
            select p.method
            from payments p
            where p.invoice_id = i.id
            order by p.paid_at desc
            limit 1
          ) latest_payment on true
          where i.organization_id = $1
            and to_char(i.created_at at time zone $2, 'YYYY-MM-DD') = $3
            and ($4 = '' or i.invoice_number ilike $4 or i.patient_name ilike $4)
            and ($5 = 'All' or i.payment_status = $5)
            and ($6 = 'All' or coalesce(i.source_type, 'other') = $6)
          order by ${orderByMap[input.sort]}
          limit $7 offset $8
        `,
        [
          user.organizationId,
          timezone,
          input.billingDate,
          searchLike,
          paymentStatus,
          sourceType,
          input.pageSize,
          offset,
        ],
      ),
    ),
  ]);

  const summaryRow = summaryResult.rows[0];

  return {
    day: {
      date: input.billingDate,
      page: input.page,
      pageSize: input.pageSize,
      sort: input.sort,
      totalInvoices: asNumber(countResult.rows[0]?.total_invoices ?? 0),
      summary: {
        invoiceCount: asNumber(summaryRow?.invoice_count ?? 0),
        totalBilledCents: asNumber(summaryRow?.total_billed_cents ?? 0),
        totalCollectedCents: asNumber(summaryRow?.total_collected_cents ?? 0),
        outstandingCents: asNumber(summaryRow?.outstanding_cents ?? 0),
        paidCount: asNumber(summaryRow?.paid_count ?? 0),
        pendingPartialCount: asNumber(summaryRow?.pending_partial_count ?? 0),
        consultationRevenueCents: asNumber(summaryRow?.consultation_revenue_cents ?? 0),
        labRevenueCents: asNumber(summaryRow?.lab_revenue_cents ?? 0),
        pharmacyRevenueCents: asNumber(summaryRow?.pharmacy_revenue_cents ?? 0),
      },
      rows: rowsResult.rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        patientName: row.patient_name,
        familyMemberId: row.family_member_id ?? undefined,
        sourceType: row.source_type ?? "other",
        createdAt: row.created_at,
        totalCents: asNumber(row.total_cents),
        amountPaidCents: asNumber(row.amount_paid_cents),
        amountDueCents: asNumber(row.amount_due_cents),
        paymentStatus: row.payment_status,
        paymentMethod: row.latest_payment_method ?? undefined,
      })),
    },
  };
}

export async function getAdminBillingInvoice(
  user: SafeUser,
  invoiceId: string,
) {
  ensureAdminUser(user);

  const [invoiceResult, itemResult, paymentResult] = await Promise.all([
    query<{
      id: string;
      invoice_number: string;
      patient_id: string;
      patient_name: string;
      family_member_id: string | null;
      organization_id: string;
      hospital_id: string;
      source_type: string | null;
      source_id: string | null;
      created_at: string;
      due_date: string | null;
      subtotal_cents: number;
      total_cents: number;
      amount_paid_cents: number;
      amount_due_cents: number;
      payment_status: string;
    }>(
      `
        select *
        from invoices
        where id = $1 and organization_id = $2
        limit 1
      `,
      [invoiceId, user.organizationId],
    ),
    query<{
      id: string;
      invoice_id: string;
      organization_id: string;
      description: string;
      category: string;
      quantity: number;
      unit_amount_cents: number;
      total_amount_cents: number;
      source_type: string | null;
      source_id: string | null;
    }>(
      `
        select *
        from invoice_items
        where invoice_id = $1 and organization_id = $2
        order by id asc
      `,
      [invoiceId, user.organizationId],
    ),
    query<{
      id: string;
      invoice_id: string;
      patient_id: string;
      organization_id: string;
      amount_cents: number;
      method: string;
      reference_number: string | null;
      paid_at: string;
      recorded_by_id: string | null;
      recorded_by_name: string | null;
    }>(
      `
        select *
        from payments
        where invoice_id = $1 and organization_id = $2
        order by paid_at desc
      `,
      [invoiceId, user.organizationId],
    ),
  ]);

  const invoiceRow = invoiceResult.rows[0];

  if (!invoiceRow) {
    throw createHttpError(404, "Invoice not found.");
  }

  return {
    invoice: {
      id: invoiceRow.id,
      invoiceNumber: invoiceRow.invoice_number,
      patientId: invoiceRow.patient_id,
      patientName: invoiceRow.patient_name,
      familyMemberId: invoiceRow.family_member_id ?? undefined,
      organizationId: invoiceRow.organization_id,
      hospitalId: invoiceRow.hospital_id,
      sourceType: invoiceRow.source_type ?? undefined,
      sourceId: invoiceRow.source_id ?? undefined,
      createdAt: invoiceRow.created_at,
      dueDate: invoiceRow.due_date ?? undefined,
      subtotalCents: asNumber(invoiceRow.subtotal_cents),
      totalCents: asNumber(invoiceRow.total_cents),
      amountPaidCents: asNumber(invoiceRow.amount_paid_cents),
      amountDueCents: asNumber(invoiceRow.amount_due_cents),
      paymentStatus: invoiceRow.payment_status,
      items: itemResult.rows.map((row) => ({
        id: row.id,
        invoiceId: row.invoice_id,
        organizationId: row.organization_id,
        description: row.description,
        category: row.category,
        quantity: asNumber(row.quantity),
        unitAmountCents: asNumber(row.unit_amount_cents),
        totalAmountCents: asNumber(row.total_amount_cents),
        sourceType: row.source_type ?? undefined,
        sourceId: row.source_id ?? undefined,
      })),
      payments: paymentResult.rows.map((row) => ({
        id: row.id,
        invoiceId: row.invoice_id,
        patientId: row.patient_id,
        organizationId: row.organization_id,
        amountCents: asNumber(row.amount_cents),
        method: row.method,
        referenceNumber: row.reference_number ?? undefined,
        paidAt: row.paid_at,
        recordedBy:
          row.recorded_by_id && row.recorded_by_name
            ? {
                id: row.recorded_by_id,
                name: row.recorded_by_name,
              }
            : undefined,
      })),
    },
  };
}

export async function getAdminEmergencyActivity(
  user: SafeUser,
  input: {
    page: number;
    pageSize: number;
    sort: "newest" | "oldest";
    severity?: "All" | "Priority" | "Emergency";
    status?: "All" | "Active" | "In consultation" | "Transferred" | "Completed";
    queryText?: string;
    dateFrom?: string;
    dateTo?: string;
  },
) {
  ensureAdminUser(user);

  const offset = (input.page - 1) * input.pageSize;
  const trimmedQuery = input.queryText?.trim() ?? "";
  const searchLike = trimmedQuery ? `%${trimmedQuery}%` : "";
  const severity = input.severity ?? "All";
  const status = input.status ?? "All";
  const dateFrom = input.dateFrom?.trim() ?? "";
  const dateTo = input.dateTo?.trim() ?? "";
  const orderBy = input.sort === "oldest" ? "ev.created_at asc" : "ev.created_at desc";

  const filters = `
    ev.organization_id = $1
    and ($2 = 'All' or ev.severity = $2)
    and ($3 = 'All' or ev.status = $3)
    and ($4 = '' or ev.created_at::date >= $4::date)
    and ($5 = '' or ev.created_at::date <= $5::date)
    and ($6 = '' or ev.patient_name ilike $6 or ev.emergency_reason ilike $6)
  `;

  const params = [user.organizationId, severity, status, dateFrom, dateTo, searchLike];

  const [countResult, rowsResult] = await Promise.all([
    query<{ total_items: number }>(
      `
        select count(*)::int as total_items
        from emergency_visits ev
        where ${filters}
      `,
      params,
    ),
    query<{
      id: string;
      patient_name: string;
      family_member_id: string | null;
      severity: string;
      status: string;
      emergency_reason: string;
      contact_name: string | null;
      contact_phone: string | null;
      allergies: string | null;
      medical_conditions: string | null;
      blood_group: string | null;
      created_at: string;
      doctor_id: string | null;
      doctor_name: string | null;
    }>(
      `
        select
          ev.id,
          ev.patient_name,
          ev.family_member_id,
          ev.severity,
          ev.status,
          ev.emergency_reason,
          ev.contact_name,
          ev.contact_phone,
          ev.allergies,
          ev.medical_conditions,
          ev.blood_group,
          ev.created_at,
          qe.doctor_id,
          d.name as doctor_name
        from emergency_visits ev
        left join queue_entries qe
          on qe.id = ev.queue_entry_id
         and qe.organization_id = ev.organization_id
        left join doctors d
          on d.id = qe.doctor_id
         and d.organization_id = ev.organization_id
        where ${filters}
        order by ${orderBy}
        limit $7 offset $8
      `,
      [...params, input.pageSize, offset],
    ),
  ]);

  return {
    activity: {
      page: input.page,
      pageSize: input.pageSize,
      sort: input.sort,
      totalItems: asNumber(countResult.rows[0]?.total_items ?? 0),
      rows: rowsResult.rows.map((row) => ({
        id: row.id,
        patientName: row.patient_name,
        familyMemberId: row.family_member_id ?? undefined,
        severity: row.severity,
        status: row.status,
        emergencyReason: row.emergency_reason,
        contactName: row.contact_name ?? undefined,
        contactPhone: row.contact_phone ?? undefined,
        allergies: row.allergies ?? undefined,
        medicalConditions: row.medical_conditions ?? undefined,
        bloodGroup: row.blood_group ?? undefined,
        intakeTime: row.created_at,
        assignedDoctorId: row.doctor_id ?? undefined,
        assignedDoctorName: row.doctor_name ?? undefined,
      })),
    },
  };
}

export async function createEmergencyVisitForOperations(
  user: SafeUser,
  draft: EmergencyVisitDraft,
) {
  if (user.role !== "receptionist") {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  if (!draft.emergencyReason.trim() || draft.emergencyReason.trim().length < 3) {
    throw createHttpError(400, "Please review the emergency details provided.", {
      errors: { emergencyReason: "Enter the immediate care reason." },
    });
  }

  const state = await loadHospitalState();
  const familyMember = getFamilyMemberById(state, draft.familyMemberId);
  const patientUser =
    draft.patientId && draft.patientId.trim()
      ? (await loadUsers()).find(
          (currentUser) =>
            currentUser.id === draft.patientId &&
            currentUser.organizationId === user.organizationId &&
            currentUser.role === "patient",
        )
      : undefined;

  if (draft.familyMemberId && (!familyMember || familyMember.organizationId !== user.organizationId)) {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  if (draft.patientId && !patientUser) {
    throw createHttpError(400, "The selected patient could not be found.");
  }

  const patientName =
    familyMember?.fullName ??
    patientUser?.patientName ??
    patientUser?.displayName ??
    draft.patientName?.trim();

  if (!patientName) {
    throw createHttpError(400, "Please review the emergency details provided.", {
      errors: { patientName: "Enter a patient or visitor name." },
    });
  }

  const nowIso = new Date().toISOString();
  const emergencyQueueEntry: QueueEntryRecord = {
    id: `Q-${Date.now().toString().slice(-6)}`,
    organizationId: user.organizationId,
    patientName,
    departmentId: "dept-emergency",
    doctorId: undefined,
    appointmentId: undefined,
    priority: draft.severity === "Emergency" ? "Emergency" : "Priority",
    status: "Waiting",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const emergencyVisit: EmergencyVisitRecord = {
    id: createEmergencyVisitId(),
    organizationId: user.organizationId,
    appointmentId: undefined,
    queueEntryId: emergencyQueueEntry.id,
    patientId: patientUser?.id,
    familyMemberId: familyMember?.id,
    patientName,
    contactName: draft.contactName?.trim() || undefined,
    contactPhone: draft.contactPhone?.trim() || undefined,
    emergencyReason: draft.emergencyReason.trim(),
    severity: draft.severity,
    allergies:
      familyMember?.allergies ??
      patientUser?.allergies ??
      (draft.allergies?.trim() || undefined),
    medicalConditions:
      familyMember?.medicalConditions ??
      patientUser?.medicalConditions ??
      (draft.medicalConditions?.trim() || undefined),
    bloodGroup:
      familyMember?.bloodGroup ??
      patientUser?.bloodGroup ??
      (draft.bloodGroup?.trim() || undefined),
    status: "Active",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await withTransaction(async () => {
    await insertQueueEntry(emergencyQueueEntry);
    await insertEmergencyVisit(emergencyVisit);
  });

  const users = await loadUsers();
  const emergencyDoctors = users
    .filter(
      (currentUser) =>
        currentUser.organizationId === user.organizationId &&
        currentUser.role === "doctor",
    )
    .filter((currentUser) => {
      const doctor = state.doctors.find((item) => item.id === currentUser.doctorId);
      return doctor?.status === "Emergency duty" || doctor?.departmentId === "dept-emergency";
    })
    .map((currentUser) => currentUser.id);

  const createdNotifications = await notifyUsers({
    organizationId: user.organizationId,
    userIds: [...emergencyDoctors, ...(patientUser?.id ? [patientUser.id] : [])],
    title: "Emergency priority activated",
    message: `${patientName} was added for immediate care in Emergency.`,
    category: "Emergency",
    relatedEntityType: "emergency-visit",
    relatedEntityId: emergencyVisit.id,
  });

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "emergency.created",
    entityType: "emergency-visit",
    entityId: emergencyVisit.id,
    metadata: {
      severity: emergencyVisit.severity,
      queueEntryId: emergencyQueueEntry.id,
    },
  });

  return {
    patch: {
      queueEntries: [emergencyQueueEntry],
      emergencyVisits: [emergencyVisit],
      notifications: createdNotifications.filter((notification) => notification.userId === user.id),
    },
  };
}

export async function updateQueuePriority(
  user: SafeUser,
  queueEntryId: string,
  priority: QueuePriority,
) {
  if (!["administrator", "receptionist"].includes(user.role)) {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  const state = await loadHospitalState();
  const queueEntry = state.queueEntries.find((entry) => entry.id === queueEntryId);

  if (!queueEntry) {
    throw createHttpError(404, "Queue entry not found.");
  }

  if (queueEntry.organizationId !== user.organizationId) {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  if (queueEntry.status === "In consultation") {
    throw createHttpError(400, "Queue priority cannot be changed during consultation.");
  }

  const updatedQueueEntry = {
    ...queueEntry,
    priority,
    updatedAt: new Date().toISOString(),
  };

  await updateQueueEntryById({
    queueEntryId,
    organizationId: queueEntry.organizationId,
    status: queueEntry.status,
    updatedAt: updatedQueueEntry.updatedAt,
    priority,
  });

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "queue.priority-updated",
    entityType: "queue-entry",
    entityId: queueEntryId,
    metadata: {
      priority,
    },
  });

  return {
    patch: {
      queueEntries: [updatedQueueEntry],
    },
  };
}

export async function getJourneyByToken(user: SafeUser, token: string) {
  const state = await reconcileNoShowAppointments(await loadHospitalState());
  const journey = (state.patientJourneys ?? []).find((item) => item.token === token);

  if (!journey) {
    throw createHttpError(404, "Patient journey not found.");
  }

  if (!canAccessJourney(user, journey, state)) {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  const appointment = journey.appointmentId
    ? state.appointments.find((item) => item.id === journey.appointmentId)
    : undefined;
  const queueEntry = journey.queueEntryId
    ? state.queueEntries.find((item) => item.id === journey.queueEntryId)
    : undefined;
  const currentStep = getJourneyCurrentStep(state, appointment, queueEntry);
  const queueEstimate = queueEntry
    ? formatQueueWaitEstimate(getQueueWaitEstimate(state, queueEntry))
    : appointment && appointment.status !== "Completed" && appointment.status !== "Cancelled"
      ? "Available after check-in"
      : undefined;

  return {
    journey: {
      ...journey,
      currentStep,
      steps: buildJourneySteps(state, appointment),
      nextStep:
        buildJourneySteps(state, appointment).find((step) => step !== currentStep) ?? currentStep,
      queueStatus: queueEntry?.status,
      priority: queueEntry?.priority,
      doctorName: appointment ? getDoctorById(state, appointment.doctorId)?.name ?? "Doctor pending" : undefined,
      departmentName:
        appointment
          ? state.departments.find((department) => department.id === appointment.departmentId)?.name
          : queueEntry
            ? state.departments.find((department) => department.id === queueEntry.departmentId)?.name
            : undefined,
      estimatedWait: queueEstimate,
    },
  };
}

export async function getDoctorHandoffSummary(
  user: SafeUser,
  input: { appointmentId?: string; patientId?: string },
) {
  if (!["doctor", "administrator"].includes(user.role)) {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  const state = await reconcileNoShowAppointments(await loadHospitalState());
  const scopedState = withScopedState(user.role, user, state);
  const appointment = input.appointmentId
    ? scopedState.appointments.find((item) => item.id === input.appointmentId)
    : undefined;
  const patientId = input.patientId ?? appointment?.patientId;

  if (!appointment && !patientId) {
    throw createHttpError(400, "Select a patient visit to generate the handoff.");
  }

  const medicalRecords = scopedState.medicalRecords
    .filter((record) => (patientId ? record.patientId === patientId : appointment ? record.appointmentId === appointment.id : false))
    .sort((left, right) => `${right.visitDate}${right.createdAt}`.localeCompare(`${left.visitDate}${left.createdAt}`));
  const prescriptions = scopedState.prescriptions
    .filter((prescription) => (patientId ? prescription.patientId === patientId : appointment ? prescription.appointmentId === appointment.id : false))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const labRequests = scopedState.labRequests
    .filter((request) => (patientId ? request.patientId === patientId : appointment ? request.patientName === appointment.patientName : false))
    .sort((left, right) => `${right.requestedDate}${right.requestedTime}`.localeCompare(`${left.requestedDate}${left.requestedTime}`));
  const latestRecord = medicalRecords[0];
  const latestPrescription = prescriptions[0];
  const linkedFamilyMember =
    appointment?.familyMemberId
      ? scopedState.familyMembers?.find((member) => member.id === appointment.familyMemberId)
      : undefined;
  const patientProfile =
    patientId
      ? (await loadUsers()).find((currentUser) => currentUser.id === patientId)
      : undefined;

  const summary = {
    patient: appointment?.patientName ?? patientProfile?.patientName ?? patientProfile?.displayName ?? "Not recorded",
    patientContext: linkedFamilyMember ? linkedFamilyMember.relationship : "Primary patient",
    reasonForVisit: appointment?.reasonForAppointment || "Not recorded",
    allergies: linkedFamilyMember?.allergies ?? patientProfile?.allergies ?? "Not recorded",
    chronicConditions: linkedFamilyMember?.medicalConditions ?? patientProfile?.medicalConditions ?? "Not recorded",
    bloodGroup: linkedFamilyMember?.bloodGroup ?? patientProfile?.bloodGroup ?? "Not recorded",
    latestDiagnosis: latestRecord?.diagnosis ?? "Not recorded",
    latestClinicalNote: latestRecord?.clinicalNotes ?? "Not recorded",
    recentLabFindings:
      labRequests[0]
        ? `${labRequests[0].testName} - ${labRequests[0].status}`
        : "No data available",
    activePrescription:
      latestPrescription
        ? `${latestPrescription.medicines.map((medicine) => medicine.medicineName).join(", ")}`
        : "No data available",
    pendingLabs:
      labRequests.filter((request) => request.status !== "Completed").map((request) => request.testName).join(", ") ||
      "No data available",
    visitStatus: appointment?.status ?? "Not recorded",
    followUp: latestPrescription?.followUpDate ?? "Not recorded",
  };

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "handoff.viewed",
    entityType: "patient-handoff",
    entityId: appointment?.id ?? patientId,
  });

  return {
    handoff: summary,
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
        familyMemberId: asString(row.family_member_id),
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
      familyMemberId: asString(row.family_member_id),
      medicines: medicinesByPrescriptionId.get(String(row.id)) ?? [],
      instructions: String(row.instructions),
      followUpDate: asString(row.follow_up_date),
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

  if (
    request.status !== "Sample Collected" &&
    request.status !== "Processing" &&
    request.status !== "Completed"
  ) {
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

  const attachmentContentBase64 = draft.attachment?.contentBase64;
  const sanitizedAttachmentFileName = draft.attachment
    ? sanitizeAttachmentFileName(draft.attachment.fileName.trim())
    : undefined;
  const storedAttachment = draft.attachment && attachmentContentBase64
    ? await storeClinicalFileWithFallback({
        contentBase64: attachmentContentBase64,
        fileName: sanitizedAttachmentFileName ?? draft.attachment.fileName,
        contentType: draft.attachment.contentType,
        folder: `medivanta/${request.organizationId}/lab-reports`,
      })
    : null;

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
    attachment: draft.attachment
      ? {
          ...draft.attachment,
          fileName: sanitizedAttachmentFileName ?? draft.attachment.fileName,
          contentBase64: storedAttachment ? undefined : draft.attachment.contentBase64,
          storageProvider: storedAttachment?.storageProvider,
          storageUrl: storedAttachment?.storageUrl,
          storagePublicId: storedAttachment?.storagePublicId,
          originalFileName: storedAttachment?.originalFileName,
          mimeType: storedAttachment?.mimeType,
          storageSize: storedAttachment?.storageSize,
        }
      : undefined,
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
  const familyMember = getFamilyMemberById(state, appointment?.familyMemberId);

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
    patientName: familyMember?.fullName ?? patient.patientName,
    doctorId: doctor.id,
    doctorName: doctor.name,
    familyMemberId: familyMember?.id,
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
  const effectiveFamilyMemberId =
    normalizedDraft.familyMemberId ?? appointment?.familyMemberId ?? undefined;
  const familyMember = getFamilyMemberById(state, effectiveFamilyMemberId);

  if (appointment && appointment.doctorId !== user.doctorId) {
    throw createHttpError(400, "Please review the prescription details provided.", {
      errors: {
        appointmentId: "Selected appointment does not belong to this patient.",
      },
    });
  }

  if (
    effectiveFamilyMemberId &&
    (!familyMember || familyMember.primaryPatientUserId !== patient.patientId)
  ) {
    throw createHttpError(400, "Please review the prescription details provided.", {
      errors: {
        familyMemberId: "Selected family member does not belong to this patient.",
      },
    });
  }

  if (
    effectiveFamilyMemberId &&
    appointment &&
    appointment.familyMemberId &&
    appointment.familyMemberId !== effectiveFamilyMemberId
  ) {
    throw createHttpError(400, "Please review the prescription details provided.", {
      errors: {
        familyMemberId: "Selected family member does not match the linked appointment.",
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
    patientName: familyMember?.fullName ?? patient.patientName,
    familyMemberId: effectiveFamilyMemberId,
    doctorId: doctor.id,
    doctorName: doctor.name,
    hospitalId: doctor.organizationId,
    organizationId: doctor.organizationId,
    appointmentId: normalizedDraft.appointmentId,
    medicines: normalizedMedicines,
    instructions: normalizedDraft.instructions,
    followUpDate: normalizedDraft.followUpDate,
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
    message: `${doctor.name} issued a prescription for ${familyMember?.fullName ?? patient.patientName}.`,
    category: "Prescription",
    relatedEntityType: "prescription",
    relatedEntityId: prescription.id,
  });
  const followUpNotifications = prescription.followUpDate
    ? await notifyUsersOnceForEntity({
        organizationId: doctor.organizationId,
        userIds: [patient.patientId],
        title: "Follow-up reminder",
        message: `A follow-up visit is planned for ${prescription.followUpDate} for ${familyMember?.fullName ?? patient.patientName}.`,
        category: "Prescription",
        relatedEntityType: "prescription-follow-up",
        relatedEntityId: prescription.id,
      })
    : [];
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
      notifications: [...createdNotifications, ...followUpNotifications].filter(
        (notification) => notification.userId === user.id,
      ),
    },
  };
}

export async function updatePrescription(
  user: SafeUser,
  prescriptionId: string,
  draft: PrescriptionDraft,
) {
  const [state, loadedUsers] = await measurePerfStep("prescription.update.load-context", () =>
    Promise.all([loadHospitalState(), loadUsers()]),
  );
  const currentPrescription = state.prescriptions.find((item) => item.id === prescriptionId);

  if (!currentPrescription || currentPrescription.organizationId !== user.organizationId) {
    throw createHttpError(404, "Prescription not found.");
  }

  if (!canEditPrescription(currentPrescription, user)) {
    if (currentPrescription.status === "Dispensed") {
      throw createHttpError(400, "Dispensed prescriptions can no longer be edited.");
    }

    throw createHttpError(403, "The editing period for this prescription has ended.");
  }

  const normalizedDraft = normalizePrescriptionDraft(draft);
  const validation = validatePrescriptionDraft(normalizedDraft);

  if (!validation.isValid) {
    throw createHttpError(400, "Please review the prescription details provided.", {
      errors: validation.errors,
    });
  }

  const scopedPatients = await getDoctorScopedPatients(state, user, loadedUsers);
  const patient = scopedPatients.get(normalizedDraft.patientId);
  if (!patient || patient.patientId !== currentPrescription.patientId) {
    throw createHttpError(400, "Please review the prescription details provided.", {
      errors: {
        patientId: "This prescription can only be edited for the original patient.",
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
  const effectiveFamilyMemberId =
    normalizedDraft.familyMemberId ?? appointment?.familyMemberId ?? currentPrescription.familyMemberId;
  const familyMember = getFamilyMemberById(state, effectiveFamilyMemberId);

  if (
    effectiveFamilyMemberId &&
    (!familyMember || familyMember.primaryPatientUserId !== currentPrescription.patientId)
  ) {
    throw createHttpError(400, "Please review the prescription details provided.", {
      errors: {
        familyMemberId: "Selected family member does not belong to this patient.",
      },
    });
  }

  if (
    appointment &&
    appointment.familyMemberId &&
    appointment.familyMemberId !== effectiveFamilyMemberId
  ) {
    throw createHttpError(400, "Please review the prescription details provided.", {
      errors: {
        familyMemberId: "Selected family member does not match the linked appointment.",
      },
    });
  }

  const catalogById = new Map(
    state.medicineCatalog
      .filter((medicine) => medicine.organizationId === currentPrescription.organizationId)
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
      dosage: `${medicine.doseQuantity ?? 1} ${medicine.doseUnit ?? catalogMedicine.unit}`.trim(),
      totalQuantity: getMedicineRequiredQuantity({
        ...medicine,
        medicineName: catalogMedicine.name,
        strength: catalogMedicine.strength,
        doseUnit: medicine.doseUnit ?? catalogMedicine.unit,
      }),
    };
  });

  const updatedPrescription: PrescriptionRecord = {
    ...currentPrescription,
    patientName: familyMember?.fullName ?? currentPrescription.patientName,
    appointmentId: normalizedDraft.appointmentId ?? currentPrescription.appointmentId,
    familyMemberId: effectiveFamilyMemberId,
    medicines: normalizedMedicines,
    instructions: normalizedDraft.instructions,
    followUpDate: normalizedDraft.followUpDate,
  };

  await measurePerfStep("prescription.update.write", () =>
    updatePrescriptionRecord({
      prescriptionId,
      organizationId: updatedPrescription.organizationId,
      instructions: updatedPrescription.instructions,
      followUpDate: updatedPrescription.followUpDate,
      medicines: updatedPrescription.medicines,
    }),
  );

  await writeAuditLog({
    organizationId: updatedPrescription.organizationId,
    actorUserId: user.id,
    action: "prescription.updated",
    entityType: "prescription",
    entityId: updatedPrescription.id,
    metadata: {
      patientId: updatedPrescription.patientId,
    },
  });

  return {
    patch: {
      prescriptions: [updatedPrescription],
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
  const selectedFamilyMember = getFamilyMemberById(state, draft.familyMemberId);
  const effectiveDraft: AppointmentDraft =
    user.role === "patient"
      ? {
          ...draft,
          patientName: selectedFamilyMember?.fullName ?? (user.patientName ?? user.displayName),
          consultationMode: draft.consultationMode ?? "In Person",
        }
      : {
          ...draft,
          consultationMode: draft.consultationMode ?? "In Person",
        };

  if (user.role === "patient" && draft.familyMemberId) {
    if (!selectedFamilyMember || selectedFamilyMember.primaryPatientUserId !== user.id) {
      throw createHttpError(403, "You do not have access to this workspace.");
    }
  }
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

  if (user.role === "patient") {
    const branch = effectiveDraft.branchId
      ? (state.branches ?? []).find((item) => item.id === effectiveDraft.branchId)
      : undefined;

    if (!branch || !branch.active) {
      throw createHttpError(400, "Please select a hospital branch.", {
        errors: { branchId: "Select a hospital branch." },
      });
    }

  if (doctor.branchId && doctor.branchId !== branch.id) {
    throw createHttpError(400, "Please select a doctor available at this branch.", {
      errors: { doctorId: "Select a doctor available at this branch." },
    });
  }
  }

  const users = await loadUsers();
  const doctorUsers = users.filter(
    (currentUser) =>
      currentUser.role === "doctor" &&
      currentUser.organizationId === doctor.organizationId &&
      currentUser.doctorId === doctor.id,
  );
  const activeDoctorUsers = doctorUsers.filter(isActiveStaffUser);
  if (doctorUsers.length > 0 && activeDoctorUsers.length === 0) {
    throw createHttpError(400, "This doctor is not available for new appointments.");
  }

  const doctorUser = activeDoctorUsers[0] ?? doctorUsers[0];
  const consultationFeeCents = parseCurrencyTextToCents(doctorUser?.consultationFee);

  if (user.role === "patient") {
    const paymentErrors: Partial<Record<keyof AppointmentDraft, string>> = {};

    if (!draft.paymentMethod) {
      paymentErrors.paymentMethod = "Select a payment method.";
    }

    if (Object.keys(paymentErrors).length > 0) {
      throw createHttpError(400, "Please complete payment before booking this appointment.", {
        errors: paymentErrors,
      });
    }
  }

  const appointment: AppointmentRecord = {
    id: createAppointmentId(state),
    organizationId: doctor.organizationId,
    patientId: user.role === "patient" ? user.id : undefined,
    patientName: effectiveDraft.patientName.trim(),
    familyMemberId: user.role === "patient" ? draft.familyMemberId?.trim() || undefined : undefined,
    doctorId: doctor.id,
    departmentId: doctor.departmentId,
    appointmentDate: effectiveDraft.appointmentDate,
    appointmentTime: effectiveDraft.appointmentTime,
    reasonForAppointment: effectiveDraft.reasonForAppointment.trim(),
    consultationMode: effectiveDraft.consultationMode ?? "In Person",
    status: "Scheduled",
  };

  const existingJourney = findExistingJourneyForAppointment(state, appointment.id);
  const journey: PatientJourneyRecord | null = existingJourney
    ? null
    : {
        id: createJourneyId(),
        organizationId: appointment.organizationId,
        token: createJourneyToken(),
        appointmentId: appointment.id,
        queueEntryId: undefined,
        patientId: appointment.patientId,
        familyMemberId: appointment.familyMemberId,
        patientName: appointment.patientName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
  const prepaidInvoice =
    user.role === "patient"
      ? buildInvoiceRecord({
          patientId: user.id,
          patientName: appointment.patientName,
          familyMemberId: appointment.familyMemberId,
          organizationId: appointment.organizationId,
          hospitalId: appointment.organizationId,
          sourceType: "appointment",
          sourceId: appointment.id,
          dueDate: appointment.appointmentDate,
          items: [
            {
              description: `Consultation with ${doctorUser?.displayName ?? doctor.name}`,
              category: "Consultation",
              quantity: 1,
              unitAmountCents: consultationFeeCents,
            },
          ],
        })
      : null;
  const prepaidPayment: PaymentRecord | null = prepaidInvoice
    ? {
        id: createPaymentId(),
        invoiceId: prepaidInvoice.id,
        patientId: prepaidInvoice.patientId,
        organizationId: prepaidInvoice.organizationId,
        amountCents: prepaidInvoice.totalCents,
        method: draft.paymentMethod ?? "UPI",
        ...(draft.paymentReferenceNumber?.trim()
          ? { referenceNumber: draft.paymentReferenceNumber.trim() }
          : {}),
        paidAt: new Date().toISOString(),
        recordedBy: {
          id: user.id,
          name: user.displayName,
        },
      }
    : null;

  if (prepaidInvoice && prepaidPayment) {
    prepaidInvoice.amountPaidCents = prepaidPayment.amountCents;
    prepaidInvoice.amountDueCents = 0;
    prepaidInvoice.paymentStatus = "Paid";
    prepaidInvoice.payments = [prepaidPayment];
  }

  await measurePerfStep("appointment.create.write", () =>
    withTransaction(async (client) => {
      await client.query(
        `insert into appointments (
          id, organization_id, patient_id, patient_name, family_member_id, doctor_id, department_id,
          appointment_date, appointment_time, reason_for_appointment, consultation_mode, status
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          appointment.id,
          appointment.organizationId,
          appointment.patientId ?? null,
          appointment.patientName,
          appointment.familyMemberId ?? null,
          appointment.doctorId,
          appointment.departmentId,
          appointment.appointmentDate,
          appointment.appointmentTime,
          appointment.reasonForAppointment,
          appointment.consultationMode,
          appointment.status,
        ],
      );

      if (journey) {
        await client.query(
          `insert into patient_journeys (
            id, organization_id, token, appointment_id, queue_entry_id, patient_id,
            family_member_id, patient_name, created_at, updated_at
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            journey.id,
            journey.organizationId,
            journey.token,
            journey.appointmentId ?? null,
            journey.queueEntryId ?? null,
            journey.patientId ?? null,
            journey.familyMemberId ?? null,
            journey.patientName,
            journey.createdAt,
            journey.updatedAt,
          ],
        );
      }

      if (prepaidInvoice && prepaidPayment) {
        await client.query(
          `insert into invoices (
            id, invoice_number, organization_id, hospital_id, patient_id, patient_name, family_member_id,
            source_type, source_id, due_date, subtotal_cents, discount_cents, tax_cents, total_cents,
            amount_paid_cents, amount_due_cents, payment_status, created_at, updated_at
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
          [
            prepaidInvoice.id,
            prepaidInvoice.invoiceNumber,
            prepaidInvoice.organizationId,
            prepaidInvoice.hospitalId,
            prepaidInvoice.patientId,
            prepaidInvoice.patientName,
            prepaidInvoice.familyMemberId ?? null,
            prepaidInvoice.sourceType ?? null,
            prepaidInvoice.sourceId ?? null,
            prepaidInvoice.dueDate ?? null,
            prepaidInvoice.subtotalCents,
            prepaidInvoice.discountCents,
            prepaidInvoice.taxCents,
            prepaidInvoice.totalCents,
            prepaidInvoice.amountPaidCents,
            prepaidInvoice.amountDueCents,
            prepaidInvoice.paymentStatus,
            prepaidInvoice.createdAt,
            prepaidInvoice.createdAt,
          ],
        );

        for (const item of prepaidInvoice.items) {
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

        await client.query(
          `insert into payments (
            id, invoice_id, organization_id, patient_id, amount_cents, method, reference_number,
            paid_at, recorded_by_id, recorded_by_name
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            prepaidPayment.id,
            prepaidPayment.invoiceId,
            prepaidPayment.organizationId,
            prepaidPayment.patientId,
            prepaidPayment.amountCents,
            prepaidPayment.method,
            prepaidPayment.referenceNumber ?? null,
            prepaidPayment.paidAt,
            prepaidPayment.recordedBy?.id ?? null,
            prepaidPayment.recordedBy?.name ?? null,
          ],
        );
      }
    }),
  );
    const createdNotifications = await notifyUsers({
      organizationId: appointment.organizationId,
      userIds: [
        appointment.patientId ?? user.id,
        ...doctorUsers.map((doctorUser) => doctorUser.id),
      ],
      title: "Appointment booked",
      message: `${appointment.patientName} is scheduled for ${appointment.appointmentDate} at ${appointment.appointmentTime}${appointment.consultationMode === "Online" ? " as an online consultation" : ""}.`,
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
      consultationMode: appointment.consultationMode ?? "In Person",
    },
  });
  const nextState: HospitalState = {
    ...state,
    appointments: [appointment, ...state.appointments],
    patientJourneys: journey ? [journey, ...(state.patientJourneys ?? [])] : state.patientJourneys,
    invoices: prepaidInvoice ? [prepaidInvoice, ...state.invoices] : state.invoices,
  };

  return {
      patch: {
        appointments: [appointment],
        patientJourneys: journey ? [journey] : [],
        invoices: prepaidInvoice ? [prepaidInvoice] : [],
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
  const currentAppointment = getAppointmentById(state, appointmentId);
  if (!currentAppointment) {
    throw createHttpError(404, "Appointment not found.");
  }

  const isOwnedPatientAppointment = isPatientOwnedAppointment(user, currentAppointment);
  const canManageAppointment =
    user.role === "administrator" ||
    user.role === "receptionist" ||
    (user.role === "patient" && isOwnedPatientAppointment);

  if (!canManageAppointment) {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  if (["Completed", "Cancelled"].includes(currentAppointment.status)) {
    throw createHttpError(400, "This appointment can no longer be rescheduled.");
  }

  if (user.role === "patient" && currentAppointment.status !== "Scheduled") {
    throw createHttpError(400, "Only scheduled appointments can be rescheduled.");
  }

  if (
    user.role === "patient" &&
    isPastLocalAppointmentSlot(currentAppointment.appointmentDate, currentAppointment.appointmentTime)
  ) {
    throw createHttpError(400, "Past appointments cannot be rescheduled.");
  }

  const selectedFamilyMember =
    user.role === "patient"
      ? getFamilyMemberById(state, draft.familyMemberId ?? currentAppointment.familyMemberId)
      : getFamilyMemberById(state, currentAppointment.familyMemberId);

  if (
    user.role === "patient" &&
    draft.familyMemberId &&
    (!selectedFamilyMember || selectedFamilyMember.primaryPatientUserId !== user.id)
  ) {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  const effectiveDraft: AppointmentDraft =
    user.role === "patient"
      ? {
          ...draft,
          patientName:
            selectedFamilyMember?.fullName ??
            currentAppointment.patientName ??
            getPatientDisplayName(user),
          familyMemberId: draft.familyMemberId ?? currentAppointment.familyMemberId,
          consultationMode: draft.consultationMode ?? currentAppointment.consultationMode ?? "In Person",
        }
      : {
          ...draft,
          patientName: currentAppointment.patientName,
          familyMemberId: currentAppointment.familyMemberId,
          consultationMode: draft.consultationMode ?? currentAppointment.consultationMode ?? "In Person",
        };

  const validation = validateAppointmentDraft(state, effectiveDraft, appointmentId);

  if (!validation.isValid) {
    throw createHttpError(400, "Please correct the appointment details provided.", {
      errors: validation.errors,
    });
  }

  const doctor = getDoctorById(state, effectiveDraft.doctorId);
  if (!doctor) {
    throw createHttpError(400, "The selected doctor could not be found.");
  }

  const updatedAppointment: AppointmentRecord = {
    ...currentAppointment,
    patientName: effectiveDraft.patientName.trim(),
    familyMemberId: effectiveDraft.familyMemberId?.trim() || undefined,
    doctorId: doctor.id,
    departmentId: doctor.departmentId,
    appointmentDate: effectiveDraft.appointmentDate,
    appointmentTime: effectiveDraft.appointmentTime,
    reasonForAppointment: effectiveDraft.reasonForAppointment.trim(),
    consultationMode: effectiveDraft.consultationMode ?? "In Person",
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
      familyMemberId: updatedAppointment.familyMemberId,
      doctorId: updatedAppointment.doctorId,
      departmentId: updatedAppointment.departmentId,
      appointmentDate: updatedAppointment.appointmentDate,
      appointmentTime: updatedAppointment.appointmentTime,
      reasonForAppointment: updatedAppointment.reasonForAppointment,
      consultationMode: updatedAppointment.consultationMode,
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

  const users = await loadUsers();
  const doctorUsers = users.filter(
    (currentUser) =>
      currentUser.role === "doctor" &&
      currentUser.organizationId === updatedAppointment.organizationId &&
      currentUser.doctorId === updatedAppointment.doctorId,
  );
  const createdNotifications = await notifyUsers({
    organizationId: updatedAppointment.organizationId,
    userIds: [
      updatedAppointment.patientId ?? user.id,
      ...doctorUsers.map((doctorUser) => doctorUser.id),
    ],
    title: "Appointment rescheduled",
    message: `${updatedAppointment.patientName} was moved to ${updatedAppointment.appointmentDate} at ${updatedAppointment.appointmentTime}.`,
    category: "Appointment",
    relatedEntityType: "appointment",
    relatedEntityId: updatedAppointment.id,
  });
  await writeAuditLog({
    organizationId: updatedAppointment.organizationId,
    actorUserId: user.id,
    action: "appointment.rescheduled",
    entityType: "appointment",
    entityId: updatedAppointment.id,
    metadata: {
      consultationMode: updatedAppointment.consultationMode ?? "In Person",
    },
  });

  return {
    patch: {
      appointments: [updatedAppointment],
      queueEntries: updatedQueueEntries,
      notifications: createdNotifications.filter((notification) => notification.userId === user.id),
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

  if (isPatientOwner && !canPatientManageAppointment(appointment)) {
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
  const linkedJourney = (state.patientJourneys ?? []).find((journey) => journey.appointmentId === appointment.id);
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

      if (linkedJourney && changedQueueEntries[0]) {
        await updatePatientJourneyRecord({
          journeyId: linkedJourney.id,
          organizationId: appointment.organizationId,
          queueEntryId: changedQueueEntries[0].id,
          appointmentId: appointment.id,
          updatedAt: new Date().toISOString(),
        });
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
      patientJourneys:
        linkedJourney && changedQueueEntries[0]
          ? [
              {
                ...linkedJourney,
                queueEntryId: changedQueueEntries[0].id,
                updatedAt: new Date().toISOString(),
              },
            ]
          : [],
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
  const linkedEmergencyVisit = (state.emergencyVisits ?? []).find(
    (visit) => visit.queueEntryId === queueEntry.id,
  );

  await measurePerfStep("queue.write", async () => {
    await updateQueueEntryById({
      queueEntryId: queueEntry.id,
      organizationId: queueEntry.organizationId,
      status,
      updatedAt: queueEntry.updatedAt,
      priority: queueEntry.priority,
    });

    if (updatedAppointment) {
      await updateAppointmentStatusById({
        appointmentId: updatedAppointment.id,
        organizationId: updatedAppointment.organizationId,
        status: updatedAppointment.status,
      });
    }

    if (linkedEmergencyVisit) {
      await updateEmergencyVisitRecord({
        emergencyVisitId: linkedEmergencyVisit.id,
        organizationId: linkedEmergencyVisit.organizationId,
        status:
          status === "In consultation"
            ? "In consultation"
            : status === "Completed"
              ? "Completed"
              : undefined,
        updatedAt: new Date().toISOString(),
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
      emergencyVisits:
        linkedEmergencyVisit
          ? [
              {
                ...linkedEmergencyVisit,
                status:
                  status === "In consultation"
                    ? "In consultation"
                    : status === "Completed"
                      ? "Completed"
                      : linkedEmergencyVisit.status,
                updatedAt: new Date().toISOString(),
              },
            ]
          : [],
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
  totalBeds: number;
  occupiedBeds: number;
};

type StaffDraft = {
  displayName: string;
  email: string;
  temporaryPassword: string;
  role: "doctor" | "receptionist" | "laboratory" | "pharmacist" | "administrator";
  departmentId?: string;
  branchId?: string;
  specialization?: string;
  consultationFee?: string;
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

  if (!Number.isInteger(draft.totalBeds) || draft.totalBeds < 0) {
    errors.totalBeds = "Enter a valid total bed count.";
  }

  if (!Number.isInteger(draft.occupiedBeds) || draft.occupiedBeds < 0) {
    errors.occupiedBeds = "Enter a valid occupied bed count.";
  } else if (draft.occupiedBeds > draft.totalBeds) {
    errors.occupiedBeds = "Occupied beds cannot exceed total beds.";
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

  const duplicateUser = users.find((user) => user.email.toLowerCase() === email);
  const canRepairDoctorProfile =
    duplicateUser?.role === "doctor" &&
    draft.role === "doctor" &&
    duplicateUser.organizationId === state.organization.id &&
    duplicateUser.doctorId &&
    !state.doctors.some((doctor) => doctor.id === duplicateUser.doctorId);

  if (duplicateUser && !canRepairDoctorProfile) {
    errors.email = "An account already exists with that email address.";
  }

  const passwordErrors = getPasswordPolicyErrors(draft.temporaryPassword ?? "");
  if (!draft.temporaryPassword?.trim()) {
    errors.temporaryPassword = "Temporary password is required.";
  } else if (passwordErrors.length > 0) {
    errors.temporaryPassword = passwordErrors[0] ?? "Enter a stronger temporary password.";
  }

  if (draft.role === "doctor") {
    if (!draft.departmentId) {
      errors.departmentId = "Select a department for the doctor.";
    }

    if (parseCurrencyTextToCents(draft.consultationFee) <= 0) {
      errors.consultationFee = "Enter the doctor's consultation fee.";
    }

    if (
      draft.branchId &&
      !state.branches?.some(
        (branch) =>
          branch.id === draft.branchId &&
          branch.organizationId === state.organization.id &&
          branch.active,
      )
    ) {
      errors.branchId = "Select an active hospital branch.";
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
      totalBeds: draft.totalBeds,
      occupiedBeds: draft.occupiedBeds,
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
      totalBeds: nextState.organization.totalBeds ?? 0,
      occupiedBeds: nextState.organization.occupiedBeds ?? 0,
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

  const canManageBilling = user.role === "receptionist";
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
  if (!["patient", "doctor"].includes(user.role)) {
    throw createHttpError(403, "You do not have access to create laboratory requests.");
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

  const resolvedContext = resolveClinicalPatientContext(state, user, {
    patientId: draft.patientId,
    familyMemberId: draft.familyMemberId,
    appointmentId: draft.appointmentId,
  });

  if ((selectedTest.priceCents ?? 0) <= 0) {
    throw createHttpError(400, "Billing price is not configured for this service.", {
      errors: { testId: "Billing price is not configured for this service." },
    });
  }

  const request: LabRequestRecord = {
    id: createLabRequestId(state),
    patientId: resolvedContext.patientUserId,
    hospitalId: user.organizationId,
    organizationId: user.organizationId,
    patientName: resolvedContext.patientName,
    familyMemberId: resolvedContext.familyMember?.id,
    appointmentId: resolvedContext.appointment?.id,
    testId: selectedTest.id,
    testName: selectedTest.name,
    departmentId: "dept-laboratory",
    requestedDate: draft.requestedDate,
    requestedTime: draft.requestedTime,
    clinicalNotes: draft.clinicalNotes?.trim() || undefined,
    orderedByUserId: user.id,
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
  const notificationUserIds = [...new Set([request.patientId, user.id, ...labUserIds])];
  const createdNotifications = await notifyUsers({
    organizationId: request.organizationId,
    userIds: notificationUserIds,
    title: user.role === "doctor" ? "Laboratory request ordered" : "Laboratory request booked",
    message:
      user.role === "doctor"
        ? `${request.testName} was ordered for ${request.patientName} on ${request.requestedDate} at ${request.requestedTime}.`
        : `${request.testName} was requested for ${request.requestedDate} at ${request.requestedTime}.`,
    category: "Laboratory",
    relatedEntityType: "lab-request",
    relatedEntityId: request.id,
  });
  const billingNotifications = !state.invoices.some((currentInvoice) => currentInvoice.sourceId === request.id)
    ? await notifyUsers({
        organizationId: request.organizationId,
        userIds: [request.patientId],
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
      patientId: request.patientId,
      appointmentId: request.appointmentId ?? "",
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

  const passwordHash = await hashPassword(draft.temporaryPassword);
  const email = draft.email.trim().toLowerCase();
  const existingUser = users.find((currentUser) => currentUser.email.toLowerCase() === email);
  const department = draft.departmentId
    ? state.departments.find((currentDepartment) => currentDepartment.id === draft.departmentId)
    : undefined;
  const specialization =
    draft.specialization?.trim() || department?.name || "General Medicine";
  const doctorId =
    existingUser?.role === "doctor" && existingUser.doctorId
      ? existingUser.doctorId
      : `doc-${slugify(draft.displayName)}-${randomBytes(3).toString("hex")}`;
  const nextUser: UserRecord = {
    id: existingUser?.id ?? `user-staff-${randomBytes(6).toString("hex")}`,
    organizationId: user.organizationId,
    email,
    displayName: draft.displayName.trim(),
    role: draft.role,
    passwordHash: existingUser?.passwordHash ?? passwordHash,
    departmentId: draft.departmentId,
    consultationFee: draft.role === "doctor" ? draft.consultationFee?.trim() || undefined : undefined,
    staffStatus: draft.status.trim(),
    passwordResetRequired: true,
  };

  let nextState = state;

  if (draft.role === "doctor") {
    nextUser.doctorId = doctorId;

    nextState = {
      ...state,
      doctors: [
        {
          id: doctorId,
          organizationId: user.organizationId,
          name: draft.displayName.trim(),
          specialization,
          departmentId: draft.departmentId!,
          branchId: draft.branchId,
          status: mapDoctorStatus(draft.status),
          availability: "Available for scheduling",
          shiftLabel: "Shift to be assigned",
        },
        ...state.doctors.filter((doctor) => doctor.id !== doctorId),
      ],
    };
  }

  if (isDatabaseConfigured()) {
    await withTransaction(async (client) => {
      await client.query(
        `insert into users (
          id, organization_id, email, display_name, role, password_hash, doctor_id,
          assigned_doctor_id, status, email_verified, password_reset_required, updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, true, now())
        on conflict (id) do update set
          organization_id = excluded.organization_id,
          email = excluded.email,
          display_name = excluded.display_name,
          role = excluded.role,
          password_hash = excluded.password_hash,
          doctor_id = excluded.doctor_id,
          assigned_doctor_id = excluded.assigned_doctor_id,
          status = excluded.status,
          updated_at = now()`,
        [
          nextUser.id,
          nextUser.organizationId,
          nextUser.email,
          nextUser.displayName,
          nextUser.role,
          nextUser.passwordHash,
          nextUser.doctorId ?? null,
          nextUser.assignedDoctorId ?? null,
          nextUser.staffStatus ?? null,
        ],
      );

      if (draft.role === "doctor") {
        const hasBranchColumn = await client.query(
          `select exists (
             select 1
             from information_schema.columns
             where table_name = 'doctors' and column_name = 'branch_id'
           ) as exists`,
        );
        const canPersistBranch = Boolean(hasBranchColumn.rows[0]?.exists);

        if (canPersistBranch) {
          await client.query(
            `insert into doctors (
              id, organization_id, name, specialization, department_id, status,
              availability, shift_label, branch_id, break_windows
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, '[]'::jsonb)
            on conflict (id) do update set
              name = excluded.name,
              specialization = excluded.specialization,
              department_id = excluded.department_id,
              status = excluded.status,
              availability = excluded.availability,
              shift_label = excluded.shift_label,
              branch_id = excluded.branch_id,
              break_windows = excluded.break_windows`,
            [
              doctorId,
              user.organizationId,
              draft.displayName.trim(),
              specialization,
              draft.departmentId!,
              mapDoctorStatus(draft.status),
              "Available for scheduling",
              "Shift to be assigned",
              draft.branchId ?? null,
            ],
          );
        } else {
          await client.query(
            `insert into doctors (
              id, organization_id, name, specialization, department_id, status,
              availability, shift_label, break_windows
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, '[]'::jsonb)
            on conflict (id) do update set
              name = excluded.name,
              specialization = excluded.specialization,
              department_id = excluded.department_id,
              status = excluded.status,
              availability = excluded.availability,
              shift_label = excluded.shift_label,
              break_windows = excluded.break_windows`,
            [
              doctorId,
              user.organizationId,
              draft.displayName.trim(),
              specialization,
              draft.departmentId!,
              mapDoctorStatus(draft.status),
              "Available for scheduling",
              "Shift to be assigned",
            ],
          );
        }
        await client.query(
          `insert into doctor_profiles (user_id, department_id, specialization, consultation_fee)
           values ($1, $2, $3, $4)
           on conflict (user_id) do update set
             department_id = excluded.department_id,
             specialization = excluded.specialization,
             consultation_fee = excluded.consultation_fee`,
          [nextUser.id, draft.departmentId ?? null, specialization, nextUser.consultationFee ?? null],
        );
      } else {
        await client.query(
          `insert into staff_profiles (user_id, department_id)
           values ($1, $2)
           on conflict (user_id) do update set
             department_id = excluded.department_id`,
          [nextUser.id, draft.departmentId ?? null],
        );
      }
    });
  } else {
    await saveUsers([...users.filter((currentUser) => currentUser.id !== nextUser.id), nextUser]);
    await saveHospitalState(nextState);
  }

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

export async function createFamilyMember(user: SafeUser, draft: FamilyMemberDraft) {
  if (user.role !== "patient") {
    throw createHttpError(403, "You do not have access to manage family members.");
  }

  const validation = validateFamilyMemberDraft(draft);
  if (!validation.isValid) {
    throw createHttpError(400, "Please review the family member details provided.", {
      errors: validation.errors,
    });
  }

  const familyMember: FamilyMemberRecord = {
    id: `FAM-${Date.now()}-${randomBytes(3).toString("hex")}`,
    organizationId: user.organizationId,
    primaryPatientUserId: user.id,
    fullName: draft.fullName.trim(),
    relationship: draft.relationship.trim(),
    dateOfBirth: draft.dateOfBirth?.trim() || undefined,
    gender: draft.gender?.trim() || undefined,
    bloodGroup: draft.bloodGroup?.trim() || undefined,
    phoneNumber: draft.phoneNumber?.trim() || undefined,
    emergencyContactName: draft.emergencyContactName?.trim() || undefined,
    emergencyContactPhone: draft.emergencyContactPhone?.trim() || undefined,
    allergies: draft.allergies?.trim() || undefined,
    medicalConditions: draft.medicalConditions?.trim() || undefined,
    preferredLanguage: draft.preferredLanguage?.trim() || undefined,
    status: "Active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await query(
    `insert into family_members (
      id, organization_id, primary_patient_user_id, full_name, relationship, date_of_birth,
      gender, blood_group, phone_number, emergency_contact_name, emergency_contact_phone,
      allergies, medical_conditions, preferred_language, status, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      familyMember.id,
      familyMember.organizationId,
      familyMember.primaryPatientUserId,
      familyMember.fullName,
      familyMember.relationship,
      familyMember.dateOfBirth ?? null,
      familyMember.gender ?? null,
      familyMember.bloodGroup ?? null,
      familyMember.phoneNumber ?? null,
      familyMember.emergencyContactName ?? null,
      familyMember.emergencyContactPhone ?? null,
      familyMember.allergies ?? null,
      familyMember.medicalConditions ?? null,
      familyMember.preferredLanguage ?? null,
      familyMember.status,
      familyMember.createdAt,
      familyMember.updatedAt,
    ],
  );

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "family-member.created",
    entityType: "family-member",
    entityId: familyMember.id,
  });

  return getScopedHospitalStateForUser(user);
}

export async function updateFamilyMember(
  user: SafeUser,
  familyMemberId: string,
  draft: FamilyMemberDraft,
) {
  if (user.role !== "patient") {
    throw createHttpError(403, "You do not have access to manage family members.");
  }

  const validation = validateFamilyMemberDraft(draft);
  if (!validation.isValid) {
    throw createHttpError(400, "Please review the family member details provided.", {
      errors: validation.errors,
    });
  }

  const state = await loadHospitalState();
  const familyMember = getFamilyMemberById(state, familyMemberId);
  if (!familyMember || familyMember.primaryPatientUserId !== user.id) {
    throw createHttpError(404, "Family member not found.");
  }

  await query(
    `update family_members
     set full_name = $3,
         relationship = $4,
         date_of_birth = $5,
         gender = $6,
         blood_group = $7,
         phone_number = $8,
         emergency_contact_name = $9,
         emergency_contact_phone = $10,
         allergies = $11,
         medical_conditions = $12,
         preferred_language = $13,
         updated_at = $14
     where id = $1 and organization_id = $2`,
    [
      familyMemberId,
      user.organizationId,
      draft.fullName.trim(),
      draft.relationship.trim(),
      draft.dateOfBirth?.trim() || null,
      draft.gender?.trim() || null,
      draft.bloodGroup?.trim() || null,
      draft.phoneNumber?.trim() || null,
      draft.emergencyContactName?.trim() || null,
      draft.emergencyContactPhone?.trim() || null,
      draft.allergies?.trim() || null,
      draft.medicalConditions?.trim() || null,
      draft.preferredLanguage?.trim() || null,
      new Date().toISOString(),
    ],
  );

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "family-member.updated",
    entityType: "family-member",
    entityId: familyMemberId,
  });

  return getScopedHospitalStateForUser(user);
}

export async function unlinkFamilyMember(user: SafeUser, familyMemberId: string) {
  if (user.role !== "patient") {
    throw createHttpError(403, "You do not have access to manage family members.");
  }

  const state = await loadHospitalState();
  const familyMember = getFamilyMemberById(state, familyMemberId);
  if (!familyMember || familyMember.primaryPatientUserId !== user.id) {
    throw createHttpError(404, "Family member not found.");
  }

  const hasDependencies =
    state.appointments.some((appointment) => appointment.familyMemberId === familyMemberId) ||
    state.labRequests.some((request) => request.familyMemberId === familyMemberId) ||
    state.medicalRecords.some((record) => record.familyMemberId === familyMemberId) ||
    state.prescriptions.some((prescription) => prescription.familyMemberId === familyMemberId) ||
    state.labReports.some((report) => report.familyMemberId === familyMemberId) ||
    state.invoices.some((invoice) => invoice.familyMemberId === familyMemberId);

  if (hasDependencies) {
    await query(
      `update family_members
       set status = 'Inactive',
           updated_at = $3
       where id = $1 and organization_id = $2`,
      [familyMemberId, user.organizationId, new Date().toISOString()],
    );
  } else {
    await query("delete from family_members where id = $1 and organization_id = $2", [
      familyMemberId,
      user.organizationId,
    ]);
  }

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: hasDependencies ? "family-member.deactivated" : "family-member.unlinked",
    entityType: "family-member",
    entityId: familyMemberId,
  });

  return getScopedHospitalStateForUser(user);
}

export async function createMedicalHistoryEntry(
  user: SafeUser,
  draft: MedicalHistoryEntryDraft,
) {
  if (!["patient", "doctor", "administrator"].includes(user.role)) {
    throw createHttpError(403, "You do not have access to update clinical history.");
  }

  const validation = validateMedicalHistoryDraft(user, draft);
  if (!validation.isValid) {
    throw createHttpError(400, "Please review the clinical history details provided.", {
      errors: validation.errors,
    });
  }

  const state = await loadHospitalState();
  const resolvedContext = resolveClinicalPatientContext(state, user, {
    patientId: draft.patientId,
    familyMemberId: draft.familyMemberId,
  });

  const entry: MedicalHistoryEntryRecord = {
    id: `HIST-${Date.now()}-${randomBytes(3).toString("hex")}`,
    organizationId: user.organizationId,
    patientUserId: resolvedContext.patientUserId,
    familyMemberId: resolvedContext.familyMember?.id,
    category: draft.category,
    title: draft.title.trim(),
    details: draft.details?.trim() || undefined,
    recordedDate: draft.recordedDate,
    createdByUserId: user.id,
    createdAt: new Date().toISOString(),
  };

  await query(
    `insert into medical_history_entries (
      id, organization_id, patient_user_id, family_member_id, category, title, details,
      recorded_date, created_by_user_id, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      entry.id,
      entry.organizationId,
      entry.patientUserId,
      entry.familyMemberId ?? null,
      entry.category,
      entry.title,
      entry.details ?? null,
      entry.recordedDate,
      entry.createdByUserId,
      entry.createdAt,
      null,
    ],
  );

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "medical-history.created",
    entityType: "medical-history",
    entityId: entry.id,
  });

  return getScopedHospitalStateForUser(user);
}

export async function createClinicalAttachment(
  user: SafeUser,
  draft: ClinicalAttachmentDraft,
) {
  if (!["patient", "doctor", "administrator"].includes(user.role)) {
    throw createHttpError(403, "You do not have access to upload clinical files.");
  }

  const validation = validateClinicalAttachmentDraft(draft);
  if (!validation.isValid) {
    throw createHttpError(400, "Please review the clinical file provided.", {
      errors: validation.errors,
    });
  }

  const state = await loadHospitalState();
  const resolvedContext = resolveClinicalPatientContext(state, user, {
    patientId: draft.patientId,
    familyMemberId: draft.familyMemberId,
  });
  const storedFile = await storeClinicalFileWithFallback({
    contentBase64: draft.contentBase64,
    fileName: draft.fileName,
    contentType: draft.contentType,
    folder: `medivanta/${user.organizationId}/clinical-attachments`,
  });

  const attachment: ClinicalAttachmentRecord = {
    id: `ATT-${Date.now()}-${randomBytes(3).toString("hex")}`,
    organizationId: user.organizationId,
    patientUserId: resolvedContext.patientUserId,
    familyMemberId: resolvedContext.familyMember?.id,
    medicalRecordId: draft.medicalRecordId?.trim() || undefined,
    label: draft.label.trim(),
    fileName: sanitizeAttachmentFileName(draft.fileName.trim()),
    contentType: draft.contentType,
    fileSize: draft.fileSize,
    contentBase64: storedFile ? undefined : draft.contentBase64,
    storageProvider: storedFile?.storageProvider,
    storageUrl: storedFile?.storageUrl,
    storagePublicId: storedFile?.storagePublicId,
    originalFileName: storedFile?.originalFileName,
    mimeType: storedFile?.mimeType,
    storageSize: storedFile?.storageSize,
    uploadedByUserId: user.id,
    uploadedByName: user.displayName,
    createdAt: new Date().toISOString(),
  };

  await query(
    `insert into clinical_attachments (
      id, organization_id, patient_user_id, family_member_id, medical_record_id, label, file_name,
      content_type, file_size, content_base64, uploaded_by_user_id, uploaded_by_name, created_at,
      storage_provider, storage_url, storage_public_id, original_filename, mime_type, storage_size
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [
      attachment.id,
      attachment.organizationId,
      attachment.patientUserId,
      attachment.familyMemberId ?? null,
      attachment.medicalRecordId ?? null,
      attachment.label,
      attachment.fileName,
      attachment.contentType,
      attachment.fileSize,
      attachment.contentBase64 ?? null,
      attachment.uploadedByUserId,
      attachment.uploadedByName,
      attachment.createdAt,
      attachment.storageProvider ?? null,
      attachment.storageUrl ?? null,
      attachment.storagePublicId ?? null,
      attachment.originalFileName ?? null,
      attachment.mimeType ?? null,
      attachment.storageSize ?? null,
    ],
  );

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "clinical-attachment.uploaded",
    entityType: "clinical-attachment",
    entityId: attachment.id,
  });

  return getScopedHospitalStateForUser(user);
}

async function resolveTelemedicineContext(user: SafeUser, appointmentId?: string, sessionId?: string) {
  const [state, users] = await Promise.all([loadHospitalState(), loadUsers()]);
  const appointment =
    appointmentId ? getAppointmentById(state, appointmentId) : state.appointments.find((item) => {
      const session = state.telemedicineSessions?.find((entry) => entry.id === sessionId);
      return session ? item.id === session.appointmentId : false;
    });

  if (!appointment) {
    throw createHttpError(404, "Consultation session not found.");
  }

  if (appointment.consultationMode !== "Online") {
    throw createHttpError(400, "This appointment is not scheduled as an online consultation.");
  }

  const patientUser =
    users.find((currentUser) => currentUser.id === appointment.patientId) ??
    users.find(
      (currentUser) =>
        currentUser.role === "patient" &&
        currentUser.organizationId === appointment.organizationId &&
        normalizePersonKey(currentUser.patientName ?? currentUser.displayName) ===
          normalizePersonKey(
            getFamilyMemberById(state, appointment.familyMemberId)?.primaryPatientUserId === currentUser.id
              ? currentUser.patientName ?? currentUser.displayName
              : appointment.patientName,
          ),
    );
  const doctorUser = users.find(
    (currentUser) =>
      currentUser.role === "doctor" &&
      currentUser.organizationId === appointment.organizationId &&
      currentUser.doctorId === appointment.doctorId,
  );

  if (!patientUser || !doctorUser) {
    throw createHttpError(400, "Consultation participants could not be resolved.");
  }

  const isAuthorized =
    (user.role === "patient" && patientUser.id === user.id) ||
    (user.role === "doctor" && doctorUser.id === user.id);

  if (!isAuthorized || user.organizationId !== appointment.organizationId) {
    throw createHttpError(403, "You do not have access to this workspace.");
  }

  const session =
    state.telemedicineSessions?.find((entry) => entry.appointmentId === appointment.id) ??
    null;

  return { state, users, appointment, patientUser, doctorUser, session };
}

export async function getTelemedicineSessionForAppointment(user: SafeUser, appointmentId: string) {
  const context = await resolveTelemedicineContext(user, appointmentId);
  const messages = context.session
    ? (
        await query(
          `select id, session_id, organization_id, sender_user_id, sender_name, message, created_at
           from telemedicine_messages
           where session_id = $1 and organization_id = $2
           order by created_at asc`,
          [context.session.id, context.appointment.organizationId],
        )
      ).rows.map(
        (row): TelemedicineMessageRecord => ({
          id: String(row.id),
          sessionId: String(row.session_id),
          organizationId: String(row.organization_id),
          senderUserId: String(row.sender_user_id),
          senderName: String(row.sender_name),
          message: String(row.message),
          createdAt: new Date(String(row.created_at)).toISOString(),
        }),
      )
    : [];

  return {
    appointment: context.appointment,
    session: context.session,
    messages,
  };
}

export async function joinTelemedicineSession(user: SafeUser, appointmentId: string) {
  const context = await resolveTelemedicineContext(user, appointmentId);
  const joinWindow = isTelemedicineJoinAvailable(context.appointment);

  if (!joinWindow.allowed) {
    throw createHttpError(
      400,
      joinWindow.message ?? "This consultation is not available yet.",
    );
  }

  let session = context.session;

  if (!session) {
    session = {
      id: `TM-${Date.now()}-${randomBytes(3).toString("hex")}`,
      organizationId: context.appointment.organizationId,
      appointmentId: context.appointment.id,
      patientUserId: context.patientUser.id,
      doctorUserId: context.doctorUser.id,
      familyMemberId: context.appointment.familyMemberId,
      status: "Scheduled",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await query(
      `insert into telemedicine_sessions (
        id, organization_id, appointment_id, patient_user_id, doctor_user_id, family_member_id,
        status, started_at, ended_at, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        session.id,
        session.organizationId,
        session.appointmentId,
        session.patientUserId,
        session.doctorUserId,
        session.familyMemberId ?? null,
        session.status,
        null,
        null,
        session.createdAt,
        session.updatedAt,
      ],
    );
  }

  return getTelemedicineSessionForAppointment(user, appointmentId);
}

export async function getTelemedicineMessages(user: SafeUser, sessionId: string) {
  const context = await resolveTelemedicineContext(user, undefined, sessionId);
  if (!context.session) {
    throw createHttpError(404, "Consultation session not found.");
  }

  const result = await query(
    `select id, session_id, organization_id, sender_user_id, sender_name, message, created_at
     from telemedicine_messages
     where session_id = $1 and organization_id = $2
     order by created_at asc`,
    [context.session.id, context.session.organizationId],
  );

  return {
    messages: result.rows.map(
      (row): TelemedicineMessageRecord => ({
        id: String(row.id),
        sessionId: String(row.session_id),
        organizationId: String(row.organization_id),
        senderUserId: String(row.sender_user_id),
        senderName: String(row.sender_name),
        message: String(row.message),
        createdAt: new Date(String(row.created_at)).toISOString(),
      }),
    ),
  };
}

export async function sendTelemedicineMessage(user: SafeUser, sessionId: string, message: string) {
  const context = await resolveTelemedicineContext(user, undefined, sessionId);
  if (!context.session) {
    throw createHttpError(404, "Consultation session not found.");
  }

  if (message.trim().length < 1) {
    throw createHttpError(400, "Please enter a message.");
  }

  const entry: TelemedicineMessageRecord = {
    id: `TMSG-${Date.now()}-${randomBytes(3).toString("hex")}`,
    sessionId: context.session.id,
    organizationId: context.session.organizationId,
    senderUserId: user.id,
    senderName: user.displayName,
    message: message.trim(),
    createdAt: new Date().toISOString(),
  };

  await query(
    `insert into telemedicine_messages (
      id, session_id, organization_id, sender_user_id, sender_name, message, created_at
    ) values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.id,
      entry.sessionId,
      entry.organizationId,
      entry.senderUserId,
      entry.senderName,
      entry.message,
      entry.createdAt,
    ],
  );

  return { message: entry };
}

export async function sendTelemedicineSignal(
  user: SafeUser,
  sessionId: string,
  draft: { recipientUserId: string; signalType: string; payload: string },
) {
  const context = await resolveTelemedicineContext(user, undefined, sessionId);
  if (!context.session) {
    throw createHttpError(404, "Consultation session not found.");
  }

  const allowedRecipients = [context.patientUser.id, context.doctorUser.id];
  if (!allowedRecipients.includes(draft.recipientUserId) || draft.recipientUserId === user.id) {
    throw createHttpError(400, "Please select a valid consultation participant.");
  }

  const id = `TSIG-${Date.now()}-${randomBytes(3).toString("hex")}`;
  const createdAt = new Date().toISOString();

  await query(
    `insert into telemedicine_signals (
      id, session_id, organization_id, sender_user_id, recipient_user_id, signal_type,
      payload_json, created_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      context.session.id,
      context.session.organizationId,
      user.id,
      draft.recipientUserId,
      draft.signalType,
      draft.payload,
      createdAt,
    ],
  );

  return {
    signal: {
      id,
      recipientUserId: draft.recipientUserId,
      signalType: draft.signalType,
      payload: draft.payload,
      createdAt,
    },
  };
}

export async function getConversationSignals(
  user: SafeUser,
  sessionId: string,
  since?: string,
) {
  const context = await resolveTelemedicineContext(user, undefined, sessionId);
  if (!context.session) {
    throw createHttpError(404, "Consultation session not found.");
  }

  const result = await query(
    `select id, sender_user_id, recipient_user_id, signal_type, payload_json, created_at
     from telemedicine_signals
     where session_id = $1
       and organization_id = $2
       and recipient_user_id = $3
       and ($4::timestamptz is null or created_at > $4::timestamptz)
     order by created_at asc`,
    [context.session.id, context.session.organizationId, user.id, since ?? null],
  );

  return {
    signals: result.rows.map((row) => ({
      id: String(row.id),
      senderUserId: String(row.sender_user_id),
      recipientUserId: String(row.recipient_user_id),
      signalType: String(row.signal_type),
      payload: String(row.payload_json),
      createdAt: new Date(String(row.created_at)).toISOString(),
    })),
  };
}

export async function setTelemedicineSessionStatus(
  user: SafeUser,
  sessionId: string,
  status: TelemedicineSessionStatus,
) {
  const context = await resolveTelemedicineContext(user, undefined, sessionId);
  if (!context.session) {
    throw createHttpError(404, "Consultation session not found.");
  }

  if (status === "Ended" && user.role !== "doctor") {
    throw createHttpError(403, "Only the assigned doctor can complete this consultation.");
  }

  const startedAt =
    status === "Live" ? context.session.startedAt ?? new Date().toISOString() : context.session.startedAt;
  const endedAt = status === "Ended" ? new Date().toISOString() : context.session.endedAt;
  const updatedAt = new Date().toISOString();

  await query(
    `update telemedicine_sessions
     set status = $3,
         started_at = $4,
         ended_at = $5,
         updated_at = $6
     where id = $1 and organization_id = $2`,
    [sessionId, context.session.organizationId, status, startedAt ?? null, endedAt ?? null, updatedAt],
  );

  let updatedAppointment = context.appointment;
  if (
    status === "Live" &&
    (context.appointment.status === "Scheduled" || context.appointment.status === "Checked in")
  ) {
    updatedAppointment = { ...context.appointment, status: "In consultation" };
    await updateAppointmentStatusById({
      appointmentId: context.appointment.id,
      organizationId: context.appointment.organizationId,
      status: "In consultation",
    });
    await updateQueueStatusesByAppointment({
      organizationId: context.appointment.organizationId,
      appointmentId: context.appointment.id,
      status: "In consultation",
      updatedAt,
      excludeCompleted: true,
    });
  }

  if (status === "Ended" && context.appointment.status !== "Completed") {
    const appointmentResult = await setAppointmentStatus(user, context.appointment.id, "Completed");
    updatedAppointment = appointmentResult.patch.appointments[0] ?? {
      ...context.appointment,
      status: "Completed",
    };
  }

  await writeAuditLog({
    organizationId: context.session.organizationId,
    actorUserId: user.id,
    action: `telemedicine.${status.toLowerCase()}`,
    entityType: "telemedicine-session",
    entityId: sessionId,
  });

  return {
    appointment: updatedAppointment,
    session: {
      ...context.session,
      status,
      startedAt,
      endedAt,
      updatedAt,
    },
  };
}

export async function searchHospitalWorkspace(user: SafeUser, rawQuery: string) {
  const queryText = rawQuery.trim().toLowerCase();
  if (!queryText) {
    return { groups: [] };
  }

  const [state, users] = await Promise.all([reconcileNoShowAppointments(await loadHospitalState()), loadUsers()]);
  const scopedState = withScopedState(user.role, user, state);
  const scopedPatientUsers = users.filter(
    (currentUser) =>
      currentUser.role === "patient" &&
      currentUser.organizationId === user.organizationId &&
      (user.role !== "patient" || currentUser.id === user.id),
  );

  const routeByType: Record<string, string> = {
    patient:
      user.role === "doctor"
        ? "/dashboard/doctor/patients"
        : user.role === "patient"
          ? "/dashboard/patient/profile"
          : user.role === "receptionist"
            ? "/dashboard/appointments"
            : "/dashboard/admin/users",
    doctor:
      user.role === "patient"
        ? "/dashboard/patient/appointments"
        : user.role === "doctor"
          ? "/dashboard/doctor/schedule"
          : "/dashboard/doctors",
    department: user.role === "patient" ? "/dashboard/patient/appointments" : "/dashboard/departments",
    appointment:
      user.role === "doctor"
        ? "/dashboard/doctor/appointments"
        : user.role === "patient"
          ? "/dashboard/patient/appointments"
          : "/dashboard/appointments",
    "medical-record":
      user.role === "doctor" ? "/dashboard/doctor/records" : "/dashboard/patient/records",
    prescription:
      user.role === "doctor"
        ? "/dashboard/doctor/prescriptions"
        : user.role === "patient"
          ? "/dashboard/patient/prescriptions"
          : user.role === "pharmacist"
            ? "/dashboard/pharmacy/prescriptions"
            : "/dashboard/doctor/history?tab=prescriptions",
    invoice: user.role === "patient" ? "/dashboard/patient/billing" : "/dashboard/admin/billing",
    medicine: user.role === "pharmacist" ? "/dashboard/pharmacy/inventory" : "/dashboard/admin/billing",
    laboratory:
      user.role === "patient"
        ? "/dashboard/patient/lab-tests"
        : "/dashboard/laboratory/requests",
  };
  const getDepartmentName = (departmentId: string) =>
    state.departments.find((department) => department.id === departmentId)?.name ?? departmentId;
  const doctorProfilesByDoctorId = new Map(
    users
      .filter(
        (currentUser) =>
          currentUser.role === "doctor" && currentUser.organizationId === user.organizationId,
      )
      .map((currentUser) => [currentUser.doctorId ?? "", currentUser] as const),
  );
  const searchableDoctors =
    user.role === "doctor" || user.role === "patient"
      ? state.doctors.filter((doctor) => doctor.organizationId === user.organizationId)
      : scopedState.doctors;
  const searchableDepartments =
    user.role === "doctor" || user.role === "patient"
      ? state.departments.filter((department) => department.organizationId === user.organizationId)
      : scopedState.departments;

  const groups = [
    {
      title: "Patients",
      items: scopedPatientUsers
        .filter((currentUser) =>
          [currentUser.displayName, currentUser.patientName ?? "", currentUser.email]
            .join(" ")
            .toLowerCase()
            .includes(queryText),
        )
        .map((currentUser) => ({
          id: currentUser.id,
          heading: currentUser.patientName ?? currentUser.displayName,
          details: `${currentUser.id} · ${currentUser.email}`,
          href: routeByType.patient,
        })),
    },
    {
      title: "Doctors",
      items: searchableDoctors
        .filter((doctor) =>
          [
            doctor.name,
            doctor.specialization,
            doctor.availability,
            doctor.shiftLabel,
            getDepartmentName(doctor.departmentId),
            doctorProfilesByDoctorId.get(doctor.id)?.qualifications ?? "",
            doctorProfilesByDoctorId.get(doctor.id)?.experience ?? "",
            doctorProfilesByDoctorId.get(doctor.id)?.languages ?? "",
            doctorProfilesByDoctorId.get(doctor.id)?.consultationFee ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(queryText),
        )
        .map((doctor) => {
          const profile = doctorProfilesByDoctorId.get(doctor.id);

          return {
            id: doctor.id,
            heading: doctor.name,
            details: [
              doctor.specialization,
              getDepartmentName(doctor.departmentId),
              profile?.qualifications?.trim() || undefined,
              profile?.experience?.trim() || undefined,
              profile?.languages?.trim() || undefined,
              profile?.consultationFee?.trim()
                ? `Fee ${profile.consultationFee.trim()}`
                : undefined,
              doctor.availability,
            ]
              .filter(Boolean)
              .join(" · "),
            href: routeByType.doctor,
          };
        }),
    },
    {
      title: "Departments",
      items: searchableDepartments
        .filter((department) =>
          [department.name, department.code, department.description, department.location]
            .join(" ")
            .toLowerCase()
            .includes(queryText),
        )
        .map((department) => {
          const departmentDoctors = searchableDoctors.filter(
            (doctor) => doctor.departmentId === department.id,
          );
          const availableCount = departmentDoctors.filter(
            (doctor) => doctor.status === "Available" || doctor.status === "Consulting",
          ).length;

          return {
            id: department.id,
            heading: department.name,
            details: `${department.code} · ${departmentDoctors.length} doctors · ${availableCount} available · ${department.location}`,
            href: routeByType.department,
          };
        }),
    },
    {
      title: "Appointments",
      items: scopedState.appointments
        .filter((appointment) =>
          [
            appointment.id,
            appointment.patientName,
            getDoctorById(scopedState, appointment.doctorId)?.name ?? "",
            appointment.reasonForAppointment,
            appointment.status,
            appointment.consultationMode ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(queryText),
        )
        .map((appointment) => ({
          id: appointment.id,
          heading: `${appointment.patientName} · ${appointment.id}`,
          details: `${appointment.appointmentDate} ${appointment.appointmentTime} · ${getDoctorById(scopedState, appointment.doctorId)?.name ?? "Doctor pending"} · ${appointment.status} · ${appointment.consultationMode ?? "In Person"}`,
          href: routeByType.appointment,
        })),
    },
    ...(user.role === "administrator"
      ? [
          {
            title: "Staff",
            items: users
              .filter(
                (currentUser) =>
                  currentUser.organizationId === user.organizationId &&
                  currentUser.role !== "patient" &&
                  [
                    currentUser.displayName,
                    currentUser.email,
                    currentUser.role,
                    currentUser.departmentId ?? "",
                    currentUser.designation ?? "",
                  ]
                    .join(" ")
                    .toLowerCase()
                    .includes(queryText),
              )
              .map((currentUser) => ({
                id: currentUser.id,
                heading: currentUser.displayName,
                details: `${currentUser.email} · ${currentUser.role} · ${currentUser.staffStatus?.trim() || "Active"}`,
                href: "/dashboard/admin/users",
              })),
          },
        ]
      : []),
    {
      title: "Medical Records",
      items: scopedState.medicalRecords
        .filter((record) =>
          [record.patientName, record.diagnosis, record.visitDate, record.id]
            .join(" ")
            .toLowerCase()
            .includes(queryText),
        )
        .map((record) => ({
          id: record.id,
          heading: `${record.patientName} · ${record.diagnosis}`,
          details: `${record.visitDate} · ${record.doctorName}${record.familyMemberId ? ` · ${getFamilyMemberById(scopedState, record.familyMemberId)?.fullName ?? "Family member"}` : ""}`,
          href: routeByType["medical-record"],
        })),
    },
    {
      title: "Prescriptions",
      items: scopedState.prescriptions
        .filter((prescription) =>
          [prescription.patientName, prescription.doctorName, prescription.id]
            .join(" ")
            .toLowerCase()
            .includes(queryText),
        )
        .map((prescription) => ({
          id: prescription.id,
          heading: `${prescription.patientName} · ${prescription.id}`,
          details: `${prescription.doctorName} · ${prescription.status}${prescription.followUpDate ? ` · Follow-up ${prescription.followUpDate}` : ""}`,
          href: routeByType.prescription,
        })),
    },
    {
      title: "Medicines",
      items: scopedState.medicineCatalog
        .filter((medicine) =>
          [medicine.name, medicine.genericName ?? "", medicine.strength ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(queryText),
        )
        .map((medicine) => ({
          id: medicine.id,
          heading: medicine.name,
          details: `${medicine.strength ?? medicine.unit} · ${medicine.active ? "Available" : "Inactive"}`,
          href: routeByType.medicine,
        })),
    },
    {
      title: "Invoices",
      items: scopedState.invoices
        .filter((invoice) =>
          [invoice.invoiceNumber, invoice.patientName, invoice.paymentStatus]
            .join(" ")
            .toLowerCase()
            .includes(queryText),
        )
        .map((invoice) => ({
          id: invoice.id,
          heading: `${invoice.invoiceNumber} · ${invoice.patientName}`,
          details: `${invoice.paymentStatus} · INR ${(invoice.totalCents / 100).toFixed(2)}`,
          href: routeByType.invoice,
        })),
    },
    {
      title: "Laboratory",
      items: scopedState.labRequests
        .filter((request) =>
          [request.patientName, request.testName, request.id, request.status]
            .join(" ")
            .toLowerCase()
            .includes(queryText),
        )
        .map((request) => ({
          id: request.id,
          heading: `${request.testName} · ${request.patientName}`,
          details: `${request.requestedDate} ${request.requestedTime} · ${request.status}${request.familyMemberId ? ` · ${getFamilyMemberById(scopedState, request.familyMemberId)?.fullName ?? "Family member"}` : ""}`,
          href: routeByType.laboratory,
        })),
    },
  ].filter((group) => group.items.length > 0);

  return { groups };
}

function formatSearchRoleLabel(role: UserRole) {
  switch (role) {
    case "administrator":
      return "Administrator";
    case "doctor":
      return "Doctor";
    case "laboratory":
      return "Laboratory Staff";
    case "patient":
      return "Patient";
    case "pharmacist":
      return "Pharmacist";
    case "receptionist":
      return "Receptionist";
  }
}

export async function searchHospitalWorkspaceScoped(user: SafeUser, rawQuery: string) {
  const normalized = rawQuery.trim().toLowerCase();
  if (!normalized) {
    return { groups: [] };
  }

  const [state, users] = await Promise.all([
    reconcileNoShowAppointments(await loadHospitalState()),
    loadUsers(),
  ]);
  const scopedState = withScopedState(user.role, user, state);
  const doctorProfilesByDoctorId = new Map(
    users
      .filter(
        (currentUser) =>
          currentUser.role === "doctor" && currentUser.organizationId === user.organizationId,
      )
      .map((currentUser) => [currentUser.doctorId ?? "", currentUser] as const),
  );
  const groups: Array<{
    title: string;
    items: Array<{
      id: string;
      type: string;
      heading: string;
      details: string;
      actionHref?: string;
      actionLabel?: string;
      detail: {
        title?: string;
        fields: Array<{ label: string; value: string }>;
        notes?: string[];
      };
    }>;
  }> = [];

  const rank = (values: string[], options?: { exactFirst?: string[]; startsFirst?: string[] }) => {
    const normalizedValues = values.map((value) => value.toLowerCase());
    const exactFirst = (options?.exactFirst ?? []).map((value) => value.toLowerCase());
    const startsFirst = (options?.startsFirst ?? []).map((value) => value.toLowerCase());

    if (exactFirst.some((value) => value === normalized)) {
      return 1;
    }
    if (normalizedValues.some((value) => value === normalized)) {
      return 2;
    }
    if (startsFirst.some((value) => value.startsWith(normalized))) {
      return 3;
    }
    if (normalizedValues.some((value) => value.startsWith(normalized))) {
      return 4;
    }
    if (normalizedValues.some((value) => value.includes(normalized))) {
      return 5;
    }
    return 99;
  };

  if (user.role !== "patient") {
    const patientItems = users
      .filter((currentUser) => {
        if (currentUser.role !== "patient" || currentUser.organizationId !== user.organizationId) {
          return false;
        }

        if (user.role === "administrator" || user.role === "receptionist") {
          return true;
        }

        if (user.role === "doctor") {
          return (
            currentUser.assignedDoctorId === user.doctorId ||
            scopedState.appointments.some((appointment) => appointment.patientId === currentUser.id)
          );
        }

        return false;
      })
      .map((currentUser) => {
        const patientName = currentUser.patientName ?? currentUser.displayName;
        return {
          currentUser,
          patientName,
          score: rank(
            [
              patientName,
              ...(user.role === "administrator" || user.role === "receptionist"
                ? [currentUser.email, currentUser.phoneNumber ?? ""]
                : []),
            ],
            { exactFirst: [patientName], startsFirst: [patientName] },
          ),
        };
      })
      .filter((entry) => entry.score < 99)
      .sort((left, right) => left.score - right.score || left.patientName.localeCompare(right.patientName))
      .slice(0, 8)
      .map(({ currentUser, patientName }) => ({
        id: currentUser.id,
        type: "patient",
        heading: patientName,
        details: [currentUser.id, currentUser.phoneNumber ?? currentUser.email, currentUser.staffStatus ?? "Active"]
          .filter(Boolean)
          .join(" - "),
        actionHref:
          user.role === "doctor"
            ? "/dashboard/doctor/patients"
            : user.role === "receptionist"
              ? "/dashboard/appointments"
              : "/dashboard/admin/users",
        actionLabel: "Open workspace",
        detail: {
          title: "Patient summary",
          fields: [
            { label: "Name", value: patientName },
            { label: "Patient ID", value: currentUser.id },
            { label: "Contact", value: currentUser.phoneNumber ?? currentUser.email },
            { label: "Gender", value: currentUser.gender ?? "Not provided" },
            { label: "Status", value: currentUser.staffStatus ?? "Active" },
          ],
        },
      }));

    if (patientItems.length > 0) {
      groups.push({ title: "Patients", items: patientItems });
    }
  }

  const doctorItems = state.doctors
    .filter((doctor) => doctor.organizationId === user.organizationId)
    .map((doctor) => {
      const departmentName =
        state.departments.find((department) => department.id === doctor.departmentId)?.name ?? doctor.departmentId;
      const profile = doctorProfilesByDoctorId.get(doctor.id);

      return {
        doctor,
        departmentName,
        profile,
        score: rank(
          [
            doctor.name,
            doctor.specialization,
            departmentName,
            profile?.qualifications ?? "",
          ],
          { exactFirst: [doctor.specialization, departmentName], startsFirst: [doctor.specialization, departmentName] },
        ),
      };
    })
    .filter((entry) => entry.score < 99)
    .sort((left, right) => left.score - right.score || left.doctor.name.localeCompare(right.doctor.name))
    .slice(0, 8)
    .map(({ departmentName, doctor, profile }) => ({
      id: doctor.id,
      type: "doctor",
      heading: doctor.name,
      details: [doctor.specialization, departmentName, doctor.availability].filter(Boolean).join(" - "),
      actionHref:
        user.role === "patient"
          ? "/dashboard/patient/appointments"
          : user.role === "doctor"
            ? "/dashboard/doctor/schedule"
            : "/dashboard/doctors",
      actionLabel:
        user.role === "patient" || user.role === "receptionist" ? "Book appointment" : "Open workspace",
      detail: {
        title: "Doctor details",
        fields: [
          { label: "Name", value: doctor.name },
          { label: "Doctor ID", value: doctor.id },
          { label: "Department", value: departmentName },
          { label: "Specialization", value: doctor.specialization },
          { label: "Qualifications", value: profile?.qualifications?.trim() || "Not provided" },
          { label: "Experience", value: profile?.experience?.trim() || "Not provided" },
          { label: "Languages", value: profile?.languages?.trim() || "Not provided" },
          { label: "Consultation fee", value: profile?.consultationFee?.trim() || "Not provided" },
          { label: "Current availability", value: doctor.availability || doctor.status },
          { label: "Available timings", value: profile?.availableTimings?.trim() || doctor.shiftLabel },
        ],
      },
    }));

  if (doctorItems.length > 0) {
    groups.push({ title: "Doctors", items: doctorItems });
  }

  const departmentItems = state.departments
    .filter((department) => department.organizationId === user.organizationId)
    .map((department) => ({
      department,
      score: rank(
        [department.name, department.code, department.description, department.location],
        { exactFirst: [department.code, department.name], startsFirst: [department.code, department.name] },
      ),
    }))
    .filter((entry) => entry.score < 99)
    .sort((left, right) => left.score - right.score || left.department.name.localeCompare(right.department.name))
    .slice(0, 8)
    .map(({ department }) => {
      const departmentDoctors = state.doctors.filter((doctor) => doctor.departmentId === department.id);
      const availableDoctors = departmentDoctors.filter((doctor) =>
        ["Available", "Consulting", "Emergency duty"].includes(doctor.status),
      );

      return {
        id: department.id,
        type: "department",
        heading: department.name,
        details: [
          department.code,
          `${departmentDoctors.length} doctors`,
          `${availableDoctors.length} available`,
          department.location,
        ].join(" - "),
        actionHref:
          user.role === "patient" ? "/dashboard/patient/appointments" : "/dashboard/departments",
        actionLabel: "Open workspace",
        detail: {
          title: "Department details",
          fields: [
            { label: "Department", value: department.name },
            { label: "Doctors", value: String(departmentDoctors.length) },
            { label: "Available / On duty", value: String(availableDoctors.length) },
            { label: "Location", value: department.location },
          ],
          notes: departmentDoctors.slice(0, 5).map((doctor) => `${doctor.name} - ${doctor.specialization} - ${doctor.availability}`),
        },
      };
    });

  if (departmentItems.length > 0) {
    groups.push({ title: "Departments", items: departmentItems });
  }

  const appointmentItems = scopedState.appointments
    .map((appointment) => {
      const doctorName = getDoctorById(state, appointment.doctorId)?.name ?? "Doctor pending";
      const departmentName =
        state.departments.find((department) => department.id === appointment.departmentId)?.name ??
        appointment.departmentId;

      return {
        appointment,
        doctorName,
        departmentName,
        score: rank(
          [appointment.id, appointment.patientName, doctorName, appointment.reasonForAppointment],
          { exactFirst: [appointment.id], startsFirst: [appointment.id, appointment.patientName, doctorName] },
        ),
      };
    })
    .filter((entry) => entry.score < 99)
    .sort(
      (left, right) =>
        left.score - right.score ||
        `${right.appointment.appointmentDate}T${right.appointment.appointmentTime}`.localeCompare(
          `${left.appointment.appointmentDate}T${left.appointment.appointmentTime}`,
        ),
    )
    .slice(0, 8)
    .map(({ appointment, departmentName, doctorName }) => ({
      id: appointment.id,
      type: "appointment",
      heading: `${appointment.patientName} - ${appointment.id}`,
      details: `${appointment.appointmentDate} ${appointment.appointmentTime} - ${doctorName} - ${appointment.status}`,
      actionHref:
        user.role === "doctor"
          ? "/dashboard/doctor/appointments"
          : user.role === "patient"
            ? "/dashboard/patient/appointments"
            : "/dashboard/appointments",
      actionLabel: "Open workspace",
      detail: {
        title: "Appointment details",
        fields: [
          { label: "Appointment ID", value: appointment.id },
          { label: "Patient", value: appointment.patientName },
          { label: "Doctor", value: doctorName },
          { label: "Department", value: departmentName },
          { label: "Date / time", value: `${appointment.appointmentDate} ${appointment.appointmentTime}` },
          { label: "Consultation mode", value: appointment.consultationMode ?? "In Person" },
          { label: "Reason", value: appointment.reasonForAppointment || "Not provided" },
          { label: "Status", value: appointment.status },
        ],
      },
    }));

  if (appointmentItems.length > 0) {
    groups.push({ title: "Appointments", items: appointmentItems });
  }

  if (user.role === "administrator") {
    const staffItems = users
      .filter(
        (currentUser) =>
          currentUser.organizationId === user.organizationId && currentUser.role !== "patient",
      )
      .map((currentUser) => ({
        currentUser,
        score: rank(
          [
            currentUser.displayName,
            currentUser.email,
            currentUser.role,
            currentUser.departmentId ?? "",
            currentUser.designation ?? "",
          ],
          { exactFirst: [currentUser.displayName], startsFirst: [currentUser.displayName] },
        ),
      }))
      .filter((entry) => entry.score < 99)
      .sort((left, right) => left.score - right.score || left.currentUser.displayName.localeCompare(right.currentUser.displayName))
      .slice(0, 8)
      .map(({ currentUser }) => ({
        id: currentUser.id,
        type: "staff",
        heading: currentUser.displayName,
        details: [currentUser.email, formatSearchRoleLabel(currentUser.role), currentUser.staffStatus?.trim() || "Active"].join(" - "),
        actionHref: "/dashboard/admin/users",
        actionLabel: "Open staff management",
        detail: {
          title: "Staff details",
          fields: [
            { label: "Name", value: currentUser.displayName },
            { label: "Email", value: currentUser.email },
            { label: "Role", value: formatSearchRoleLabel(currentUser.role) },
            { label: "Department / Unit", value: currentUser.departmentId ?? currentUser.designation ?? "Not assigned" },
            { label: "Status", value: currentUser.staffStatus?.trim() || "Active" },
          ],
        },
      }));

    if (staffItems.length > 0) {
      groups.push({ title: "Staff", items: staffItems });
    }
  }

  const invoiceItems = scopedState.invoices
    .map((invoice) => ({
      invoice,
      score: rank(
        [invoice.invoiceNumber, invoice.patientName],
        { exactFirst: [invoice.invoiceNumber], startsFirst: [invoice.invoiceNumber, invoice.patientName] },
      ),
    }))
    .filter((entry) => entry.score < 99)
    .sort((left, right) => left.score - right.score || right.invoice.createdAt.localeCompare(left.invoice.createdAt))
    .slice(0, 8)
    .map(({ invoice }) => ({
      id: invoice.id,
      type: "invoice",
      heading: `${invoice.invoiceNumber} - ${invoice.patientName}`,
      details: `${invoice.paymentStatus} - INR ${(invoice.totalCents / 100).toFixed(2)}`,
      actionHref:
        user.role === "patient" ? "/dashboard/patient/billing" : "/dashboard/admin/billing",
      actionLabel: "Open billing",
      detail: {
        title: "Invoice details",
        fields: [
          { label: "Invoice number", value: invoice.invoiceNumber },
          { label: "Patient", value: invoice.patientName },
          { label: "Status", value: invoice.paymentStatus },
          { label: "Total", value: `INR ${(invoice.totalCents / 100).toFixed(2)}` },
          { label: "Amount due", value: `INR ${(invoice.amountDueCents / 100).toFixed(2)}` },
        ],
      },
    }));

  if (invoiceItems.length > 0) {
    groups.push({ title: "Invoices", items: invoiceItems });
  }

  if (user.role === "administrator" || user.role === "doctor" || user.role === "pharmacist") {
    const medicineItems = scopedState.inventoryItems
      .map((item) => ({
        item,
        score: rank(
          [item.medicineName, item.genericName ?? "", item.batchNumber, item.unit],
          { exactFirst: [item.medicineName, item.genericName ?? ""], startsFirst: [item.medicineName, item.genericName ?? ""] },
        ),
      }))
      .filter((entry) => entry.score < 99)
      .sort((left, right) => left.score - right.score || left.item.medicineName.localeCompare(right.item.medicineName))
      .slice(0, 8)
      .map(({ item }) => ({
        id: item.id,
        type: "medicine",
        heading: item.medicineName,
        details: [
          item.unit,
          `${item.quantityInStock} available`,
          `INR ${(item.unitPriceCents / 100).toFixed(2)} / ${item.unit}`,
        ].join(" - "),
        actionHref:
          user.role === "pharmacist" ? "/dashboard/pharmacy/inventory" : "/dashboard/admin/billing",
        actionLabel: user.role === "pharmacist" ? "Open inventory" : "Open workspace",
        detail: {
          title: "Medicine details",
          fields: [
            { label: "Medicine", value: item.medicineName },
            { label: "Generic name", value: item.genericName ?? "Not provided" },
            { label: "Strength / form", value: item.unit },
            { label: "Current available stock", value: `${item.quantityInStock} ${item.unit}` },
            { label: "Unit price", value: `INR ${(item.unitPriceCents / 100).toFixed(2)} / ${item.unit}` },
            { label: "Batch number", value: item.batchNumber },
            { label: "Nearest expiry", value: item.expiryDate },
          ],
        },
      }));

    if (medicineItems.length > 0) {
      groups.push({ title: "Medicines", items: medicineItems });
    }
  }

  return { groups };
}
