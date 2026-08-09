import type { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";

import type { Capability, SafeUser } from "../domain/types.js";
import { getCapabilitiesForRole } from "../auth/permissions.js";
import { DEMO_ORGANIZATION } from "../services/demo-data.js";
import { getUserFromSession } from "../services/auth-service.js";

declare module "express-serve-static-core" {
  interface Request {
    authUser?: SafeUser;
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
    patientName: user.patientName ?? user.displayName,
    departmentId: user.departmentId,
    staffStatus: user.staffStatus,
    phoneNumber: user.phoneNumber,
    gender: user.gender,
    dateOfBirth: user.dateOfBirth,
    bloodGroup: user.bloodGroup,
    address: user.address,
    emergencyContact: user.emergencyContact,
    allergies: user.allergies,
    medicalConditions: user.medicalConditions,
  };
}

export async function requireAuthenticatedUser(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  try {
    const cookies = parseCookies(request.headers.cookie);
    const user = await getUserFromSession(cookies.medivanta_session);

    if (!user) {
      throw createHttpError(401, "Please sign in to continue.");
    }

    request.authUser = toSafeUser(user);
    next();
  } catch (error) {
    next(error);
  }
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
