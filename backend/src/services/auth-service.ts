import { randomBytes } from "node:crypto";

import type {
  AuthSessionPayload,
  OrganizationRecord,
  SafeUser,
  SessionRecord,
  UserRecord,
} from "../domain/types.js";
import { getCapabilitiesForRole, landingPathByRole } from "../auth/permissions.js";
import { verifyPassword } from "../auth/password.js";
import { DEMO_ORGANIZATION } from "./demo-data.js";
import { loadHospitalState, loadSessions, loadUsers, saveSessions } from "./seed-service.js";

const SHORT_SESSION_SECONDS = 60 * 60 * 12;
const LONG_SESSION_SECONDS = 60 * 60 * 24 * 30;

function toSafeUser(user: UserRecord): SafeUser {
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

async function getOrganizationForUser(user: UserRecord): Promise<OrganizationRecord> {
  const state = await loadHospitalState();

  if (state.organization.id === user.organizationId) {
    return state.organization;
  }

  return {
    ...DEMO_ORGANIZATION,
    id: user.organizationId ?? DEMO_ORGANIZATION.id,
  };
}

export async function authenticateUser(email: string, password: string) {
  const users = await loadUsers();
  const user = users.find(
    (currentUser) => currentUser.email.toLowerCase() === email.trim().toLowerCase(),
  );

  if (!user) {
    return null;
  }

  const matches = await verifyPassword(password, user.passwordHash);
  if (!matches) {
    return null;
  }

  return user;
}

export async function createSession(userId: string, remember: boolean) {
  const sessions = await loadSessions();
  const sessionId = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + (remember ? LONG_SESSION_SECONDS : SHORT_SESSION_SECONDS) * 1000,
  ).toISOString();

  const nextSession: SessionRecord = {
    id: sessionId,
    userId,
    expiresAt,
    remember,
  };

  await saveSessions([
    ...sessions.filter((session) => session.userId !== userId),
    nextSession,
  ]);

  return {
    sessionId,
    maxAgeSeconds: remember ? LONG_SESSION_SECONDS : SHORT_SESSION_SECONDS,
  };
}

export async function destroySession(sessionId: string) {
  const sessions = await loadSessions();
  await saveSessions(sessions.filter((session) => session.id !== sessionId));
}

export async function getUserFromSession(sessionId?: string | null) {
  if (!sessionId) {
    return null;
  }

  const [sessions, users] = await Promise.all([loadSessions(), loadUsers()]);
  const now = Date.now();
  const activeSessions = sessions.filter(
    (session) => new Date(session.expiresAt).getTime() > now,
  );

  if (activeSessions.length !== sessions.length) {
    await saveSessions(activeSessions);
  }

  const session = activeSessions.find((currentSession) => currentSession.id === sessionId);
  if (!session) {
    return null;
  }

  const user = users.find((currentUser) => currentUser.id === session.userId);
  return user ?? null;
}

export async function buildSessionPayload(user: UserRecord): Promise<AuthSessionPayload> {
  const normalizedUser = {
    ...user,
    organizationId: user.organizationId ?? DEMO_ORGANIZATION.id,
  };
  const role = normalizedUser.role;

  return {
    user: toSafeUser(normalizedUser),
    organization: await getOrganizationForUser(normalizedUser),
    permissions: getCapabilitiesForRole(role) ?? [],
    landingPath: landingPathByRole[role] ?? "/dashboard",
  };
}
