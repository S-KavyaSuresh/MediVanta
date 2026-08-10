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
  MedicalRecordDraft,
  MedicalRecordRecord,
  LabReportDraft,
  LabReportRecord,
  LabSlotLoadRecord,
  LabRequestDraft,
  LabRequestRecord,
  PrescriptionDraft,
  PrescriptionRecord,
  PrescriptionStatus,
  QueueEntryRecord,
  QueueStatus,
  SafeUser,
  UserRole,
  UserRecord,
} from "../domain/types.js";
import { hashPassword } from "../auth/password.js";
import { loadHospitalState, loadUsers, saveHospitalState, saveUsers } from "./seed-service.js";
import { DEMO_ACCOUNT_PASSWORD } from "./demo-data.js";
import { getCurrentLocalDateIso } from "../utils/date.js";

const PROFILE_ONLY_EMAIL_DOMAIN = "profiles.medivanta.local";

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

function createProfileOnlyEmail(fullName: string) {
  return `${normalizePersonKey(fullName).replace(/[^a-z0-9]+/g, ".")}.${randomBytes(3).toString("hex")}@${PROFILE_ONLY_EMAIL_DOMAIN}`;
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
  };
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

function createMedicalRecordId(state: HospitalState) {
  const nextNumber =
    state.medicalRecords.reduce((max, record) => {
      const parsed = Number(record.id.replace(/\D/g, ""));
      return Number.isNaN(parsed) ? max : Math.max(max, parsed);
    }, 1000) + 1;

  return `MR-${nextNumber}`;
}

