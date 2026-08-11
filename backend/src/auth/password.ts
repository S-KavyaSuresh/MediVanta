import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { RefinementCtx } from "zod";

const scrypt = promisify(scryptCallback);

export const PASSWORD_POLICY_MESSAGES = {
  minLength: "Password must be at least 8 characters long.",
  uppercase: "Password must contain at least one uppercase letter.",
  lowercase: "Password must contain at least one lowercase letter.",
  number: "Password must contain at least one number.",
  specialCharacter: "Password must contain at least one special character.",
} as const;

export function getPasswordPolicyErrors(password: string) {
  const value = password ?? "";
  const errors: string[] = [];

  if (value.length < 8) {
    errors.push(PASSWORD_POLICY_MESSAGES.minLength);
  }

  if (!/[A-Z]/.test(value)) {
    errors.push(PASSWORD_POLICY_MESSAGES.uppercase);
  }

  if (!/[a-z]/.test(value)) {
    errors.push(PASSWORD_POLICY_MESSAGES.lowercase);
  }

  if (!/\d/.test(value)) {
    errors.push(PASSWORD_POLICY_MESSAGES.number);
  }

  if (!/[^A-Za-z\d]/.test(value)) {
    errors.push(PASSWORD_POLICY_MESSAGES.specialCharacter);
  }

  return errors;
}

export function addPasswordPolicyIssues(
  context: RefinementCtx,
  password: string,
  path: (string | number)[] = ["password"],
) {
  for (const message of getPasswordPolicyErrors(password)) {
    context.addIssue({
      code: "custom",
      message,
      path,
    });
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, hash] = storedHash.split("$");

  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }

  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const storedBuffer = Buffer.from(hash, "hex");

  if (derivedKey.length !== storedBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, storedBuffer);
}

export function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}
