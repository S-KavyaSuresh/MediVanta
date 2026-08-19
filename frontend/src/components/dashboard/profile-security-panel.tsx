"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import { normalizeAuthSession, type AuthSession } from "@/lib/auth";

type ActiveSession = {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  current: boolean;
  deviceLabel?: string;
  userAgent?: string;
};

function getHumanReadableDeviceLabel(session: ActiveSession) {
  const source = `${session.deviceLabel ?? ""} ${session.userAgent ?? ""}`.toLowerCase();

  const browser = source.includes("edg/")
    ? "Edge"
    : source.includes("chrome/") && !source.includes("edg/")
      ? "Chrome"
      : source.includes("safari/") && !source.includes("chrome/")
        ? "Safari"
        : source.includes("firefox/")
          ? "Firefox"
          : source.includes("opera") || source.includes("opr/")
            ? "Opera"
            : "Unknown browser";

  const device = source.includes("iphone")
    ? "iPhone"
    : source.includes("ipad")
      ? "iPad"
      : source.includes("android")
        ? "Android"
        : source.includes("windows")
          ? "Windows"
          : source.includes("mac os") || source.includes("macintosh")
            ? "macOS"
            : source.includes("linux")
              ? "Linux"
              : "Unknown device";

  return browser === "Unknown browser" && device === "Unknown device"
    ? "Unknown device"
    : `${browser} on ${device}`;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ProfileSecurityPanel() {
  const { session, updateSession } = useAuth();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [verificationCode, setVerificationCode] = useState("");
  const [message, setMessage] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadSessions() {
    setLoadingSessions(true);

    try {
      const response = await apiRequest<{ sessions: ActiveSession[] }>("/api/auth/sessions");
      setSessions(response.sessions);
    } catch {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void apiRequest<{ sessions: ActiveSession[] }>("/api/auth/sessions")
      .then((response) => {
        if (cancelled) {
          return;
        }

        setSessions(response.sessions);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setSessions([]);
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setLoadingSessions(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
          <h2 className="text-lg font-semibold">Active Sessions</h2>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Review recent signed-in devices and close any session you do not recognize.
          </p>
        </div>
        {loadingSessions ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">Loading sessions...</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((activeSession) => (
              <div
                key={activeSession.id}
                className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)]/50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold">
                      {getHumanReadableDeviceLabel(activeSession)}
                    </p>
                    <p className="text-sm text-[color:var(--muted-foreground)]">
                      {activeSession.current ? "Current device" : "Signed-in device"}
                    </p>
                    <p className="text-xs text-[color:var(--muted-foreground)]">
                      Last active: {formatDate(activeSession.lastUsedAt)}
                    </p>
                  </div>
                  {activeSession.current ? (
                    <Badge variant="info">Current</Badge>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={async () => {
                        await apiRequest(`/api/auth/sessions/${activeSession.id}`, {
                          method: "DELETE",
                        });
                        await loadSessions();
                      }}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-[color:var(--muted-foreground)]">
                  <span>Signed in: {formatDate(activeSession.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
