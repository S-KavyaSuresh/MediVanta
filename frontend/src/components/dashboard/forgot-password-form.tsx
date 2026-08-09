"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [resetting, setResetting] = useState(false);

  return (
    <Card className="w-full max-w-2xl p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--accent)]">
        MediVanta
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Forgot Password</h1>
      <form
        className="mt-8 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setResetting(true);
          setErrorMessage("");
          const formData = new FormData(event.currentTarget);
          const payload = Object.fromEntries(formData.entries());

          try {
            const response = await apiRequest<{ message: string }>("/api/auth/reset-password-direct", {
              method: "POST",
              body: JSON.stringify(payload),
            });
            setMessage(response.message);
          } catch (error) {
            setErrorMessage(
              error instanceof Error ? error.message : "Unable to reset the password.",
            );
          } finally {
            setResetting(false);
          }
        }}
      >
        <div>
          <label className="mb-2 block text-sm font-medium">Email</label>
          <Input name="email" type="email" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">New Password</label>
          <Input name="password" type="password" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">Confirm Password</label>
          <Input name="confirmPassword" type="password" />
        </div>
        <Button type="submit" className="w-full" disabled={resetting}>
          {resetting ? "Updating password..." : "Reset Password"}
        </Button>
      </form>
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
