import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";

import { hashPassword, hashSecret } from "../auth/password.js";
import { clearSessionCookie, setSessionCookie } from "../auth/session-cookie.js";
import { authenticateUser, buildSessionPayload, createSession, destroySession, getUserFromSession } from "../services/auth-service.js";
import { requireAuthenticatedUser } from "../middleware/auth.js";
import { loadUsers, saveUsers } from "../services/seed-service.js";
import { DEMO_ORGANIZATION } from "../services/demo-data.js";

const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.boolean().optional().default(false),
});

const patientRegistrationSchema = z
  .object({
    fullName: z.string().trim().min(2),
    email: z.string().email(),
    phoneNumber: z.string().trim().min(7),
    gender: z.string().trim().min(1),
    dateOfBirth: z.string(),
    bloodGroup: z.string().trim().min(1),
    address: z.string().trim().min(5),
    emergencyContact: z.string().trim().min(5),
    allergies: z.string().trim().default("None reported"),
    medicalConditions: z.string().trim().default("None reported"),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match.",
        path: ["confirmPassword"],
      });
    }

    const birthDate = new Date(value.dateOfBirth);
    const minDate = new Date("1900-01-01T00:00:00.000Z");
    const maxDate = new Date("2026-08-09T23:59:59.999Z");

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
    token: z.string().min(12),
    otp: z.string().regex(/^\d{6}$/),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match.",
        path: ["confirmPassword"],
      });
    }
  });

const directResetPasswordSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match.",
        path: ["confirmPassword"],
      });
    }
  });

function getSessionId(cookieHeader?: string) {
  return cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("medivanta_session="))
    ?.split("=")[1];
}

function zodErrorsToFieldErrors(error: z.ZodError) {
  return Object.fromEntries(
    error.issues.map((issue) => [String(issue.path[0] ?? "form"), issue.message]),
  );
}

