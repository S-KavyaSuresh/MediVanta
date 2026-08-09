import type { HospitalState, SessionRecord, UserRecord } from "../domain/types.js";
import { hashPassword } from "../auth/password.js";
import { verifyPassword } from "../auth/password.js";
import {
  createDemoHospitalState,
  createDemoUsers,
  DEMO_ACCOUNT_PASSWORD,
  DEMO_ORGANIZATION,
  HOSPITAL_TODAY,
} from "./demo-data.js";
import { readJsonFile, writeJsonFile } from "./file-store.js";

const USERS_FILE = "users.json";
const SESSIONS_FILE = "sessions.json";
const HOSPITAL_FILE = "hospital-state.json";

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

function hydrateHospitalState(state: HospitalState) {
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
    })),
    queueEntries: state.queueEntries.map((entry) => ({
      ...entry,
      organizationId: entry.organizationId ?? DEMO_ORGANIZATION.id,
    })),
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
          createdAt: request.createdAt ?? `${HOSPITAL_TODAY}T09:00:00.000Z`,
        }))
      : fallbackState.labRequests,
  };
}

export async function initializeDataStore() {
  const existingUsers = await readJsonFile<UserRecord[]>(USERS_FILE, []);
  const existingHospitalState = await readJsonFile<HospitalState | null>(HOSPITAL_FILE, null);
  const passwordHash = await hashPassword(DEMO_ACCOUNT_PASSWORD);
  const normalizedUsers = await mergeDemoUsers(existingUsers, passwordHash);

  await writeJsonFile(USERS_FILE, normalizedUsers);
  await writeJsonFile(
    HOSPITAL_FILE,
    hydrateHospitalState(existingHospitalState ?? createDemoHospitalState()),
  );

  const existingSessions = await readJsonFile<SessionRecord[]>(SESSIONS_FILE, []);
  await writeJsonFile(SESSIONS_FILE, existingSessions);
}

export async function reseedDemoData() {
  const passwordHash = await hashPassword(DEMO_ACCOUNT_PASSWORD);
  await writeJsonFile(USERS_FILE, createDemoUsers(passwordHash));
  await writeJsonFile(HOSPITAL_FILE, createDemoHospitalState());
  await writeJsonFile(SESSIONS_FILE, []);
}

export async function loadUsers() {
  const users = await readJsonFile<UserRecord[]>(USERS_FILE, []);
  const passwordHash = await hashPassword(DEMO_ACCOUNT_PASSWORD);
  const normalizedUsers = await mergeDemoUsers(users, passwordHash);

  if (JSON.stringify(users) !== JSON.stringify(normalizedUsers)) {
    await writeJsonFile(USERS_FILE, normalizedUsers);
  }

  return normalizedUsers;
}

export async function saveUsers(users: UserRecord[]) {
  await writeJsonFile(USERS_FILE, users);
}

export async function loadHospitalState() {
  const state = await readJsonFile<HospitalState>(HOSPITAL_FILE, createDemoHospitalState());
  const hydratedState = hydrateHospitalState(state);

  if (JSON.stringify(state) !== JSON.stringify(hydratedState)) {
    await writeJsonFile(HOSPITAL_FILE, hydratedState);
  }

  return hydratedState;
}

export async function saveHospitalState(state: HospitalState) {
  await writeJsonFile(HOSPITAL_FILE, state);
}

export async function loadSessions() {
  return readJsonFile<SessionRecord[]>(SESSIONS_FILE, []);
}

export async function saveSessions(sessions: SessionRecord[]) {
  await writeJsonFile(SESSIONS_FILE, sessions);
}
