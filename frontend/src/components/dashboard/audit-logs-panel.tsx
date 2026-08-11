"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { apiRequest } from "@/lib/api";

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  actorUserId?: string;
  createdAt: string;
  metadata?: Record<string, string>;
};

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

function toLabel(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function AuditLogsPanel() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiRequest<{ auditLogs: AuditLog[] }>("/api/hospital/audit-logs")
      .then((response) => {
        setLogs(response.auditLogs);
      })
      .catch((currentError) => {
        setError(currentError instanceof Error ? currentError.message : "Unable to load audit logs.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Audit Logs"
        description="Review recent sign-in, record, scheduling, reporting, and settings activity."
      />

      <Card className="space-y-4">
        {loading ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">Loading activity...</p>
        ) : error ? (
          <p className="text-sm text-[color:var(--danger)]">{error}</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">No recent audit activity found.</p>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)]/50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">{toLabel(log.action)}</p>
                    <p className="text-sm text-[color:var(--muted-foreground)]">
                      {toLabel(log.entityType)}
                      {log.entityId ? ` · ${log.entityId}` : ""}
                    </p>
                  </div>
                  <p className="text-xs text-[color:var(--muted-foreground)]">{formatDate(log.createdAt)}</p>
                </div>
                {log.metadata && Object.keys(log.metadata).length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-[color:var(--muted-foreground)]">
                    {Object.entries(log.metadata).map(([key, value]) => (
                      <span key={`${log.id}-${key}`}>
                        {toLabel(key)}: {value}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
