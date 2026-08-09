"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";
import { getSafeLandingPath, normalizeAuthSession, type AuthSession } from "@/lib/auth";

type RegisterResponse = {
  session: AuthSession;
};

const fields = [
  { id: "fullName", label: "Full Name", type: "text" },
  { id: "email", label: "Email", type: "email" },
  { id: "phoneNumber", label: "Phone Number", type: "tel" },
  { id: "dateOfBirth", label: "Date of Birth", type: "date" },
  { id: "bloodGroup", label: "Blood Group", type: "text" },
  { id: "address", label: "Address", type: "text" },
  { id: "emergencyContact", label: "Emergency Contact", type: "text" },
  { id: "allergies", label: "Allergies", type: "text" },
  { id: "medicalConditions", label: "Existing Medical Conditions", type: "text" },
  { id: "password", label: "Password", type: "password" },
  { id: "confirmPassword", label: "Confirm Password", type: "password" },
] as const;

export function RegisterForm() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  return (
    <Card className="w-full max-w-2xl p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--accent)]">
        MediVanta
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Create patient account</h1>
      <form
        className="mt-8 grid gap-5 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          setErrorMessage("");
          setFieldErrors({});

          const formData = new FormData(event.currentTarget);
          const payload = Object.fromEntries(formData.entries());

          try {
            const response = await apiRequest<RegisterResponse>("/api/auth/register/patient", {
              method: "POST",
              body: JSON.stringify(payload),
            });
            const session = normalizeAuthSession(response.session);
            router.push(getSafeLandingPath(session.user.role, session.landingPath));
            router.refresh();
          } catch (error) {
            const maybeError = error as Error & { fieldErrors?: Record<string, string> };
            setFieldErrors(maybeError.fieldErrors ?? {});
            setErrorMessage(maybeError.message ?? "Unable to create your account right now.");
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-medium">Gender</label>
          <select
            name="gender"
            className="flex h-12 w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 text-sm"
            defaultValue=""
          >
            <option value="" disabled>
              Select gender
            </option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Non-binary">Non-binary</option>
            <option value="Prefer not to say">Prefer not to say</option>
          </select>
          {fieldErrors.gender ? (
            <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.gender}</p>
          ) : null}
        </div>
        {fields.map((field) => (
          <div key={field.id} className={field.id === "address" ? "sm:col-span-2" : ""}>
            <label className="mb-2 block text-sm font-medium">{field.label}</label>
            <Input
              name={field.id}
              type={field.type}
              max={field.id === "dateOfBirth" ? "2026-08-09" : undefined}
            />
            {fieldErrors[field.id] ? (
              <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors[field.id]}</p>
            ) : null}
          </div>
        ))}
        {errorMessage ? (
          <p className="sm:col-span-2 rounded-2xl border border-[color:var(--danger)]/20 bg-[color:var(--danger)]/8 px-4 py-3 text-sm text-[color:var(--danger)]">
            {errorMessage}
          </p>
        ) : null}
        <div className="sm:col-span-2">
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
