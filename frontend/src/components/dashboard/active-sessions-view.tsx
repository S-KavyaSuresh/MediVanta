"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest } from "@/lib/api";

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

/**
 * Single shared implementation of the active-sessions list, reused by every role's
 * dedicated /profile/sessions page. Only ever renders device/browser labels, the
 * current-device indicator, timestamps, and a revoke action for other sessions —
 * never raw user agents, session IDs, or token material.
 */
export function ActiveSessionsView() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function loadSessions() {
    setLoading(true);
    try {
      const response = await apiRequest<{ sessions: ActiveSession[] }>("/api/auth/sessions");
      setSessions(response.sessions);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    apiRequest<{ sessions: ActiveSession[] }>("/api/auth/sessions")
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
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Active Sessions</h2>
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Review recent signed-in devices and close any session you do not recognize.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-[color:var(--muted-foreground)]">No active sessions found.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((activeSession) => (
            <div
              key={activeSession.id}
              className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)]/50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold">{getHumanReadableDeviceLabel(activeSession)}</p>
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
                    disabled={revokingId === activeSession.id}
                    onClick={async () => {
                      setRevokingId(activeSession.id);
                      try {
                        await apiRequest(`/api/auth/sessions/${activeSession.id}`, {
                          method: "DELETE",
                        });
                        await loadSessions();
                      } finally {
                        setRevokingId(null);
                      }
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
  );
}
