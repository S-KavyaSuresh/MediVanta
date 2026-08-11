import assert from "node:assert/strict";

import {
  getPasswordResetAttemptState,
  getVerificationAttemptState,
} from "../auth/auth-flow-state.js";
import { hashSecret } from "../auth/password.js";

function futureIso(minutesFromNow: number) {
  return new Date(Date.now() + minutesFromNow * 60_000);
}

const verificationCode = "833305";
const resetToken = "3f8f0f25d5fd91e7a6cb847d8c1c7f4cc7c1";
const resetOtp = "804987";
const now = Date.now();

const verificationState = getVerificationAttemptState(
  {
    verificationOtpHash: hashSecret(verificationCode),
    verificationExpiresAt: futureIso(15).toISOString(),
  },
  verificationCode,
  now,
);

assert.equal(verificationState.hasStoredHash, true);
assert.equal(verificationState.hasStoredExpiry, true);
assert.equal(verificationState.expiryValid, true);
assert.equal(verificationState.compareResult, true);
assert.equal(verificationState.isValid, true);

const verificationExpired = getVerificationAttemptState(
  {
    verificationOtpHash: hashSecret(verificationCode),
    verificationExpiresAt: new Date(now - 60_000).toISOString(),
  },
  verificationCode,
  now,
);

assert.equal(verificationExpired.expiryValid, false);
assert.equal(verificationExpired.isValid, false);

const resetState = getPasswordResetAttemptState(
  {
    resetTokenHash: hashSecret(resetToken),
    resetOtpHash: hashSecret(resetOtp),
    resetExpiresAt: futureIso(15).toISOString(),
  },
  resetToken,
  resetOtp,
  now,
);

assert.equal(resetState.hasStoredTokenHash, true);
assert.equal(resetState.hasStoredOtpHash, true);
assert.equal(resetState.hasStoredExpiry, true);
assert.equal(resetState.expiryValid, true);
assert.equal(resetState.tokenMatch, true);
assert.equal(resetState.otpMatch, true);
assert.equal(resetState.isValid, true);

const resetWrongOtp = getPasswordResetAttemptState(
  {
    resetTokenHash: hashSecret(resetToken),
    resetOtpHash: hashSecret(resetOtp),
    resetExpiresAt: futureIso(15).toISOString(),
  },
  resetToken,
  "000000",
  now,
);

assert.equal(resetWrongOtp.tokenMatch, true);
assert.equal(resetWrongOtp.otpMatch, false);
assert.equal(resetWrongOtp.isValid, false);

console.log("Focused auth flow checks passed.");
