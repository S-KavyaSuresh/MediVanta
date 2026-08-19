"use client";

import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/api";
import { getSafeLandingPath, normalizeAuthSession, type AuthSession } from "@/lib/auth";
import { getCurrentLocalDateIso } from "@/lib/hospital-data";
import { getPasswordPolicyErrors, passwordPolicySummary } from "@/lib/password-policy";

type RegisterResponse = {
  session: AuthSession;
};

const bloodGroupOptions = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];

export function RegisterForm() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const maxDate = useMemo(() => getCurrentLocalDateIso(), []);

  return (
    <Card className="w-full max-w-4xl p-6 sm:p-8">
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
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Create patient account</h1>
      <form
        className="mt-8 space-y-6"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          setErrorMessage("");
          setFieldErrors({});

          const formData = new FormData(event.currentTarget);
          const payload = Object.fromEntries(formData.entries());
          const password = String(payload.password ?? "");
          const confirmPassword = String(payload.confirmPassword ?? "");
          const passwordErrors = getPasswordPolicyErrors(password);
          const nextFieldErrors: Record<string, string> = {};

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
            const response = await apiRequest<RegisterResponse>("/api/auth/register/patient", {
              method: "POST",
              body: JSON.stringify(payload),
            });
            const session = normalizeAuthSession(response.session);
            router.replace(getSafeLandingPath(session.user.role, session.landingPath));
          } catch (error) {
            const maybeError = error as Error & { fieldErrors?: Record<string, string> };
            const nextFieldErrors = maybeError.fieldErrors ?? {};
            setFieldErrors(nextFieldErrors);
            setErrorMessage(
              Object.keys(nextFieldErrors).length > 0
                ? ""
                : (maybeError.message ?? "Unable to create your account right now."),
            );
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium">Full Name</label>
            <Input name="fullName" />
            {fieldErrors.fullName ? <p className="text-sm text-[color:var(--danger)]">{fieldErrors.fullName}</p> : null}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input name="email" type="email" />
            {fieldErrors.email ? <p className="text-sm text-[color:var(--danger)]">{fieldErrors.email}</p> : null}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Phone Number</label>
            <Input name="phoneNumber" type="tel" />
            {fieldErrors.phoneNumber ? <p className="text-sm text-[color:var(--danger)]">{fieldErrors.phoneNumber}</p> : null}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Gender</label>
            <select
              name="gender"
              className="flex h-12 w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 text-sm"
              defaultValue=""
            >
              <option value="" disabled>Select gender</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Non-binary">Non-binary</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
            {fieldErrors.gender ? <p className="text-sm text-[color:var(--danger)]">{fieldErrors.gender}</p> : null}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Date of Birth</label>
            <Input name="dateOfBirth" type="date" max={maxDate} />
            {fieldErrors.dateOfBirth ? <p className="text-sm text-[color:var(--danger)]">{fieldErrors.dateOfBirth}</p> : null}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Blood Group</label>
            <select
              name="bloodGroup"
              className="flex h-12 w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 text-sm"
              defaultValue=""
            >
              <option value="" disabled>Select blood group</option>
              {bloodGroupOptions.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
            {fieldErrors.bloodGroup ? <p className="text-sm text-[color:var(--danger)]">{fieldErrors.bloodGroup}</p> : null}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Preferred Language</label>
            <select
              name="preferredLanguage"
              className="flex h-12 w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 text-sm"
              defaultValue="English"
            >
              <option value="English">English</option>
              <option value="Tamil">Tamil</option>
              <option value="Hindi">Hindi</option>
            </select>
            {fieldErrors.preferredLanguage ? <p className="text-sm text-[color:var(--danger)]">{fieldErrors.preferredLanguage}</p> : null}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium">Address Line 1</label>
            <Input name="addressLine1" />
            {fieldErrors.addressLine1 ? <p className="text-sm text-[color:var(--danger)]">{fieldErrors.addressLine1}</p> : null}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label className="text-sm font-medium">Address Line 2</label>
            <Input name="addressLine2" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">City</label>
            <Input name="city" />
            {fieldErrors.city ? <p className="text-sm text-[color:var(--danger)]">{fieldErrors.city}</p> : null}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">State</label>
            <Input name="state" />
            {fieldErrors.state ? <p className="text-sm text-[color:var(--danger)]">{fieldErrors.state}</p> : null}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Postal Code</label>
            <Input name="postalCode" />
            {fieldErrors.postalCode ? <p className="text-sm text-[color:var(--danger)]">{fieldErrors.postalCode}</p> : null}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Emergency Contact Name</label>
            <Input name="emergencyContactName" />
            {fieldErrors.emergencyContactName ? <p className="text-sm text-[color:var(--danger)]">{fieldErrors.emergencyContactName}</p> : null}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Emergency Contact Phone</label>
            <Input name="emergencyContactPhone" />
            {fieldErrors.emergencyContactPhone ? <p className="text-sm text-[color:var(--danger)]">{fieldErrors.emergencyContactPhone}</p> : null}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Allergies</label>
            <Textarea name="allergies" defaultValue="None reported" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Existing / Chronic Medical Conditions</label>
            <Textarea name="medicalConditions" defaultValue="None reported" />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <div className="relative">
              <Input name="password" type={showPassword ? "text" : "password"} className="pr-12" />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[color:var(--muted-foreground)] hover:bg-[color:var(--surface-muted)]"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-[color:var(--muted-foreground)]">{passwordPolicySummary}</p>
            {fieldErrors.password ? <p className="text-sm text-[color:var(--danger)]">{fieldErrors.password}</p> : null}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Confirm Password</label>
            <div className="relative">
              <Input
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                className="pr-12"
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
            {fieldErrors.confirmPassword ? <p className="text-sm text-[color:var(--danger)]">{fieldErrors.confirmPassword}</p> : null}
          </div>
        </div>

        {errorMessage ? (
          <p className="rounded-2xl border border-[color:var(--danger)]/20 bg-[color:var(--danger)]/8 px-4 py-3 text-sm text-[color:var(--danger)]">
            {errorMessage}
          </p>
        ) : null}
        <div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Creating account..." : "Create Account"}
          </Button>
          <p className="mt-4 text-center text-sm text-[color:var(--muted-foreground)]">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-[color:var(--accent)] hover:text-[color:var(--accent-strong)]"
            >
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </Card>
  );
}
