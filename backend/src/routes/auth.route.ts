import { createHmac, randomBytes } from "node:crypto";

import { Router } from "express";
import { z } from "zod";

import {
  getPasswordResetAttemptState,
  getVerificationAttemptState,
} from "../auth/auth-flow-state.js";
import {
  addPasswordPolicyIssues,
  hashPassword,
  hashSecret,
} from "../auth/password.js";
import {
  clearAuthCookies,
  REFRESH_COOKIE_NAME,
  setAuthCookies,
} from "../auth/session-cookie.js";
import { requireAuthenticatedUser } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { env } from "../config/env.js";
import {
  loadUserByEmail,
  loadUserById,
  updateUserAuthState,
} from "../repositories/postgres-store.js";
import {
  authenticateUser,
  buildSessionPayload,
  issueAuthSession,
  listActiveSessions,
  refreshAuthSession,
  revokeCurrentSession,
  revokeUserSession,
} from "../services/auth-service.js";
import { writeAuditLog } from "../services/audit-service.js";
import { DEMO_ORGANIZATION } from "../services/demo-data.js";
import { loadUsers, saveUsers } from "../services/seed-service.js";
import { getCurrentLocalDateIso } from "../utils/date.js";
import type { UserRecord } from "../domain/types.js";

const authRouter = Router();
const GOOGLE_OAUTH_STATE_COOKIE = "medivanta_google_oauth_state";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.boolean().optional().default(false),
});

const patientRegistrationSchema = z
  .object({
    fullName: z.string(),
    email: z.string(),
    phoneNumber: z.string(),
    gender: z.string(),
    dateOfBirth: z.string(),
    bloodGroup: z.string(),
    preferredLanguage: z.string().trim().min(2).default("English"),
    addressLine1: z.string(),
    addressLine2: z.string().trim().optional().default(""),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    emergencyContactName: z.string(),
    emergencyContactPhone: z.string(),
    allergies: z.string().trim().default("None reported"),
    medicalConditions: z.string().trim().default("None reported"),
    password: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine((value, context) => {
    const fullName = value.fullName.trim();
    const email = value.email.trim().toLowerCase();
    const phoneNumber = value.phoneNumber.trim();
    const gender = value.gender.trim();
    const bloodGroup = value.bloodGroup.trim();
    const addressLine1 = value.addressLine1.trim();
    const city = value.city.trim();
    const state = value.state.trim();
    const postalCode = value.postalCode.trim();
    const emergencyContactName = value.emergencyContactName.trim();
    const emergencyContactPhone = value.emergencyContactPhone.trim();

    if (!fullName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Full name is required.",
        path: ["fullName"],
      });
    } else if (fullName.length < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a full name with at least 2 characters.",
        path: ["fullName"],
      });
    }

    if (!email) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email address is required.",
        path: ["email"],
      });
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid email address.",
        path: ["email"],
      });
    }

    if (!phoneNumber) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Phone number is required.",
        path: ["phoneNumber"],
      });
    } else if (phoneNumber.length < 7) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid phone number.",
        path: ["phoneNumber"],
      });
    }

    if (!gender) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a gender.",
        path: ["gender"],
      });
    }

    if (!bloodGroup) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a blood group.",
        path: ["bloodGroup"],
      });
    }

    if (!addressLine1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Address line 1 is required.",
        path: ["addressLine1"],
      });
    } else if (addressLine1.length < 5) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid address line 1.",
        path: ["addressLine1"],
      });
    }

    if (!city) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "City is required.",
        path: ["city"],
      });
    } else if (city.length < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid city.",
        path: ["city"],
      });
    }

    if (!state) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "State is required.",
        path: ["state"],
      });
    } else if (state.length < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid state.",
        path: ["state"],
      });
    }

    if (!postalCode) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Postal code is required.",
        path: ["postalCode"],
      });
    } else if (postalCode.length < 4) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid postal code.",
        path: ["postalCode"],
      });
    }

    if (!emergencyContactName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Emergency contact name is required.",
        path: ["emergencyContactName"],
      });
    } else if (emergencyContactName.length < 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter an emergency contact name.",
        path: ["emergencyContactName"],
      });
    }

    if (!emergencyContactPhone) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Emergency contact phone number is required.",
        path: ["emergencyContactPhone"],
      });
    } else if (emergencyContactPhone.length < 7) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter an emergency contact phone number.",
        path: ["emergencyContactPhone"],
      });
    }

    if (!value.password) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password is required.",
        path: ["password"],
      });
    } else {
      addPasswordPolicyIssues(context, value.password, ["password"]);
    }

    if (!value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please confirm your password.",
        path: ["confirmPassword"],
      });
    } else if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match.",
        path: ["confirmPassword"],
      });
    }

    const birthDate = new Date(value.dateOfBirth);
    const minDate = new Date("1900-01-01T00:00:00.000Z");
    const maxDate = new Date(`${getCurrentLocalDateIso()}T23:59:59.999Z`);

    if (Number.isNaN(birthDate.getTime()) || birthDate < minDate || birthDate > maxDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid date of birth.",
        path: ["dateOfBirth"],
      });
    }
  });

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z
  .object({
    email: z.string().email(),
    token: z.string().trim().min(12),
    otp: z.string().trim().regex(/^\d{6}$/),
    password: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine((value, context) => {
    addPasswordPolicyIssues(context, value.password, ["password"]);

    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match.",
        path: ["confirmPassword"],
      });
    }
  });

