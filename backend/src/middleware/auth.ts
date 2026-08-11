import type { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";

import type { Capability, SafeUser } from "../domain/types.js";
import { getCapabilitiesForRole } from "../auth/permissions.js";
import { DEMO_ORGANIZATION } from "../services/demo-data.js";
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  clearAuthCookies,
  setAuthCookies,
} from "../auth/session-cookie.js";
import { verifyRefreshToken } from "../auth/jwt.js";
import {
  refreshAuthSession,
  resolveUserFromAccessToken,
} from "../services/auth-service.js";
import { measurePerfStep } from "../utils/perf-trace.js";

declare module "express-serve-static-core" {
  interface Request {
    authUser?: SafeUser;
    authSessionId?: string | null;
  }
}

function parseCookies(cookieHeader?: string) {
  if (!cookieHeader) {
    return {};
  }

  return Object.fromEntries(
    cookieHeader.split(";").map((part) => {
      const [rawKey, ...rawValue] = part.trim().split("=");
      return [rawKey, decodeURIComponent(rawValue.join("="))];
    }),
  );
}

function toSafeUser(user: {
  passwordHash: string;
} & SafeUser): SafeUser {
  return {
    id: user.id,
    organizationId: user.organizationId ?? DEMO_ORGANIZATION.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    doctorId: user.doctorId,
    assignedDoctorId: user.assignedDoctorId,
    patientName: user.patientName ?? user.displayName,
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

export async function requireAuthenticatedUser(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  try {
    const cookies = parseCookies(request.headers.cookie);
    let user = await measurePerfStep("auth.middleware.access", () =>
      resolveUserFromAccessToken(cookies[ACCESS_COOKIE_NAME]),
    );
    let currentSessionId: string | null = null;

    const refreshPayload = cookies[REFRESH_COOKIE_NAME]
      ? verifyRefreshToken(cookies[REFRESH_COOKIE_NAME])
      : null;

    if (refreshPayload?.sessionId) {
      currentSessionId = refreshPayload.sessionId;
    }

    if (!user) {
      const refreshed = await measurePerfStep("auth.middleware.refresh", () =>
        refreshAuthSession(
          cookies[REFRESH_COOKIE_NAME],
          request.headers["user-agent"],
        ),
      );

      if (refreshed) {
        setAuthCookies(response, {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          accessMaxAgeSeconds: refreshed.accessMaxAgeSeconds,
          refreshMaxAgeSeconds: refreshed.refreshMaxAgeSeconds,
        });
        user = refreshed.user;
        currentSessionId = refreshed.sessionId;
      }
    }

    if (!user) {
      throw createHttpError(401, "Please sign in to continue.");
    }

    if (user.staffStatus?.trim().toLowerCase() === "deactivated") {
      clearAuthCookies(response);
      throw createHttpError(403, "This account is currently inactive.");
    }

    request.authUser = toSafeUser(user);
    request.authSessionId = currentSessionId;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireVerifiedEmail(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  if (!request.authUser) {
    next(createHttpError(401, "Please sign in to continue."));
    return;
  }

  if (request.authUser.emailVerified === false) {
    next(
      createHttpError(
        403,
        "Please verify your email address before opening sensitive medical information.",
      ),
    );
    return;
  }

  next();
}

export function requireCapabilities(...requiredCapabilities: Capability[]) {
  return (request: Request, _response: Response, next: NextFunction) => {
    const user = request.authUser;

    if (!user) {
      next(createHttpError(401, "Please sign in to continue."));
      return;
    }

    const permissions = getCapabilitiesForRole(user.role);
    const allowed = requiredCapabilities.every((capability) =>
      permissions.includes(capability),
    );

    if (!allowed) {
      next(createHttpError(403, "You do not have access to this workspace."));
      return;
    }

    next();
  };
}
