"use client";

import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import { getPasswordPolicyErrors, passwordPolicySummary } from "@/lib/password-policy";

type ResetResponse = {
  message: string;
  developmentReset?: {
    token: string;
    otp: string;
    expiresAt: string;
  };
};

export function ForgotPasswordForm() {
  const [stage, setStage] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <Card className="w-full max-w-2xl p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <Image
          src="/medivanta-icon.png"
          alt=""
          width={44}
          height={44}
          className="h-11 w-11 rounded-2xl object-contain"
          priority
        />
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--accent)]">
          MediVanta
        </p>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Forgot Password</h1>

      {stage === "request" ? (
        <form
          className="mt-8 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitting(true);
            setErrorMessage("");
            setMessage("");
            setFieldErrors({});

            try {
              const response = await apiRequest<ResetResponse>("/api/auth/forgot-password", {
                method: "POST",
                body: JSON.stringify({ email }),
              });
              setMessage(response.message);
              setToken(response.developmentReset?.token ?? "");
              setOtp(response.developmentReset?.otp ?? "");
              setStage("reset");
            } catch (error) {
              setErrorMessage(
                error instanceof Error ? error.message : "Unable to prepare reset instructions.",
              );
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div>
            <label className="mb-2 block text-sm font-medium">Email</label>
            <Input
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Preparing..." : "Send Reset Code"}
          </Button>
        </form>
      ) : (
        <form
          className="mt-8 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitting(true);
            setErrorMessage("");
            setMessage("");
            setFieldErrors({});

            const nextFieldErrors: Record<string, string> = {};
            const passwordErrors = getPasswordPolicyErrors(password);

            if (!otp.trim()) {
              nextFieldErrors.otp = "Enter the reset code.";
            }

            if (!token.trim()) {
              nextFieldErrors.token = "Request a new reset code and try again.";
            }

            if (passwordErrors.length > 0) {
              nextFieldErrors.password = passwordErrors[0] ?? "Add a stronger password.";
            }

            if (password !== confirmPassword) {
              nextFieldErrors.confirmPassword = "Passwords do not match.";
            }

            if (Object.keys(nextFieldErrors).length > 0) {
              setFieldErrors(nextFieldErrors);
              setSubmitting(false);
              return;
            }

            try {
              const response = await apiRequest<{ message: string }>("/api/auth/reset-password", {
                method: "POST",
                body: JSON.stringify({
                  email: email.trim(),
                  token: token.trim(),
                  otp: otp.trim(),
                  password,
                  confirmPassword,
                }),
              });
              setMessage(response.message);
            } catch (error) {
              const maybeError = error as Error & { fieldErrors?: Record<string, string> };
              setFieldErrors(maybeError.fieldErrors ?? {});
              setErrorMessage(maybeError.message ?? "Unable to reset the password.");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div>
            <label className="mb-2 block text-sm font-medium">Reset Code</label>
            <Input value={otp} onChange={(event) => setOtp(event.target.value)} />
            {fieldErrors.otp ? (
              <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.otp}</p>
            ) : null}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">New Password</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                className="pr-12"
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[color:var(--muted-foreground)] hover:bg-[color:var(--surface-muted)]"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
              {passwordPolicySummary}
            </p>
            {fieldErrors.password ? (
              <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.password}</p>
            ) : null}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Confirm Password</label>
            <div className="relative">
              <Input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                className="pr-12"
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[color:var(--muted-foreground)] hover:bg-[color:var(--surface-muted)]"
                onClick={() => setShowConfirmPassword((current) => !current)}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {fieldErrors.confirmPassword ? (
              <p className="mt-2 text-sm text-[color:var(--danger)]">
                {fieldErrors.confirmPassword}
              </p>
            ) : null}
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Updating password..." : "Reset Password"}
          </Button>
        </form>
      )}

      {message ? (
        <p className="mt-4 text-sm text-[color:var(--muted-foreground)]">{message}</p>
      ) : null}
      {errorMessage ? (
        <p className="mt-6 rounded-2xl border border-[color:var(--danger)]/20 bg-[color:var(--danger)]/8 px-4 py-3 text-sm text-[color:var(--danger)]">
          {errorMessage}
        </p>
      ) : null}
      <p className="mt-6 text-center text-sm text-[color:var(--muted-foreground)]">
        Remembered your password?{" "}
        <Link
          href="/login"
          className="font-semibold text-[color:var(--accent)] hover:text-[color:var(--accent-strong)]"
        >
          Sign in
        </Link>
      </p>
    </Card>
  );
}