const verificationCodeSchema = z.object({
  otp: z.string().trim().regex(/^\d{6}$/),
});

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

function zodErrorsToFieldErrors(error: z.ZodError) {
  return Object.fromEntries(
    error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]),
  );
}

function createOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getGoogleRedirectUri() {
  return env.GOOGLE_OAUTH_REDIRECT_URI ?? `${env.CLIENT_ORIGIN.replace(/\/+$/, "")}/api/auth/google/callback`;
}

function createOAuthState() {
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = String(Date.now());
  const value = `${nonce}.${issuedAt}`;
  const signature = createHmac("sha256", env.SESSION_SECRET).update(value).digest("hex");

  return `${value}.${signature}`;
}

function isValidOAuthState(state: string, expectedState?: string) {
  if (!state || !expectedState || state !== expectedState) {
    return false;
  }

  const [nonce, issuedAt, signature] = state.split(".");
  if (!nonce || !issuedAt || !signature) {
    return false;
  }

  const expectedSignature = createHmac("sha256", env.SESSION_SECRET)
    .update(`${nonce}.${issuedAt}`)
    .digest("hex");
  const ageMs = Date.now() - Number(issuedAt);

  return signature === expectedSignature && Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= 10 * 60 * 1000;
}

type GoogleTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

async function exchangeGoogleCode(code: string) {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error("Google OAuth is not configured.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: getGoogleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const tokenPayload = (await tokenResponse.json()) as GoogleTokenResponse;

  if (!tokenResponse.ok || !tokenPayload.access_token) {
    throw new Error(tokenPayload.error_description ?? "Google sign in could not be completed.");
  }

  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      authorization: `Bearer ${tokenPayload.access_token}`,
    },
  });
  const profile = (await profileResponse.json()) as GoogleUserInfo;

  if (!profileResponse.ok || !profile.email || !profile.email_verified) {
    throw new Error("Google account email could not be verified.");
  }

  return {
    email: profile.email.trim().toLowerCase(),
    displayName: profile.name?.trim() || profile.email.split("@")[0],
  };
}

async function writeLoginAudit(input: {
  action: string;
  userId?: string;
  organizationId?: string;
  email: string;
}) {
  await writeAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: input.action,
    entityType: "auth",
    entityId: input.userId,
    metadata: {
      email: input.email,
    },
  });
}

authRouter.get("/google", rateLimit({ key: "auth-google-start", limit: 20, windowMs: 60_000 }), (request, response) => {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    response.status(503).json({
      success: false,
      message: "Google sign in is not configured yet.",
    });
    return;
  }

  const state = createOAuthState();
  response.cookie(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 10 * 60 * 1000,
    path: "/api/auth/google",
  });

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", env.GOOGLE_OAUTH_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", getGoogleRedirectUri());
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  response.redirect(authUrl.toString());
});

