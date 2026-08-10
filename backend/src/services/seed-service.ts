import type { HospitalState, SessionRecord, UserRecord } from "../domain/types.js";
import { hashPassword } from "../auth/password.js";
import { verifyPassword } from "../auth/password.js";
import {
  createDemoHospitalState,
  createDemoUsers,
  DEMO_ACCOUNT_PASSWORD,
  DEMO_ORGANIZATION,
  DEMO_REFERENCE_DATE,
} from "./demo-data.js";
import { readJsonFile } from "./file-store.js";
import {
  loadHospitalStateSnapshot,
  loadSessionsSnapshot,
  loadUsersSnapshot,
  saveHospitalStateSnapshot,
  saveSeedSnapshot,
  saveSessionsSnapshot,
  saveUsersSnapshot,
} from "../repositories/postgres-store.js";
import { assertDatabaseConfigured, query } from "../db/client.js";

const USERS_FILE = "users.json";
const SESSIONS_FILE = "sessions.json";
const HOSPITAL_FILE = "hospital-state.json";

function getPatientIdFromName(patientName: string, users: UserRecord[]) {
  const normalizedName = patientName.trim().toLowerCase();
  const matchedUser = users.find(
    (user) =>
      user.role === "patient" &&
      [user.patientName, user.displayName]
        .filter(Boolean)
        .some((value) => value!.trim().toLowerCase() === normalizedName),
  );

  return matchedUser?.id ?? `external:${normalizedName.replace(/[^a-z0-9]+/g, "-")}`;
}

async function mergeDemoUsers(existingUsers: UserRecord[], passwordHash: string) {
  const demoUsers = createDemoUsers(passwordHash);
  const demoUsersByEmail = new Map(
    demoUsers.map((user) => [user.email.toLowerCase(), user] as const),
  );
  const existingUsersByEmail = new Map(
    existingUsers.map((user) => [user.email.toLowerCase(), user] as const),
  );

  const normalizedDemoUsers = await Promise.all(
    demoUsers.map(async (demoUser) => {
      const existingUser = existingUsersByEmail.get(demoUser.email.toLowerCase());

      if (!existingUser) {
        return demoUser;
      }

      const passwordMatches = await verifyPassword(
        DEMO_ACCOUNT_PASSWORD,
        existingUser.passwordHash,
      );

      return {
        ...demoUser,
        displayName: existingUser.displayName ?? demoUser.displayName,
        patientName: existingUser.patientName ?? demoUser.patientName,
        departmentId: existingUser.departmentId ?? demoUser.departmentId,
        staffStatus: existingUser.staffStatus ?? demoUser.staffStatus,
        phoneNumber: existingUser.phoneNumber ?? demoUser.phoneNumber,
        gender: existingUser.gender ?? demoUser.gender,
        dateOfBirth: existingUser.dateOfBirth ?? demoUser.dateOfBirth,
        bloodGroup: existingUser.bloodGroup ?? demoUser.bloodGroup,
        address: existingUser.address ?? demoUser.address,
        emergencyContact: existingUser.emergencyContact ?? demoUser.emergencyContact,
        emergencyContactName:
          existingUser.emergencyContactName ?? demoUser.emergencyContactName,
        emergencyContactPhone:
          existingUser.emergencyContactPhone ?? demoUser.emergencyContactPhone,
        allergies: existingUser.allergies ?? demoUser.allergies,
        medicalConditions: existingUser.medicalConditions ?? demoUser.medicalConditions,
        preferredLanguage:
          existingUser.preferredLanguage ?? demoUser.preferredLanguage,
        qualifications: existingUser.qualifications ?? demoUser.qualifications,
        experience: existingUser.experience ?? demoUser.experience,
        languages: existingUser.languages ?? demoUser.languages,
        consultationFee: existingUser.consultationFee ?? demoUser.consultationFee,
        availableTimings: existingUser.availableTimings ?? demoUser.availableTimings,
        deskLabel: existingUser.deskLabel ?? demoUser.deskLabel,
        designation: existingUser.designation ?? demoUser.designation,
        shift: existingUser.shift ?? demoUser.shift,
        professionalRegistrationNumber:
          existingUser.professionalRegistrationNumber ?? demoUser.professionalRegistrationNumber,
        consultationMode:
          existingUser.consultationMode ?? demoUser.consultationMode,
        profileVerificationStatus:
          existingUser.profileVerificationStatus ?? demoUser.profileVerificationStatus,
        administrativeUnit:
          existingUser.administrativeUnit ?? demoUser.administrativeUnit,
        passwordHash: passwordMatches ? existingUser.passwordHash : demoUser.passwordHash,
      };
    }),
  );

  const nonDemoUsers = existingUsers.filter(
    (user) => !demoUsersByEmail.has(user.email.toLowerCase()),
  );

  return [...normalizedDemoUsers, ...nonDemoUsers].map((user) => ({
    ...user,
    organizationId: user.organizationId ?? DEMO_ORGANIZATION.id,
  }));
}

