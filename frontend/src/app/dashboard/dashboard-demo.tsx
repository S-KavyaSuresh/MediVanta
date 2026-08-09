"use client";

import { BellRing, ClipboardList } from "lucide-react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import {
  dashboardActivity,
  dashboardCoordination,
  dashboardNotifications,
  dashboardQueueRows,
  dashboardStats,
} from "@/lib/sample-data";

export function DashboardDemo() {
  return (
    <DashboardShell>
      <div className="min-w-0 max-w-full space-y-6 md:space-y-8">
        <PageHeader
          eyebrow="Hospital Workspace"
          title="A shared operations view for appointments, queues, notices, and daily activity"
          description="MediVanta brings essential hospital information into one clear workspace so front-desk teams, clinicians, and support staff can stay aligned during the day."
        />

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {dashboardStats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
          <div className="min-w-0 space-y-5">
            <DataTable
              columns={[
                { key: "id", header: "Queue ID" },
                { key: "patient", header: "Patient" },
                { key: "department", header: "Department" },
                {
                  key: "status",
                  header: "Status",
                  render: (value) => {
                    const variant =
                      value === "Completed"
                        ? "success"
                        : value === "In progress"
                          ? "info"
                          : "warning";

                    return <Badge variant={variant}>{String(value)}</Badge>;
                  },
                },
                { key: "updatedAt", header: "Updated" },
              ]}
              rows={dashboardQueueRows}
            />
            <Card className="min-w-0 space-y-4 p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-[color:var(--surface-muted)] p-2 text-[color:var(--accent)]">
                  <ClipboardList className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold leading-7">Care coordination priorities</h2>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--muted-foreground)]">
                    Operational points currently being tracked across hospital teams.
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {dashboardCoordination.map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4 text-sm leading-6 text-[color:var(--muted-foreground)]"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="min-w-0 space-y-5">
            <Card className="min-w-0 p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--accent)]" />
                <p className="pt-0.5 text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">
                  Hospital status
                </p>
              </div>
              <h2 className="mt-4 text-xl font-semibold leading-7 sm:text-2xl sm:leading-8">
                Current notices and preparation points
              </h2>
              <div className="mt-5 space-y-3">
                {dashboardNotifications.map((item) => (
                  <div
                    key={item.title}
                    className="min-w-0 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
                  >
                    <Badge
                      variant={
                        item.tone === "success"
                          ? "success"
                          : item.tone === "warning"
                            ? "warning"
                            : "info"
                      }
                    >
                      {item.tone === "success"
                        ? "Stable"
                        : item.tone === "warning"
                          ? "Attention"
                          : "Update"}
                    </Badge>
                    <p className="mt-3 font-semibold">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="min-w-0 p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--accent)]" />
                <h2 className="text-xl font-semibold leading-7">Recent activity</h2>
              </div>
              <div className="mt-5 space-y-3">
                {dashboardActivity.map((item) => (
                  <div
                    key={item}
                    className="min-w-0 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4 text-sm leading-6 text-[color:var(--muted-foreground)]"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