authRouter.get(
  "/google/callback",
  rateLimit({ key: "auth-google-callback", limit: 30, windowMs: 60_000 }),
  async (request, response, next) => {
  try {
    const code = typeof request.query.code === "string" ? request.query.code : "";
    const state = typeof request.query.state === "string" ? request.query.state : "";
    const cookies = parseCookies(request.headers.cookie);

    response.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, { path: "/api/auth/google" });

    if (!code || !isValidOAuthState(state, cookies[GOOGLE_OAUTH_STATE_COOKIE])) {
      response.redirect(`${env.CLIENT_ORIGIN}/login?error=google`);
      return;
    }

    const googleProfile = await exchangeGoogleCode(code);
    let user = await loadUserByEmail(googleProfile.email);

    if (user && user.role !== "patient") {
      await writeLoginAudit({
        action: "auth.google.staff-denied",
        userId: user.id,
        organizationId: user.organizationId,
        email: user.email,
      });
      response.redirect(`${env.CLIENT_ORIGIN}/login?error=google-staff`);
      return;
    }

    if (!user) {
      const users = await loadUsers();
      user = {
        id: `user-patient-google-${randomBytes(6).toString("hex")}`,
        organizationId: DEMO_ORGANIZATION.id,
        email: googleProfile.email,
        displayName: googleProfile.displayName,
        role: "patient",
        passwordHash: await hashPassword(randomBytes(24).toString("hex")),
        patientName: googleProfile.displayName,
        preferredLanguage: "English",
        allergies: "None reported",
        medicalConditions: "None reported",
        staffStatus: "Active",
        emailVerified: true,
      } satisfies UserRecord;

      await saveUsers([...users, user]);
      await writeAuditLog({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: "auth.google.patient-created",
        entityType: "user",
        entityId: user.id,
      });
    } else if (user.emailVerified === false) {
      await updateUserAuthState(user.id, {
        emailVerified: true,
        verificationOtpHash: null,
        verificationTokenHash: null,
        verificationExpiresAt: null,
      });
      user = { ...user, emailVerified: true };
    }

    const session = await issueAuthSession(user, true, request.headers["user-agent"]);
    setAuthCookies(response, session);
    await writeLoginAudit({
      action: "auth.google.succeeded",
      userId: user.id,
      organizationId: user.organizationId,
      email: user.email,
    });

    const sessionPayload = await buildSessionPayload(user);
    response.redirect(`${env.CLIENT_ORIGIN}${sessionPayload.landingPath}`);
  } catch (error) {
    if (response.headersSent) {
      next(error);
      return;
    }

    response.redirect(`${env.CLIENT_ORIGIN}/login?error=google`);
  }
  },
);

