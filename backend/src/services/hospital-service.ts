import createHttpError from "http-errors";
import { randomBytes } from "node:crypto";

import type {
  AppointmentDraft,
  AppointmentRecord,
  AppointmentStatus,
  DepartmentRecord,
  DepartmentStatus,
  DoctorStatus,
  HospitalState,
  HospitalStateResponse,
  LabRequestDraft,
  LabRequestRecord,
  QueueEntryRecord,
  QueueStatus,
  SafeUser,
  UserRole,
  UserRecord,
} from "../domain/types.js";
import { hashPassword } from "../auth/password.js";
import { loadHospitalState, loadUsers, saveHospitalState, saveUsers } from "./seed-service.js";
import { DEMO_ACCOUNT_PASSWORD } from "./demo-data.js";
import { HOSPITAL_TODAY } from "./demo-data.js";

function getCurrentLocalTimeValue(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

function getSlotTimeValue(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isPastLocalAppointmentSlot(date: string, time: string, now = new Date()) {
  if (date < HOSPITAL_TODAY) {
    return true;
  }

  if (date > HOSPITAL_TODAY) {
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

function getUserOrganizationId(user: SafeUser, state: HospitalState) {
  return user.organizationId || state.organization.id;
}

function toSafeUserSummary(user: {
  passwordHash: string;
  id: string;
  organizationId: string;
  email: string;
  displayName: string;
  role: UserRole;
  doctorId?: string;
  patientName?: string;
  departmentId?: string;
  staffStatus?: string;
}) {
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    doctorId: user.doctorId,
    patientName: user.patientName,
    departmentId: user.departmentId,
    staffStatus: user.staffStatus,
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
  } else if (draft.appointmentDate < HOSPITAL_TODAY) {
    errors.appointmentDate = "Appointment date cannot be in the past.";
  }

  if (!draft.appointmentTime) {
    errors.appointmentTime = "Select an appointment time.";
  } else if (!/^\d{2}:\d{2}$/.test(draft.appointmentTime)) {
    errors.appointmentTime = "Select a valid appointment time.";
  } else if (draft.appointmentDate && isPastLocalAppointmentSlot(draft.appointmentDate, draft.appointmentTime)) {
    errors.appointmentTime = "Select a future appointment time.";
  }

  const duplicate = state.appointments.find((appointment) => {
    if (editingId && appointment.id === editingId) {
      return false;
    }

    return (
      appointment.doctorId === draft.doctorId &&
      appointment.appointmentDate === draft.appointmentDate &&
      appointment.appointmentTime === draft.appointmentTime &&
      appointment.status !== "Cancelled"
    );
  });

  if (duplicate) {
    errors.appointmentTime = "The selected doctor already has an appointment at that time.";
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

  const test = state.labTests.find((currentTest) => currentTest.id === draft.testId);
  if (!test) {
    errors.testId = "Select a valid lab test.";
  }

  if (!draft.requestedDate) {
    errors.requestedDate = "Select a preferred lab date.";
  } else if (draft.requestedDate < HOSPITAL_TODAY) {
    errors.requestedDate = "Lab test date cannot be in the past.";
  }

  if (!draft.requestedTime) {
    errors.requestedTime = "Select a preferred lab time.";
  } else if (!/^\d{2}:\d{2}$/.test(draft.requestedTime)) {
    errors.requestedTime = "Select a valid lab time.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function withScopedState(role: UserRole, user: SafeUser, state: HospitalState): HospitalState {
  if (role === "administrator" || role === "receptionist") {
    return state;
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

    return {
      ...state,
      doctors: state.doctors.filter((doctor) => doctor.id === user.doctorId),
      departments: state.departments.filter((department) => departmentIds.has(department.id)),
      appointments,
      queueEntries,
      labRequests: state.labRequests.filter((request) =>
        appointments.some((appointment) => appointment.patientName === request.patientName),
      ),
    };
  }

  if (role === "laboratory") {
    return {
      ...state,
      appointments: [],
      queueEntries: [],
      doctors: [],
      departments: state.departments.filter((department) => department.id === "dept-laboratory"),
    };
  }

  if (role === "pharmacist") {
    return {
      ...state,
      appointments: [],
      queueEntries: [],
      labRequests: [],
    };
  }

  const appointments = state.appointments.filter(
    (appointment) => appointment.patientName === user.patientName,
  );
  const appointmentIds = new Set(appointments.map((appointment) => appointment.id));

  return {
    ...state,
    appointments,
    labRequests: getScopedLabRequestsForUser(user, state),
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

  if (user.role !== "administrator") {
    return { state: scopedState };
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