authRouter.post("/login", async (request, response, next) => {
  try {
    const credentials = loginSchema.parse(request.body);
    const user = await authenticateUser(credentials.email, credentials.password);

    if (!user) {
      response.status(401).json({
        success: false,
        message: "The email or password you entered is incorrect.",
      });
      return;
    }

    const session = await createSession(user.id, credentials.remember);
    setSessionCookie(response, session.sessionId, session.maxAgeSeconds);

    response.json({
      success: true,
      session: await buildSessionPayload(user),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/register/patient", async (request, response, next) => {
  try {
    const payload = patientRegistrationSchema.parse(request.body);
    const users = await loadUsers();
    const existingUser = users.find(
      (user) => user.email.toLowerCase() === payload.email.trim().toLowerCase(),
    );

    if (existingUser) {
      response.status(409).json({
        success: false,
        message: "An account already exists with that email address.",
        errors: {
          email: "An account already exists with that email address.",
        },
      });
      return;
    }

    const passwordHash = await hashPassword(payload.password);
    const nextUser = {
      id: `user-patient-${randomBytes(6).toString("hex")}`,
      organizationId: DEMO_ORGANIZATION.id,
      email: payload.email.trim().toLowerCase(),
      displayName: payload.fullName.trim(),
      role: "patient" as const,
      passwordHash,
      patientName: payload.fullName.trim(),
      phoneNumber: payload.phoneNumber.trim(),
      gender: payload.gender.trim(),
      dateOfBirth: payload.dateOfBirth,
      bloodGroup: payload.bloodGroup.trim(),
      address: payload.address.trim(),
      emergencyContact: payload.emergencyContact.trim(),
      allergies: payload.allergies.trim() || "None reported",
      medicalConditions: payload.medicalConditions.trim() || "None reported",
    };

    await saveUsers([...users, nextUser]);

    const session = await createSession(nextUser.id, true);
    setSessionCookie(response, session.sessionId, session.maxAgeSeconds);

    response.status(201).json({
      success: true,
      session: await buildSessionPayload(nextUser),
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
});

authRouter.post("/forgot-password", async (request, response, next) => {
  try {
    const payload = forgotPasswordSchema.parse(request.body);
    const users = await loadUsers();
    const userIndex = users.findIndex(
      (user) => user.email.toLowerCase() === payload.email.trim().toLowerCase(),
    );

    if (userIndex === -1) {
      response.json({
        success: true,
        message: "If an account exists for that email, reset instructions have been prepared.",
      });
      return;
    }

    const token = randomBytes(18).toString("hex");
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const resetExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const nextUsers = [...users];
    nextUsers[userIndex] = {
      ...nextUsers[userIndex],
      resetTokenHash: hashSecret(token),
      resetOtpHash: hashSecret(otp),
      resetExpiresAt,
    };
    await saveUsers(nextUsers);

    response.json({
      success: true,
      message: "If an account exists for that email, reset instructions have been prepared.",
      developmentReset:
        process.env.NODE_ENV === "production"
          ? undefined
          : {
              email: payload.email.trim().toLowerCase(),
              token,
              otp,
              expiresAt: resetExpiresAt,
            },
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
});

authRouter.post("/reset-password", async (request, response, next) => {
  try {
    const payload = resetPasswordSchema.parse(request.body);
    const users = await loadUsers();
    const userIndex = users.findIndex(
      (user) => user.email.toLowerCase() === payload.email.trim().toLowerCase(),
    );

    if (userIndex === -1) {
      response.status(400).json({
        success: false,
        message: "The reset details could not be verified.",
      });
      return;
    }

    const user = users[userIndex];
    const hasValidReset =
      user.resetTokenHash &&
      user.resetOtpHash &&
      user.resetExpiresAt &&
      new Date(user.resetExpiresAt).getTime() > Date.now() &&
      user.resetTokenHash === hashSecret(payload.token) &&
      user.resetOtpHash === hashSecret(payload.otp);

    if (!hasValidReset) {
      response.status(400).json({
        success: false,
        message: "The reset details could not be verified.",
      });
      return;
    }

    const nextUsers = [...users];
    nextUsers[userIndex] = {
      ...user,
      passwordHash: await hashPassword(payload.password),
      resetTokenHash: undefined,
      resetOtpHash: undefined,
      resetExpiresAt: undefined,
    };
    await saveUsers(nextUsers);

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
});

authRouter.post("/reset-password-direct", async (request, response, next) => {
  try {
    const payload = directResetPasswordSchema.parse(request.body);
    const users = await loadUsers();
    const userIndex = users.findIndex(
      (user) => user.email.toLowerCase() === payload.email.trim().toLowerCase(),
    );

    if (userIndex === -1) {
      response.status(404).json({
        success: false,
        message: "No account was found for that email address.",
        errors: {
          email: "No account was found for that email address.",
        },
      });
      return;
    }

    const nextUsers = [...users];
    nextUsers[userIndex] = {
      ...users[userIndex],
      passwordHash: await hashPassword(payload.password),
      resetTokenHash: undefined,
      resetOtpHash: undefined,
      resetExpiresAt: undefined,
    };
    await saveUsers(nextUsers);

    response.json({
      success: true,
      message: "Your password has been updated. You can sign in now.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.status(400).json({
        success: false,
        message: "Please review the password details and try again.",
        errors: zodErrorsToFieldErrors(error),
      });
      return;
    }

    next(error);
  }
});

authRouter.post("/logout", async (request, response, next) => {
  try {
    const sessionId = getSessionId(request.headers.cookie);

    if (sessionId) {
      await destroySession(sessionId);
    }

    clearSessionCookie(response);
    response.json({ success: true });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuthenticatedUser, async (request, response, next) => {
  try {
    const user = request.authUser;

    if (!user) {
      response.status(401).json({ success: false, message: "Please sign in to continue." });
      return;
    }

    const fullUser = await getUserFromSession(
      getSessionId(request.headers.cookie) ?? null,
    );

    if (!fullUser) {
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

export { authRouter };
