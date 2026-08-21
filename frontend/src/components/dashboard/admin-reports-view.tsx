"use client";

import {
  Activity,
  CalendarClock,
  ReceiptText,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";

type AnalyticsScope = "today" | "7d" | "30d";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function formatCurrency(valueCents: number) {
  return currencyFormatter.format(valueCents / 100);
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T00:00:00`));
}

export function AdminReportsView() {
  const { fetchOperationalAnalytics } = useHospitalData();
  const [scope, setScope] = useState<AnalyticsScope>("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [analytics, setAnalytics] = useState<
    Awaited<ReturnType<typeof fetchOperationalAnalytics>>["analytics"]
  >(undefined);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      setLoading(true);
      setError(null);
      const result = await fetchOperationalAnalytics(scope);

      if (!mounted) {
        return;
      }

      if (!result.ok) {
        setAnalytics(undefined);
        setError(result.message ?? "Analytics are not available right now.");
        setLoading(false);
        return;
      }

      setAnalytics(result.analytics);
      setLoading(false);
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [fetchOperationalAnalytics, retryCount, scope]);

  const trendPeak = useMemo(
    () => Math.max(...(analytics?.trends.map((item) => item.appointments) ?? [1])),
    [analytics?.trends],
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Operational Analytics"
        description="Review appointment flow, revenue, queue pressure, laboratory throughput, and pharmacy activity using live hospital data."
      />

      <div className="flex flex-wrap gap-2">
        {[
          { label: "Today", value: "today" },
          { label: "Last 7 Days", value: "7d" },
          { label: "Last 30 Days", value: "30d" },
        ].map((item) => (
          <Button
            key={item.value}
            type="button"
            variant={scope === item.value ? "primary" : "secondary"}
            onClick={() => setScope(item.value as AnalyticsScope)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <EmptyState
          title="Loading analytics..."
          description="Preparing the latest operational metrics for this hospital workspace."
        />
      ) : error || !analytics ? (
        <EmptyState
          title="Analytics unavailable"
          description={error ?? "No analytics data available."}
          action={
            <Button type="button" onClick={() => setRetryCount((current) => current + 1)}>
              Retry
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Patients Today" value={String(analytics.overview.patientsToday)} delta="Unique patients checked against appointments" icon={Users} />
            <StatCard label="Appointments Today" value={String(analytics.overview.appointmentsToday)} delta={`${analytics.overview.completedConsultations} completed consultations`} icon={CalendarClock} />
            <StatCard label="Active Queue" value={String(analytics.overview.activeQueue)} delta={`${analytics.overview.cancelledAppointments} cancelled · ${analytics.overview.noShows} no show`} icon={Activity} />
            <StatCard label="Revenue Today" value={formatCurrency(analytics.overview.revenueTodayCents)} delta={`${formatCurrency(analytics.overview.outstandingBillingCents)} outstanding`} icon={ReceiptText} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <Card className="space-y-4">
              <h2 className="text-xl font-semibold">Appointment Trends</h2>
              <div className="space-y-4">
                {analytics.trends.map((item) => (
                  <div key={item.date} className="space-y-2">
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <p className="font-medium">{formatDateLabel(item.date)}</p>
                      <p className="text-[color:var(--muted-foreground)]">
                        {item.appointments} total · {item.completed} completed · {item.cancelled} cancelled · {item.noShows} no show
                      </p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[color:var(--surface-muted)]">
                      <div
                        className="h-full rounded-full bg-[color:var(--accent)]"
                        style={{ width: `${Math.max(8, (item.appointments / trendPeak) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-[color:var(--muted-foreground)]">
                      {item.inPerson} in person · {item.online} online
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="space-y-4">
              <h2 className="text-xl font-semibold">Operational Overview</h2>
              <div className="grid gap-3">
                {[
                  ["Lab requests today", analytics.overview.labRequestsToday],
                  ["Prescriptions issued", analytics.overview.prescriptionsIssued],
                  ["Prescriptions dispensed", analytics.overview.prescriptionsDispensed],
                  ["Paid invoices", analytics.billing.paidInvoices],
                  ["Unpaid invoices", analytics.billing.unpaidInvoices],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3"
                  >
                    <p className="text-sm text-[color:var(--muted-foreground)]">{label}</p>
                    <p className="mt-1 text-2xl font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="space-y-4">
              <h2 className="text-xl font-semibold">Department Performance</h2>
              <div className="space-y-3">
                {analytics.departmentPerformance.map((department) => (
                  <div
                    key={department.id}
                    className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{department.name}</p>
                        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                          {department.appointmentCount} appointments · {department.patientVolume} patients
                        </p>
                      </div>
                      <p className="text-sm text-[color:var(--muted-foreground)]">
                        {department.onDutyDoctorCount}/{department.doctorCount} on duty
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="space-y-4">
              <h2 className="text-xl font-semibold">Doctor Workload</h2>
              <div className="space-y-3">
                {analytics.doctorPerformance.map((doctor) => (
                  <div
                    key={doctor.id}
                    className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{doctor.name}</p>
                        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                          {doctor.specialization}
                        </p>
                      </div>
                      <p className="text-sm text-[color:var(--muted-foreground)]">
                        Queue {doctor.activeQueueCount}
                      </p>
                    </div>
                    <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">
                      {doctor.completedConsultations} completed · {doctor.currentAppointmentCount} appointments · {doctor.patientLoad} patients
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="space-y-4">
              <h2 className="text-xl font-semibold">Laboratory</h2>
              <div className="space-y-2 text-sm text-[color:var(--muted-foreground)]">
                <p>Requested: {analytics.laboratory.requested}</p>
                <p>Processing: {analytics.laboratory.processing}</p>
                <p>Completed: {analytics.laboratory.completed}</p>
                <p>Reports released: {analytics.laboratory.reportsCompleted}</p>
              </div>
            </Card>
            <Card className="space-y-4">
              <h2 className="text-xl font-semibold">Pharmacy</h2>
              <div className="space-y-2 text-sm text-[color:var(--muted-foreground)]">
                <p>Prescriptions dispensed: {analytics.pharmacy.dispensed}</p>
                <p>Medicine value: {formatCurrency(analytics.pharmacy.medicineValueCents)}</p>
                <p>Low stock: {analytics.pharmacy.lowStockCount}</p>
                <p>Out of stock: {analytics.pharmacy.outOfStockCount}</p>
                <p>Near expiry: {analytics.pharmacy.nearExpiryCount}</p>
              </div>
            </Card>
            <Card className="space-y-4">
              <h2 className="text-xl font-semibold">Billing</h2>
              <div className="space-y-2 text-sm text-[color:var(--muted-foreground)]">
                <p>Total revenue: {formatCurrency(analytics.billing.revenueCents)}</p>
                <p>Consultation revenue: {formatCurrency(analytics.billing.consultationRevenueCents)}</p>
                <p>Laboratory revenue: {formatCurrency(analytics.billing.labRevenueCents)}</p>
                <p>Pharmacy revenue: {formatCurrency(analytics.billing.pharmacyRevenueCents)}</p>
                <p>Outstanding amount: {formatCurrency(analytics.billing.outstandingAmountCents)}</p>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
