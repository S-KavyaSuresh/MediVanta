export const passwordPolicyMessages = [
  "Password must be at least 8 characters long.",
  "Password must contain at least one uppercase letter.",
  "Password must contain at least one lowercase letter.",
  "Password must contain at least one number.",
  "Password must contain at least one special character.",
] as const;

export const passwordPolicySummary =
  "Use 8+ characters with uppercase, lowercase, number and special character.";

export function getPasswordPolicyErrors(password: string) {
  const value = password ?? "";
  const errors: string[] = [];

  if (value.length < 8) {
    errors.push(passwordPolicyMessages[0]);
  }

  if (!/[A-Z]/.test(value)) {
    errors.push(passwordPolicyMessages[1]);
  }

  if (!/[a-z]/.test(value)) {
    errors.push(passwordPolicyMessages[2]);
  }

  if (!/\d/.test(value)) {
    errors.push(passwordPolicyMessages[3]);
  }

  if (!/[^A-Za-z\d]/.test(value)) {
    errors.push(passwordPolicyMessages[4]);
  }

  return errors;
}
