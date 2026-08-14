"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import { normalizeAuthSession, type AuthSession } from "@/lib/auth";

export function ProfileSecurityPanel() {
  const { session, updateSession } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [verificationCode, setVerificationCode] = useState("");
  const [message, setMessage] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <Card className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Email verification</h2>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Confirm this address before opening sensitive medical information.
          </p>
        </div>
        <Badge variant={session.user.emailVerified === false ? "warning" : "success"}>
          {session.user.emailVerified === false ? "Verification pending" : "Verified"}
        </Badge>
        {session.user.emailVerified === false ? (
          <div className="space-y-3">
            <Input
              value={verificationCode}
              placeholder="Enter verification code"
              onChange={(event) => setVerificationCode(event.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                setBusy(true);
                  setMessage("");

                  try {
                    const response = await apiRequest<{
                      message: string;
                      developmentVerification?: { code: string };
                    }>("/api/auth/verify-email/request", { method: "POST" });
                    setMessage(response.message);
                    setDevCode(response.developmentVerification?.code ?? null);
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Unable to prepare a verification code.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Send code
              </Button>
              <Button
                type="button"
                disabled={busy || verificationCode.trim().length < 6}
                onClick={async () => {
                  setBusy(true);
                  setMessage("");

                  try {
                    const response = await apiRequest<{
                      message: string;
                      session?: AuthSession;
                    }>("/api/auth/verify-email", {
                      method: "POST",
                      body: JSON.stringify({ otp: verificationCode.trim() }),
                    });
                    setMessage(response.message);
                    setDevCode(null);
                    setVerificationCode("");

                    if (response.session) {
                      updateSession(normalizeAuthSession(response.session));
                    }
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Unable to verify the code.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Verify email
              </Button>
            </div>
            {devCode ? (
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Verification code: <span className="font-semibold text-[color:var(--foreground)]">{devCode}</span>
              </p>
            ) : null}
          </div>
        ) : null}
        {message ? <p className="text-sm text-[color:var(--muted-foreground)]">{message}</p> : null}
      </Card>

      <Card className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Security</h2>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Review the devices signed in to your account and close any you do not recognize.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => router.push(`${pathname}/sessions`)}>
          Active Sessions
        </Button>
      </Card>
    </div>
  );
}
