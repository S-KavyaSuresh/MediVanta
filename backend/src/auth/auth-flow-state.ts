import { hashSecret } from "./password.js";

type AuthFlowUser = {
  resetTokenHash?: string | null;
  resetOtpHash?: string | null;
  resetExpiresAt?: string | null;
  verificationOtpHash?: string | null;
  verificationExpiresAt?: string | null;
};

export function getVerificationAttemptState(
  user: AuthFlowUser,
  otp: string,
  now = Date.now(),
) {
  const hasStoredHash = Boolean(user.verificationOtpHash);
  const hasStoredExpiry = Boolean(user.verificationExpiresAt);
  const expiryTimestamp = user.verificationExpiresAt
    ? new Date(user.verificationExpiresAt).getTime()
    : Number.NaN;
  const expiryValid = hasStoredExpiry && Number.isFinite(expiryTimestamp) && expiryTimestamp > now;
  const compareResult = hasStoredHash && user.verificationOtpHash === hashSecret(otp);

  return {
    hasStoredHash,
    hasStoredExpiry,
    expiryValid,
    compareResult,
    isValid: compareResult && expiryValid,
  };
}

export function getPasswordResetAttemptState(
  user: AuthFlowUser,
  token: string,
  otp: string,
  now = Date.now(),
) {
  const hasStoredTokenHash = Boolean(user.resetTokenHash);
  const hasStoredOtpHash = Boolean(user.resetOtpHash);
  const hasStoredExpiry = Boolean(user.resetExpiresAt);
  const expiryTimestamp = user.resetExpiresAt
    ? new Date(user.resetExpiresAt).getTime()
    : Number.NaN;
  const expiryValid = hasStoredExpiry && Number.isFinite(expiryTimestamp) && expiryTimestamp > now;
  const tokenMatch = hasStoredTokenHash && user.resetTokenHash === hashSecret(token);
  const otpMatch = hasStoredOtpHash && user.resetOtpHash === hashSecret(otp);

  return {
    hasStoredTokenHash,
    hasStoredOtpHash,
    hasStoredExpiry,
    expiryValid,
    tokenMatch,
    otpMatch,
    isValid: tokenMatch && otpMatch && expiryValid,
  };
}