function createPrescriptionId(state: HospitalState) {
  const nextNumber =
    state.prescriptions.reduce((max, prescription) => {
      const parsed = Number(prescription.id.replace(/\D/g, ""));
      return Number.isNaN(parsed) ? max : Math.max(max, parsed);
    }, 2000) + 1;

  return `RX-${nextNumber}`;
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
    if (draft.attachment.contentType !== "application/pdf") {
      errors.attachment = "Only PDF report files are supported.";
    }

    if (draft.attachment.fileSize > 2 * 1024 * 1024) {
      errors.attachment = "PDF reports must be 2 MB or smaller.";
    }

    if (!draft.attachment.contentBase64.trim()) {
      errors.attachment = "The uploaded PDF file could not be processed.";
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

  if (draft.diagnosis.trim().length < 3) {
    errors.diagnosis = "Enter a clear diagnosis.";
  }

  if (draft.clinicalNotes.trim().length < 12) {
    errors.clinicalNotes = "Enter clinical notes with enough detail for the record.";
  }

  if (draft.treatmentAdvice.trim().length < 6) {
    errors.treatmentAdvice = "Enter the treatment or advice shared with the patient.";
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
    if (medicine.medicineName.trim().length < 2) {
      errors[`medicines.${index}.medicineName`] = "Enter the medicine name.";
    }

    if (medicine.dosage.trim().length < 2) {
      errors[`medicines.${index}.dosage`] = "Enter the dosage.";
    }

    if (medicine.frequency.trim().length < 2) {
      errors[`medicines.${index}.frequency`] = "Enter the frequency.";
    }

    if (medicine.duration.trim().length < 2) {
      errors[`medicines.${index}.duration`] = "Enter the duration.";
    }
  }

  if (draft.instructions.trim().length < 6) {
    errors.instructions = "Enter clear prescription instructions.";
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
    medicines: draft.medicines.map((medicine) => ({
      medicineName: medicine.medicineName.trim(),
      dosage: medicine.dosage.trim(),
      frequency: medicine.frequency.trim(),
      duration: medicine.duration.trim(),
    })),
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
  email?: string;
  phoneNumber: string;
  gender: string;
  dateOfBirth: string;
  bloodGroup: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  allergies: string;
  medicalConditions: string;
  preferredLanguage?: string;
};

type UserProfileDraft = {
  fullName: string;
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
  const normalizedEmail = draft.email?.trim().toLowerCase();
  const normalizedPhone = draft.phoneNumber.trim();

  if (draft.fullName.trim().length < 2) {
    errors.fullName = "Enter a full name with at least 2 characters.";
  }

  if (normalizedEmail && !normalizedEmail.includes("@")) {
    errors.email = "Enter a valid email address.";
  }

  if (
    normalizedEmail &&
    users.some(
      (user) =>
        user.organizationId === organizationId &&
        user.role === "patient" &&
        user.email.toLowerCase() === normalizedEmail,
    )
  ) {
    errors.email = "A patient profile already exists with that email address.";
  }

  if (normalizedPhone.length < 7) {
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

  if (draft.address.trim().length < 5) {
    errors.address = "Enter a valid address.";
  }

  if (draft.emergencyContactName.trim().length < 2) {
    errors.emergencyContactName = "Enter an emergency contact name.";
  }

  if (draft.emergencyContactPhone.trim().length < 7) {
    errors.emergencyContactPhone = "Enter an emergency contact phone number.";
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
    "phoneNumber" | "address" | "emergencyContactName" | "emergencyContactPhone" | "preferredLanguage" | "qualifications" | "experience" | "languages" | "consultationFee" | "availableTimings" | "deskLabel" | "consultationMode"
  >> = [
    "phoneNumber",
    "address",
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
        field === "phoneNumber" ? 7 : field === "consultationFee" ? 2 : 3;
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
    };
  }

  const appointments = state.appointments.filter(
    (appointment) => appointment.patientName === user.patientName,
  );
  const appointmentIds = new Set(appointments.map((appointment) => appointment.id));

  return {
    ...state,
    appointments,
    medicalRecords: state.medicalRecords.filter(
      (record) =>
        record.patientId === user.id || record.patientName === getPatientDisplayName(user),
    ),
    prescriptions: state.prescriptions.filter(
      (prescription) =>
        prescription.patientId === user.id ||
        prescription.patientName === getPatientDisplayName(user),
    ),
    labTests: state.labTests.filter((test) => test.organizationId === user.organizationId),
    labRequests: getScopedLabRequestsForUser(user, state),
    labReports: state.labReports.filter((report) => report.patientId === user.id),
    queueEntries: state.queueEntries.filter(
      (entry) =>
        entry.patientName === user.patientName ||
        (entry.appointmentId ? appointmentIds.has(entry.appointmentId) : false),
    ),
  };
}

export async function getScopedHospitalStateForUser(user: SafeUser): Promise<HospitalStateResponse> {
  const state = await loadHospitalState();
  const scopedState = withScopedState(user.role, user, state);
  const organizationId = getUserOrganizationId(user, state);
  const sharedMeta = {
    appointmentSlotLoads: getAppointmentSlotLoads(state, organizationId),
    labSlotLoads: getLabSlotLoads(state, organizationId),
  };

  if (user.role === "doctor") {
    const users = await loadUsers();
    const scopedPatients = await getDoctorScopedPatients(state, user, users);
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

  const users = await loadUsers();
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

  const nextState: HospitalState = {
    ...state,
    labRequests: state.labRequests.map((currentRequest) =>
      currentRequest.id === labRequestId
        ? {
            ...currentRequest,
            status,
          }
        : currentRequest,
    ),
  };

  await saveHospitalState(nextState);
  return getScopedHospitalStateForUser(user);
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

  const nextState: HospitalState = {
    ...state,
    labRequests: state.labRequests.map((currentRequest) =>
      currentRequest.id === labRequestId
        ? {
            ...currentRequest,
            status: "Completed",
          }
        : currentRequest,
    ),
    labReports: [report, ...state.labReports],
  };

  await saveHospitalState(nextState);
  return getScopedHospitalStateForUser(user);
}

export async function createMedicalRecord(user: SafeUser, draft: MedicalRecordDraft) {
  if (user.role !== "doctor") {
    throw createHttpError(403, "You do not have access to create medical records.");
  }

  const [state, users] = await Promise.all([loadHospitalState(), loadUsers()]);
  const validation = validateMedicalRecordDraft(draft);

  if (!validation.isValid) {
    throw createHttpError(400, "Please review the medical record details provided.", {
      errors: validation.errors,
    });
  }

  const scopedPatients = await getDoctorScopedPatients(state, user, users);
  const patient = scopedPatients.get(draft.patientId);

  if (!patient) {
    throw createHttpError(403, "You can only create records for patients in your scope.");
  }

  if (draft.appointmentId && !patient.appointmentIds.has(draft.appointmentId)) {
    throw createHttpError(403, "That appointment is not available in your workspace.");
  }

  const appointment = draft.appointmentId
    ? getAppointmentById(state, draft.appointmentId)
    : undefined;

  if (appointment && appointment.doctorId !== user.doctorId) {
    throw createHttpError(403, "That appointment is not available in your workspace.");
  }

  const doctor = getDoctorById(state, user.doctorId ?? "");
  if (!doctor) {
    throw createHttpError(400, "This doctor account is missing a valid staff profile.");
  }

  const record: MedicalRecordRecord = {
    id: createMedicalRecordId(state),
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

  await saveHospitalState({
    ...state,
    medicalRecords: [record, ...state.medicalRecords],
  });

  return getScopedHospitalStateForUser(user);
}

export async function updateMedicalRecord(
  user: SafeUser,
  recordId: string,
  draft: Pick<MedicalRecordDraft, "diagnosis" | "clinicalNotes" | "treatmentAdvice">,
) {
  if (user.role !== "doctor") {
    throw createHttpError(403, "You do not have access to edit medical records.");
  }

  const state = await loadHospitalState();
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

  const nextState: HospitalState = {
    ...state,
    medicalRecords: state.medicalRecords.map((currentRecord) =>
      currentRecord.id === recordId
        ? {
            ...currentRecord,
            diagnosis: draft.diagnosis.trim(),
            clinicalNotes: draft.clinicalNotes.trim(),
            treatmentAdvice: draft.treatmentAdvice.trim(),
            updatedAt: new Date().toISOString(),
          }
        : currentRecord,
    ),
  };

  await saveHospitalState(nextState);
  return getScopedHospitalStateForUser(user);
}

export async function createPrescription(user: SafeUser, draft: PrescriptionDraft) {
  if (user.role !== "doctor") {
    throw createHttpError(403, "You do not have access to create prescriptions.");
  }

  const [state, users] = await Promise.all([loadHospitalState(), loadUsers()]);
  const normalizedDraft = normalizePrescriptionDraft(draft);
  const validation = validatePrescriptionDraft(normalizedDraft);

  if (!validation.isValid) {
    throw createHttpError(400, "Please review the prescription details provided.", {
      errors: validation.errors,
    });
  }

  const scopedPatients = await getDoctorScopedPatients(state, user, users);
  const patient = scopedPatients.get(normalizedDraft.patientId);

  if (!patient) {
    throw createHttpError(403, "You can only prescribe for patients in your scope.");
  }

  if (normalizedDraft.appointmentId && !patient.appointmentIds.has(normalizedDraft.appointmentId)) {
    throw createHttpError(403, "That appointment is not available in your workspace.");
  }

  const appointment = normalizedDraft.appointmentId
    ? getAppointmentById(state, normalizedDraft.appointmentId)
    : undefined;

  if (appointment && appointment.doctorId !== user.doctorId) {
    throw createHttpError(403, "That appointment is not available in your workspace.");
  }

  const doctor = getDoctorById(state, user.doctorId ?? "");
  if (!doctor) {
    throw createHttpError(400, "This doctor account is missing a valid staff profile.");
  }

  const prescription: PrescriptionRecord = {
    id: createPrescriptionId(state),
    patientId: patient.patientId,
    patientName: patient.patientName,
    doctorId: doctor.id,
    doctorName: doctor.name,
    hospitalId: doctor.organizationId,
    organizationId: doctor.organizationId,
    appointmentId: normalizedDraft.appointmentId,
    medicines: normalizedDraft.medicines,
    instructions: normalizedDraft.instructions,
    status: "Issued",
    createdAt: new Date().toISOString(),
  };

  await saveHospitalState({
    ...state,
    prescriptions: [prescription, ...state.prescriptions],
  });

  return getScopedHospitalStateForUser(user);
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

  const state = await loadHospitalState();
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

  await saveHospitalState({
    ...state,
    prescriptions: state.prescriptions.map((item) =>
      item.id === prescriptionId
        ? {
            ...item,
            status: "Dispensed",
            dispensedAt: new Date().toISOString(),
            dispensedBy: {
              id: user.id,
              name: user.displayName,
            },
          }
        : item,
    ),
  });

  return getScopedHospitalStateForUser(user);
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

  const state = await loadHospitalState();
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
    status: "Scheduled",
  };

  const nextState: HospitalState = {
    ...state,
    appointments: [appointment, ...state.appointments],
  };

  await saveHospitalState(nextState);
  return getScopedHospitalStateForUser(user);
}

export async function updateAppointment(
  user: SafeUser,
  appointmentId: string,
  draft: AppointmentDraft,
) {
  const state = await loadHospitalState();
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

  const nextState: HospitalState = {
    ...state,
    appointments: state.appointments.map((appointment) =>
      appointment.id === appointmentId
        ? {
            ...appointment,
            patientName: draft.patientName.trim(),
            doctorId: doctor.id,
            departmentId: doctor.departmentId,
            appointmentDate: draft.appointmentDate,
            appointmentTime: draft.appointmentTime,
          }
        : appointment,
    ),
    queueEntries: state.queueEntries.map((entry) =>
      entry.appointmentId === appointmentId
        ? {
            ...entry,
            patientName: draft.patientName.trim(),
            doctorId: doctor.id,
            departmentId: doctor.departmentId,
            createdAt: draft.appointmentTime,
            updatedAt: draft.appointmentTime,
          }
        : entry,
    ),
  };

  await saveHospitalState(nextState);
  return getScopedHospitalStateForUser(user);
}

export async function setAppointmentStatus(
  user: SafeUser,
  appointmentId: string,
  status: AppointmentStatus,
) {
  const state = await loadHospitalState();
  const appointment = getAppointmentById(state, appointmentId);

  if (!appointment) {
    throw createHttpError(404, "Appointment not found.");
  }

  const isPatientOwner =
    user.role === "patient" && appointment.patientName === (user.patientName ?? user.displayName);
  const isOperationsRole =
    user.role === "administrator" || user.role === "receptionist";

  if (!isPatientOwner && !isOperationsRole) {
    throw createHttpError(403, "You do not have access to update this appointment.");
  }

  if (isPatientOwner && status !== "Cancelled") {
    throw createHttpError(403, "Patients can only cancel their own scheduled appointments.");
  }

  if (isPatientOwner && appointment.status !== "Scheduled") {
    throw createHttpError(400, "This appointment can no longer be cancelled.");
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

  await saveHospitalState(nextState);
  return getScopedHospitalStateForUser(user);
}

export async function advanceQueue(
  user: SafeUser,
  queueEntryId: string,
  status: QueueStatus,
) {
  const state = await loadHospitalState();
  const queueEntry = state.queueEntries.find((entry) => entry.id === queueEntryId);

  if (!queueEntry) {
    throw createHttpError(404, "Queue entry not found.");
  }

  const allowed = getAllowedQueueStatuses(queueEntry.status);
  if (!allowed.includes(status)) {
    throw createHttpError(400, "That queue transition is not allowed.");
  }

  const nextQueueEntries = state.queueEntries.map((entry) =>
    entry.id === queueEntry.id
      ? { ...entry, status, updatedAt: queueEntry.updatedAt }
      : entry,
  );

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

  const nextState: HospitalState = {
    ...state,
    queueEntries: nextQueueEntries,
    appointments: nextAppointments,
  };

  await saveHospitalState(nextState);
  return getScopedHospitalStateForUser(user);
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

  await saveHospitalState(nextState);
  return getScopedHospitalStateForUser(user);
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

  await saveHospitalState({
    ...state,
    labRequests: [request, ...state.labRequests],
  });

  return getScopedHospitalStateForUser(user);
}

export async function createPatientProfile(user: SafeUser, draft: PatientProfileDraft) {
  if (user.role !== "doctor") {
    throw createHttpError(403, "You do not have access to create patient profiles.");
  }

  const users = await loadUsers();
  const validation = validatePatientProfileDraft(users, user.organizationId, draft);

  if (!validation.isValid) {
    throw createHttpError(400, "Please review the patient profile details provided.", {
      errors: validation.errors,
    });
  }

  const passwordHash = await hashPassword(randomBytes(24).toString("hex"));
  const nextUser: UserRecord = {
    id: `user-patient-${randomBytes(6).toString("hex")}`,
    organizationId: user.organizationId,
    email: draft.email?.trim().toLowerCase() || createProfileOnlyEmail(draft.fullName),
    displayName: draft.fullName.trim(),
    role: "patient",
    passwordHash,
    assignedDoctorId: user.doctorId,
    patientName: draft.fullName.trim(),
    phoneNumber: draft.phoneNumber.trim(),
    gender: draft.gender.trim(),
    dateOfBirth: draft.dateOfBirth,
    bloodGroup: draft.bloodGroup.trim(),
    address: draft.address.trim(),
    emergencyContactName: draft.emergencyContactName.trim(),
    emergencyContactPhone: draft.emergencyContactPhone.trim(),
    emergencyContact: `${draft.emergencyContactName.trim()} · ${draft.emergencyContactPhone.trim()}`,
    allergies: draft.allergies.trim() || "None reported",
    medicalConditions: draft.medicalConditions.trim() || "None reported",
    preferredLanguage: draft.preferredLanguage?.trim() || "English",
  };

  await saveUsers([...users, nextUser]);
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
  const nextUsers = [...users];
  const nextUser: UserRecord = {
    ...currentUser,
    displayName: nextName,
    phoneNumber: normalizedDraft.phoneNumber?.trim() || undefined,
    gender: normalizedDraft.gender?.trim() || undefined,
    dateOfBirth: normalizedDraft.dateOfBirth || undefined,
    bloodGroup: normalizedDraft.bloodGroup?.trim() || undefined,
    address: normalizedDraft.address?.trim() || undefined,
    emergencyContactName: normalizedDraft.emergencyContactName?.trim() || undefined,
    emergencyContactPhone: normalizedDraft.emergencyContactPhone?.trim() || undefined,
    emergencyContact:
      normalizedDraft.emergencyContactName?.trim() && normalizedDraft.emergencyContactPhone?.trim()
        ? `${normalizedDraft.emergencyContactName.trim()} · ${normalizedDraft.emergencyContactPhone.trim()}`
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

  return getScopedHospitalStateForUser(user);
}