function hydrateHospitalState(state: HospitalState, users: UserRecord[]) {
  const fallbackState = createDemoHospitalState();

  return {
    ...state,
    organization: state.organization ?? DEMO_ORGANIZATION,
    departments: state.departments.map((department) => ({
      ...department,
      organizationId: department.organizationId ?? DEMO_ORGANIZATION.id,
    })),
    doctors: state.doctors.map((doctor) => ({
      ...doctor,
      organizationId: doctor.organizationId ?? DEMO_ORGANIZATION.id,
    })),
    appointments: state.appointments.map((appointment) => ({
      ...appointment,
      organizationId: appointment.organizationId ?? DEMO_ORGANIZATION.id,
      patientId:
        appointment.patientId ?? getPatientIdFromName(appointment.patientName, users),
    })),
    queueEntries: state.queueEntries.map((entry) => ({
      ...entry,
      organizationId: entry.organizationId ?? DEMO_ORGANIZATION.id,
    })),
    medicalRecords: state.medicalRecords?.length
      ? state.medicalRecords.map((record) => ({
          ...record,
          patientId: record.patientId ?? getPatientIdFromName(record.patientName, users),
          patientName: record.patientName,
          doctorName:
            record.doctorName ??
            state.doctors.find((doctor) => doctor.id === record.doctorId)?.name ??
            "Assigned doctor",
          hospitalId: record.hospitalId ?? record.organizationId ?? DEMO_ORGANIZATION.id,
          organizationId: record.organizationId ?? DEMO_ORGANIZATION.id,
          createdAt: record.createdAt ?? `${record.visitDate}T09:00:00.000Z`,
          updatedAt: record.updatedAt,
        }))
      : fallbackState.medicalRecords,
    prescriptions: state.prescriptions?.length
      ? state.prescriptions.map((prescription) => ({
          ...prescription,
          patientId:
            prescription.patientId ?? getPatientIdFromName(prescription.patientName, users),
          patientName: prescription.patientName,
          doctorName:
            prescription.doctorName ??
            state.doctors.find((doctor) => doctor.id === prescription.doctorId)?.name ??
            "Assigned doctor",
          hospitalId:
            prescription.hospitalId ?? prescription.organizationId ?? DEMO_ORGANIZATION.id,
          organizationId: prescription.organizationId ?? DEMO_ORGANIZATION.id,
          medicines: prescription.medicines ?? [],
        }))
      : fallbackState.prescriptions,
    labTests: state.labTests?.length
      ? state.labTests.map((test) => ({
          ...test,
          organizationId: test.organizationId ?? DEMO_ORGANIZATION.id,
        }))
      : fallbackState.labTests,
    labRequests: state.labRequests?.length
      ? state.labRequests.map((request) => ({
          ...request,
          patientId: request.patientId ?? "user-patient",
          hospitalId: request.hospitalId ?? request.organizationId ?? DEMO_ORGANIZATION.id,
          organizationId: request.organizationId ?? DEMO_ORGANIZATION.id,
          createdAt: request.createdAt ?? `${DEMO_REFERENCE_DATE}T09:00:00.000Z`,
        }))
      : fallbackState.labRequests,
    labReports: state.labReports?.length
      ? state.labReports.map((report) => {
          const linkedRequest = state.labRequests?.find(
            (request) => request.id === report.labRequestId,
          );

          return {
          ...report,
          patientId: report.patientId ?? linkedRequest?.patientId ?? "user-patient",
          testName: report.testName ?? linkedRequest?.testName ?? "Lab Report",
          hospitalId: report.hospitalId ?? report.organizationId ?? DEMO_ORGANIZATION.id,
          organizationId: report.organizationId ?? DEMO_ORGANIZATION.id,
          };
        })
      : fallbackState.labReports,
    bookingCapacity: state.bookingCapacity ?? fallbackState.bookingCapacity,
  };
}

export async function initializeDataStore() {
  assertDatabaseConfigured();

  try {
    await query("select 1 from organizations limit 1");
  } catch (error) {
    throw new Error(
      "PostgreSQL schema is not ready. Run the backend migration commands after setting DATABASE_URL.",
      { cause: error },
    );
  }
}

export async function reseedDemoData() {
  const passwordHash = await hashPassword(DEMO_ACCOUNT_PASSWORD);
  await saveSeedSnapshot({
    state: createDemoHospitalState(),
    users: createDemoUsers(passwordHash),
    sessions: [],
  });
}

export async function importLegacyJsonData() {
  const existingUsers = await readJsonFile<UserRecord[]>(USERS_FILE, []);
  const existingHospitalState = await readJsonFile<HospitalState | null>(HOSPITAL_FILE, null);
  const existingSessions = await readJsonFile<SessionRecord[]>(SESSIONS_FILE, []);
  const passwordHash = await hashPassword(DEMO_ACCOUNT_PASSWORD);
  const normalizedUsers = await mergeDemoUsers(existingUsers, passwordHash);
  const normalizedState = hydrateHospitalState(
    existingHospitalState ?? createDemoHospitalState(),
    normalizedUsers,
  );

  await saveSeedSnapshot({
    state: normalizedState,
    users: normalizedUsers,
    sessions: existingSessions,
  });
}

export async function loadUsers() {
  const users = await loadUsersSnapshot();
  const passwordHash = await hashPassword(DEMO_ACCOUNT_PASSWORD);
  return mergeDemoUsers(users, passwordHash);
}

export async function saveUsers(users: UserRecord[]) {
  await saveUsersSnapshot(users);
}

export async function loadHospitalState() {
  const state = (await loadHospitalStateSnapshot()) ?? createDemoHospitalState();
  const users = await loadUsers();
  return hydrateHospitalState(state, users);
}

export async function saveHospitalState(state: HospitalState) {
  await saveHospitalStateSnapshot(state);
}

export async function loadSessions() {
  return loadSessionsSnapshot();
}

export async function saveSessions(sessions: SessionRecord[]) {
  await saveSessionsSnapshot(sessions);
}
