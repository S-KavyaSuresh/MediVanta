"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, CalendarClock, ReceiptText, ShieldCheck, Users } from "lucide-react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function formatCurrency(valueCents: number) {
  return currencyFormatter.format(valueCents / 100);
}

export function AdminOverview() {
  const { departmentSummaries, fetchOperationalAnalytics, meta, metrics, state } = useHospitalData();
  const userCounts = meta?.userCounts;
  const totalBeds = state.organization.totalBeds ?? 0;
  const occupiedBeds = Math.min(state.organization.occupiedBeds ?? 0, totalBeds);
  const availableBeds = Math.max(0, totalBeds - occupiedBeds);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingOverview, setBillingOverview] = useState<{
    revenueTodayCents: number;
    outstandingBillingCents: number;
    paidInvoices: number;
    unpaidInvoices: number;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      setBillingLoading(true);
      setBillingError(null);

      const result = await fetchOperationalAnalytics("today");

      if (!mounted) {
        return;
      }

      if (!result.ok || !result.analytics) {
        setBillingOverview(null);
        setBillingError(result.message ?? "Billing metrics are not available right now.");
        setBillingLoading(false);
        return;
      }

      setBillingOverview({
        revenueTodayCents: result.analytics.overview.revenueTodayCents,
        outstandingBillingCents: result.analytics.overview.outstandingBillingCents,
        paidInvoices: result.analytics.billing.paidInvoices,
        unpaidInvoices: result.analytics.billing.unpaidInvoices,
      });
      setBillingLoading(false);
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [fetchOperationalAnalytics]);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Operational visibility across MediVanta"
        description="Review hospital activity, users, and core operational readiness without leaving the administrative workspace."
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label="Today's appointments"
          value={String(metrics.todaysAppointments)}
          delta="Across all operational departments"
          icon={CalendarClock}
        />
        <StatCard
          label="Active queue"
          value={String(metrics.activeQueueCount)}
          delta="Waiting, called, or in consultation"
          icon={ShieldCheck}
        />
        <StatCard
          label="Departments"
          value={String(departmentSummaries.length)}
          delta="Configured hospital departments"
          icon={Building2}
        />
        <StatCard
          label="User accounts"
          value={String(meta?.users?.length ?? 0)}
          delta="Current organization accounts"
          icon={Users}
        />
        <StatCard
          label="Revenue today"
          value={formatCurrency(billingOverview?.revenueTodayCents ?? 0)}
          delta={
            billingLoading
              ? "Loading billing metrics"
              : billingError
                ? "Billing metrics unavailable"
                : `${formatCurrency(billingOverview?.outstandingBillingCents ?? 0)} outstanding`
          }
          icon={ReceiptText}
        />
        <StatCard
          label="Available beds"
          value={String(availableBeds)}
          delta={`${occupiedBeds} occupied of ${totalBeds} total`}
          icon={Building2}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">User counts by role</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {userCounts
              ? Object.entries(userCounts).map(([role, count]) => (
                  <div
                    key={role}
                    className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                      {role}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{count}</p>
                  </div>
                ))
              : null}
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold">Billing overview</h2>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                Review today&apos;s billing position and open the daily grouped history when you need invoice detail.
              </p>
            </div>
            <Link href="/dashboard/admin/billing">
              <Button type="button" variant="secondary">
                View Billing
              </Button>
            </Link>
          </div>

          {billingLoading ? (
            <EmptyState
              title="Loading billing metrics..."
              description="Preparing revenue and payment summaries for today."
            />
          ) : billingError ? (
            <EmptyState title="Billing metrics unavailable" description={billingError} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                  Revenue today
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {formatCurrency(billingOverview?.revenueTodayCents ?? 0)}
                </p>
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                  Outstanding
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {formatCurrency(billingOverview?.outstandingBillingCents ?? 0)}
                </p>
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                  Paid invoices
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {billingOverview?.paidInvoices ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">
                  Pending or unpaid
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {billingOverview?.unpaidInvoices ?? 0}
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card className="space-y-4">
        <h2 className="text-xl font-semibold">Department readiness</h2>
        <div className="space-y-3">
          {departmentSummaries.slice(0, 5).map((department) => (
            <div
              key={department.id}
              className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
            >
              <p className="font-semibold">{department.name}</p>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                {department.availableDoctorCount} available doctors · {department.activeQueueCount} active queue entries
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