authRouter.post(
  "/login",
  rateLimit({ key: "auth-login", limit: 8, windowMs: 60_000 }),
  async (request, response, next) => {
    try {
      const credentials = loginSchema.parse(request.body);
      const user = await authenticateUser(credentials.email, credentials.password);

      if (!user) {
        await writeLoginAudit({
          action: "auth.login.failed",
          email: credentials.email.trim().toLowerCase(),
        });
        response.status(401).json({
          success: false,
          message: "The email or password you entered is incorrect.",
        });
        return;
      }

      const session = await issueAuthSession(
        user,
        credentials.remember,
        request.headers["user-agent"],
      );
      setAuthCookies(response, session);
      await writeLoginAudit({
        action: "auth.login.succeeded",
        userId: user.id,
        organizationId: user.organizationId,
        email: user.email,
      });

      response.json({
        success: true,
        session: await buildSessionPayload(user),
      });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/register/patient",
  rateLimit({ key: "auth-register-patient", limit: 6, windowMs: 5 * 60_000 }),
  async (request, response, next) => {
    try {
      const payload = patientRegistrationSchema.parse(request.body);
      const users = await loadUsers();
      const normalizedEmail = payload.email.trim().toLowerCase();
      const existingUser = users.find(
        (user) => user.email.toLowerCase() === normalizedEmail,
      );

      if (existingUser) {
        response.status(409).json({
          success: false,
          message: "An account with this email already exists.",
          errors: {
            email: "An account with this email already exists.",
          },
        });
        return;
      }

      const passwordHash = await hashPassword(payload.password);
      const verificationOtp = createOtp();
      const verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const nextUser = {
        id: `user-patient-${randomBytes(6).toString("hex")}`,
        organizationId: DEMO_ORGANIZATION.id,
        email: normalizedEmail,
        displayName: payload.fullName.trim(),
        role: "patient" as const,
        passwordHash,
        patientName: payload.fullName.trim(),
        phoneNumber: payload.phoneNumber.trim(),
        gender: payload.gender.trim(),
        dateOfBirth: payload.dateOfBirth,
        bloodGroup: payload.bloodGroup.trim(),
        address: [
          payload.addressLine1.trim(),
          payload.addressLine2.trim(),
          payload.city.trim(),
          payload.state.trim(),
          payload.postalCode.trim(),
        ]
          .filter(Boolean)
          .join(", "),
        addressLine1: payload.addressLine1.trim(),
        addressLine2: payload.addressLine2.trim() || undefined,
        city: payload.city.trim(),
        state: payload.state.trim(),
        postalCode: payload.postalCode.trim(),
        emergencyContact: `${payload.emergencyContactName.trim()} · ${payload.emergencyContactPhone.trim()}`,
        emergencyContactName: payload.emergencyContactName.trim(),
        emergencyContactPhone: payload.emergencyContactPhone.trim(),
        allergies: payload.allergies.trim() || "None reported",
        medicalConditions: payload.medicalConditions.trim() || "None reported",
        preferredLanguage: payload.preferredLanguage.trim() || "English",
        emailVerified: false,
        verificationOtpHash: hashSecret(verificationOtp),
        verificationExpiresAt,
      };

      await saveUsers([...users, nextUser]);
      const session = await issueAuthSession(nextUser, true, request.headers["user-agent"]);
      setAuthCookies(response, session);
      await writeAuditLog({
        organizationId: nextUser.organizationId,
        actorUserId: nextUser.id,
        action: "patient.registration.created",
        entityType: "user",
        entityId: nextUser.id,
        metadata: {
          role: nextUser.role,
        },
      });

      response.status(201).json({
        success: true,
        session: await buildSessionPayload(nextUser),
        developmentVerification:
          process.env.NODE_ENV === "production"
            ? undefined
            : {
                code: verificationOtp,
                expiresAt: verificationExpiresAt,
              },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        response.status(400).json({
          success: false,
          message: "Please review the registration details and try again.",
          errors: zodErrorsToFieldErrors(error),
        });
        return;
      }

      next(error);
    }
  },
);

authRouter.post(
  "/forgot-password",
  rateLimit({ key: "auth-forgot-password", limit: 5, windowMs: 10 * 60_000 }),
  async (request, response, next) => {
    try {
      const payload = forgotPasswordSchema.parse(request.body);
      const normalizedEmail = payload.email.trim().toLowerCase();
      const user = await loadUserByEmail(normalizedEmail);

      if (user) {
        const token = randomBytes(18).toString("hex");
        const otp = createOtp();
        const resetExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await updateUserAuthState(user.id, {
          resetTokenHash: hashSecret(token),
          resetOtpHash: hashSecret(otp),
          resetExpiresAt,
        });
        await writeAuditLog({
          organizationId: user.organizationId,
          actorUserId: user.id,
          action: "auth.password-reset.requested",
          entityType: "user",
          entityId: user.id,
        });

        response.json({
          success: true,
          message: "If an account exists for that email, reset instructions have been prepared.",
          developmentReset:
            process.env.NODE_ENV === "production"
              ? undefined
              : {
                  email: normalizedEmail,
                  token,
                  otp,
                  expiresAt: resetExpiresAt,
                },
        });
        return;
      }

      response.json({
        success: true,
        message: "If an account exists for that email, reset instructions have been prepared.",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        response.status(400).json({
          success: false,
          message: "Enter a valid email address.",
          errors: zodErrorsToFieldErrors(error),
        });
        return;
      }

      next(error);
    }
  },
);

authRouter.post(
  "/reset-password",
  rateLimit({ key: "auth-reset-password", limit: 5, windowMs: 10 * 60_000 }),
  async (request, response, next) => {
    try {
      const payload = resetPasswordSchema.parse(request.body);
      const normalizedEmail = payload.email.trim().toLowerCase();
      const user = await loadUserByEmail(normalizedEmail);

      if (!user) {
        response.status(400).json({
          success: false,
          message: "The reset details could not be verified.",
        });
        return;
      }

      const resetState = getPasswordResetAttemptState(
        user,
        payload.token,
        payload.otp,
      );

      if (!resetState.isValid) {
        response.status(400).json({
          success: false,
          message:
            resetState.hasStoredExpiry && !resetState.expiryValid
              ? "This password reset has expired. Request a new one."
              : "The reset code is incorrect. Request a new password reset.",
        });
        return;
      }

      await updateUserAuthState(user.id, {
        passwordHash: await hashPassword(payload.password),
        passwordResetRequired: false,
        resetTokenHash: null,
        resetOtpHash: null,
        resetExpiresAt: null,
      });
      await writeAuditLog({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: "auth.password-reset.completed",
        entityType: "user",
        entityId: user.id,
      });

      response.json({
        success: true,
        message: "Your password has been updated. You can sign in now.",
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        response.status(400).json({
          success: false,
          message: "Please review the reset details and try again.",
          errors: zodErrorsToFieldErrors(error),
        });
        return;
      }

      next(error);
    }
  },
);

authRouter.post(
  "/refresh",
  async (request, response, next) => {
    try {
      const cookies = parseCookies(request.headers.cookie);
      const refreshed = await refreshAuthSession(
        cookies[REFRESH_COOKIE_NAME],
        request.headers["user-agent"],
      );

      if (!refreshed) {
        clearAuthCookies(response);
        response.status(401).json({
          success: false,
          message: "Please sign in to continue.",
        });
        return;
      }

      setAuthCookies(response, refreshed);
      response.json({
        success: true,
        session: await buildSessionPayload(refreshed.user),
      });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/verify-email/request",
  requireAuthenticatedUser,
  rateLimit({ key: "auth-verify-email-request", limit: 5, windowMs: 10 * 60_000 }),
  async (request, response, next) => {
    try {
      const user = await loadUserById(request.authUser!.id);

      if (!user) {
        response.status(404).json({ success: false, message: "Account not found." });
        return;
      }

      if (user.emailVerified) {
        response.json({
          success: true,
          message: "Your email address is already verified.",
        });
        return;
      }

      const verificationOtp = createOtp();
      const verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await updateUserAuthState(user.id, {
        verificationOtpHash: hashSecret(verificationOtp),
        verificationExpiresAt,
      });

      response.json({
        success: true,
        message: "A verification code is ready for this account.",
        developmentVerification:
          process.env.NODE_ENV === "production"
            ? undefined
            : {
                code: verificationOtp,
                expiresAt: verificationExpiresAt,
              },
      });
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  "/verify-email",
  requireAuthenticatedUser,
  rateLimit({ key: "auth-verify-email", limit: 6, windowMs: 10 * 60_000 }),
  async (request, response, next) => {
    try {
      const payload = verificationCodeSchema.parse(request.body);
      const user = await loadUserById(request.authUser!.id);

      if (!user) {
        response.status(404).json({ success: false, message: "Account not found." });
        return;
      }

      const verificationState = getVerificationAttemptState(user, payload.otp);

      if (!verificationState.hasStoredHash || !verificationState.hasStoredExpiry) {
        response.status(400).json({
          success: false,
          message: "Verification code is incorrect.",
        });
        return;
      }

      if (!verificationState.expiryValid) {
        response.status(400).json({
          success: false,
          message: "Verification code has expired. Request a new code.",
        });
        return;
      }

      if (!verificationState.compareResult) {
        response.status(400).json({
          success: false,
          message: "Verification code is incorrect.",
        });
        return;
      }

      await updateUserAuthState(user.id, {
        emailVerified: true,
        verificationOtpHash: null,
        verificationTokenHash: null,
        verificationExpiresAt: null,
      });
      const fullUser = await loadUserById(user.id);

      await writeAuditLog({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: "auth.email-verified",
        entityType: "user",
        entityId: user.id,
      });

      response.json({
        success: true,
        message: "Your email address has been verified.",
        session: fullUser ? await buildSessionPayload(fullUser) : undefined,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        response.status(400).json({
          success: false,
          message: "Enter a valid verification code.",
          errors: zodErrorsToFieldErrors(error),
        });
        return;
      }

      next(error);
    }
  },
);

authRouter.post("/logout", async (request, response, next) => {
  try {
    const cookies = parseCookies(request.headers.cookie);
    const refreshed = await refreshAuthSession(cookies[REFRESH_COOKIE_NAME]);
    const sessionId = refreshed?.sessionId ?? request.authSessionId ?? null;

    if (sessionId) {
      await revokeCurrentSession(sessionId);
      if (refreshed?.user) {
        await writeAuditLog({
          organizationId: refreshed.user.organizationId,
          actorUserId: refreshed.user.id,
          action: "auth.logout",
          entityType: "auth",
          entityId: sessionId,
        });
      }
    }

    clearAuthCookies(response);
    response.json({ success: true });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuthenticatedUser, async (request, response, next) => {
  try {
    const fullUser = await loadUserById(request.authUser!.id);

    if (!fullUser) {
      clearAuthCookies(response);
      response.status(401).json({ success: false, message: "Please sign in to continue." });
      return;
    }

    response.json({
      success: true,
      session: await buildSessionPayload(fullUser),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/sessions", requireAuthenticatedUser, async (request, response, next) => {
  try {
    response.json({
      success: true,
      sessions: await listActiveSessions(request.authUser!.id, request.authSessionId),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.delete("/sessions/:sessionId", requireAuthenticatedUser, async (request, response, next) => {
  try {
    const sessionId = String(request.params.sessionId ?? "");

    if (!sessionId || sessionId === request.authSessionId) {
      response.status(400).json({
        success: false,
        message: "Choose another session to revoke.",
      });
      return;
    }

    await revokeUserSession(request.authUser!.id, sessionId);
    await writeAuditLog({
      organizationId: request.authUser!.organizationId,
      actorUserId: request.authUser!.id,
      action: "auth.session.revoked",
      entityType: "auth",
      entityId: sessionId,
    });

    response.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export { authRouter };
