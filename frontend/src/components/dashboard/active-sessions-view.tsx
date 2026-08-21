"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { apiRequest } from "@/lib/api";
import { profilePathByRole } from "@/lib/auth";
import { useAuth } from "@/components/providers/auth-provider";

type ActiveSession = {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  current: boolean;
  deviceLabel?: string;
  userAgent?: string;
};

const pageSize = 8;

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

function shortSessionId(id: string) {
  return id.length > 10 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
}

export function ActiveSessionsView() {
  const { session } = useAuth();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busySessionId, setBusySessionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void apiRequest<{ sessions: ActiveSession[] }>("/api/auth/sessions")
      .then((response) => {
        if (cancelled) {
          return;
        }

        setSessions(response.sessions);
      })
      .catch((nextError) => {
        if (cancelled) {
          return;
        }

        setSessions([]);
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load active sessions.",
        );
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

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((left, right) =>
        (right.lastUsedAt || right.createdAt || "").localeCompare(
          left.lastUsedAt || left.createdAt || "",
        ),
      ),
    [sessions],
  );
  const pageCount = Math.max(1, Math.ceil(sortedSessions.length / pageSize));
  const visibleSessions = sortedSessions.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Profile"
        title="Active Sessions"
        description="Review your signed-in devices and close sessions you do not recognize."
      />

      <div>
        <Link
          href={profilePathByRole[session.user.role]}
          className="inline-flex items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2.5 text-sm font-semibold text-[color:var(--foreground)] transition duration-200 hover:bg-[color:var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
        >
          Back to Profile
        </Link>
      </div>

      {loading ? (
        <Card>
          <p className="text-sm text-[color:var(--muted-foreground)]">Loading sessions...</p>
        </Card>
      ) : error ? (
        <EmptyState title="Sessions unavailable" description={error} />
      ) : visibleSessions.length === 0 ? (
        <EmptyState title="No active sessions" description="No active signed-in devices were found." />
      ) : (
        <Card className="space-y-4">
          {visibleSessions.map((activeSession) => (
            <div
              key={activeSession.id}
              className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)]/50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">
                      {getHumanReadableDeviceLabel(activeSession)}
                    </p>
                    {activeSession.current ? <Badge variant="info">Current</Badge> : null}
                  </div>
                  <p className="text-sm text-[color:var(--muted-foreground)]">
                    Session: {shortSessionId(activeSession.id)}
                  </p>
                  <p className="text-xs text-[color:var(--muted-foreground)]">
                    Signed in: {formatDate(activeSession.createdAt)}
                  </p>
                  <p className="text-xs text-[color:var(--muted-foreground)]">
                    Last activity: {formatDate(activeSession.lastUsedAt)}
                  </p>
                </div>
                {!activeSession.current ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busySessionId === activeSession.id}
                    onClick={async () => {
                      setBusySessionId(activeSession.id);
                      setError("");

                      try {
                        await apiRequest(`/api/auth/sessions/${activeSession.id}`, {
                          method: "DELETE",
                        });
                        setSessions((current) =>
                          current.filter((entry) => entry.id !== activeSession.id),
                        );
                      } catch (nextError) {
                        setError(
                          nextError instanceof Error
                            ? nextError.message
                            : "Unable to revoke this session.",
                        );
                      } finally {
                        setBusySessionId(null);
                      }
                    }}
                  >
                    {busySessionId === activeSession.id ? "Revoking..." : "Revoke Session"}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}

          {pageCount > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-sm text-[color:var(--muted-foreground)]">
                Page {page} of {pageCount}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page >= pageCount}
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
