"use client";

import Link from "next/link";
import Image from "next/image";
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
            router.replace(getSafeLandingPath(session.user.role, session.landingPath));
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
        <a
          href="/api/auth/google"
          className="flex h-12 w-full items-center justify-center rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 text-sm font-semibold text-[color:var(--foreground)] transition hover:bg-[color:var(--surface-muted)]"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="mr-2 h-5 w-5">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z"
            />
          </svg>
          Continue with Google
        </a>

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
