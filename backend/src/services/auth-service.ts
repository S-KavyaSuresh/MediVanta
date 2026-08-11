import { randomBytes } from "node:crypto";

import type { AuthSessionPayload, OrganizationRecord, SafeUser, UserRecord } from "../domain/types.js";
import { getCapabilitiesForRole, landingPathByRole } from "../auth/permissions.js";
import { verifyPassword, hashSecret } from "../auth/password.js";
import {
  createAccessToken,
  createRefreshToken,
  getAccessTokenLifetimeSeconds,
  getRefreshTokenLifetimeSeconds,
  verifyAccessToken,
  verifyRefreshToken,
} from "../auth/jwt.js";
import { DEMO_ORGANIZATION } from "./demo-data.js";
import {
  deleteExpiredSessions,
  loadOrganizationById,
  loadSessionById,
  loadUserByEmail,
  loadUserById,
  loadActiveSessionsForUser,
  revokeOtherSession,
  revokeSession,
  insertSession,
  updateSessionActivity,
} from "../repositories/postgres-store.js";
import { measurePerfStep } from "../utils/perf-trace.js";

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
    addressLine1: user.addressLine1,
    addressLine2: user.addressLine2,
    city: user.city,
    state: user.state,
    postalCode: user.postalCode,
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

async function getOrganizationForUser(user: UserRecord): Promise<OrganizationRecord> {
  const organization = await loadOrganizationById(user.organizationId);

  if (organization) {
    return organization;
  }

  return {
    ...DEMO_ORGANIZATION,
    id: user.organizationId ?? DEMO_ORGANIZATION.id,
  };
}

function getFallbackOrganization(organizationId?: string | null): OrganizationRecord {
  return {
    ...DEMO_ORGANIZATION,
    id: organizationId ?? DEMO_ORGANIZATION.id,
  };
}

export async function authenticateUser(email: string, password: string) {
  const user = await measurePerfStep("auth.load-user", () =>
    loadUserByEmail(email.trim().toLowerCase()),
  );

  if (!user) {
    return null;
  }

  if (user.staffStatus?.trim().toLowerCase() === "deactivated") {
    return null;
  }

  const matches = await measurePerfStep("auth.verify-password", () =>
    verifyPassword(password, user.passwordHash),
  );
  if (!matches) {
    return null;
  }

  return user;
}

export async function issueAuthSession(
  user: UserRecord,
  remember: boolean,
  userAgent?: string,
) {
  const sessionId = randomBytes(16).toString("hex");
  const refreshToken = createRefreshToken({
    userId: user.id,
    sessionId,
    type: "refresh",
  });
  const accessToken = createAccessToken({
    userId: user.id,
    role: user.role,
    organizationId: user.organizationId,
  });
  const now = new Date().toISOString();
  const refreshMaxAgeSeconds = getRefreshTokenLifetimeSeconds();
  const accessMaxAgeSeconds = getAccessTokenLifetimeSeconds();
  const expiresAt = new Date(Date.now() + refreshMaxAgeSeconds * 1000).toISOString();

  await measurePerfStep("auth.insert-session", () =>
    insertSession({
      id: sessionId,
      userId: user.id,
      expiresAt,
      remember,
      createdAt: now,
      lastUsedAt: now,
      userAgent,
      deviceLabel: userAgent?.slice(0, 120),
      refreshTokenHash: hashSecret(refreshToken),
    }),
  );

  return {
    accessToken,
    refreshToken,
    accessMaxAgeSeconds,
    refreshMaxAgeSeconds,
    sessionId,
  };
}

export async function revokeCurrentSession(sessionId: string) {
  await revokeSession(sessionId);
}

export async function resolveUserFromAccessToken(accessToken?: string | null) {
  if (!accessToken) {
    return null;
  }

  const payload = verifyAccessToken(accessToken);
  if (!payload?.userId) {
    return null;
  }

  return measurePerfStep("auth.access-user", () => loadUserById(payload.userId));
}

export async function refreshAuthSession(refreshToken?: string | null, _userAgent?: string) {
  if (!refreshToken) {
    return null;
  }

  const payload = verifyRefreshToken(refreshToken);
  if (!payload?.userId || !payload.sessionId || payload.type !== "refresh") {
    return null;
  }

  const session = await measurePerfStep("auth.load-session", () =>
    loadSessionById(payload.sessionId),
  );
  if (
    !session ||
    session.userId !== payload.userId ||
    session.revokedAt ||
    !session.refreshTokenHash ||
    session.refreshTokenHash !== hashSecret(refreshToken) ||
    new Date(session.expiresAt).getTime() <= Date.now()
  ) {
    return null;
  }

  const user = await measurePerfStep("auth.refresh-user", () =>
    loadUserById(payload.userId),
  );
  if (!user) {
    return null;
  }

  await measurePerfStep("auth.refresh-housekeeping", () =>
    Promise.all([updateSessionActivity(session.id), deleteExpiredSessions()]),
  );

  return {
    user,
    accessToken: createAccessToken({
      userId: user.id,
      role: user.role,
      organizationId: user.organizationId,
    }),
    refreshToken,
    accessMaxAgeSeconds: getAccessTokenLifetimeSeconds(),
    refreshMaxAgeSeconds: getRefreshTokenLifetimeSeconds(),
    sessionId: session.id,
  };
}

export async function buildSessionPayload(user: UserRecord): Promise<AuthSessionPayload> {
  const normalizedUser = {
    ...user,
    organizationId: user.organizationId ?? DEMO_ORGANIZATION.id,
  };
  const role = normalizedUser.role;
  let organization: OrganizationRecord;

  try {
    organization = await measurePerfStep("auth.load-organization", () =>
      getOrganizationForUser(normalizedUser),
    );
  } catch {
    organization = getFallbackOrganization(normalizedUser.organizationId);
  }

  return {
    user: toSafeUser(normalizedUser),
    organization,
    permissions: getCapabilitiesForRole(role) ?? [],
    landingPath: landingPathByRole[role] ?? "/dashboard",
  };
}

export async function listActiveSessions(userId: string, currentSessionId?: string | null) {
  const sessions = await loadActiveSessionsForUser(userId);
  return sessions.map((session) => ({
    ...session,
    current: session.id === currentSessionId,
  }));
}

export async function revokeUserSession(userId: string, sessionId: string) {
  await revokeOtherSession(userId, sessionId);
}
