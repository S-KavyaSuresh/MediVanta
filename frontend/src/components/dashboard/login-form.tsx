"use client";

import Link from "next/link";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import { getSafeLandingPath, normalizeAuthSession, type AuthSession } from "@/lib/auth";

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  return (
    <Card className="w-full max-w-md p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--accent)]">
        MediVanta
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Sign in</h1>
      <form
        className="mt-8 space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          setErrorMessage("");
          setFieldErrors({});

          const formData = new FormData(event.currentTarget);
          const email = String(formData.get("email") ?? "").trim();
          const password = String(formData.get("password") ?? "");

          const nextFieldErrors: Record<string, string> = {};

          if (!email) {
            nextFieldErrors.email = "Enter your email address.";
          }

          if (!password) {
            nextFieldErrors.password = "Enter your password.";
          }

          if (Object.keys(nextFieldErrors).length > 0) {
            setFieldErrors(nextFieldErrors);
            setSubmitting(false);
            return;
          }

          try {
            const response = await apiRequest<{ session: AuthSession }>("/api/auth/login", {
              method: "POST",
              body: JSON.stringify({ email, password, remember: true }),
            });
            const session = normalizeAuthSession(response.session);
            router.push(getSafeLandingPath(session.user.role, session.landingPath));
            router.refresh();
          } catch (error) {
            setErrorMessage(
              error instanceof Error
                ? error.message
                : "Unable to sign in right now. Please try again.",
            );
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div>
          <label className="mb-2 block text-sm font-medium">Email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-foreground)]" />
            <Input name="email" type="email" placeholder="name@medivanta.demo" className="pl-10" />
          </div>
          {fieldErrors.email ? (
            <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.email}</p>
          ) : null}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Password</label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-foreground)]" />
            <Input
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              className="pl-10 pr-12"
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
          {fieldErrors.password ? (
            <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.password}</p>
          ) : null}
        </div>
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-[color:var(--accent)] hover:text-[color:var(--accent-strong)]"
          >
            Forgot password?
          </Link>
        </div>

        {errorMessage ? (
          <p className="rounded-2xl border border-[color:var(--danger)]/20 bg-[color:var(--danger)]/8 px-4 py-3 text-sm text-[color:var(--danger)]">
            {errorMessage}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </Button>

        <p className="text-center text-sm text-[color:var(--muted-foreground)]">
          Don&apos;t have an account?{" "}
          <Link
            href="/create-account"
            className="font-semibold text-[color:var(--accent)] hover:text-[color:var(--accent-strong)]"
          >
            Create account
          </Link>
        </p>
      </form>
    </Card>
  );
}
