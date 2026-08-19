"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { formatMoney } from "@/components/dashboard/billing-view";

type BillingDayRow = {
  date: string;
  invoiceCount: number;
  totalBilledCents: number;
  totalCollectedCents: number;
  outstandingCents: number;
  paidCount: number;
  pendingPartialCount: number;
  consultationRevenueCents: number;
  labRevenueCents: number;
  pharmacyRevenueCents: number;
};

type BillingDaySummaryResponse = {
  summary: {
    page: number;
    pageSize: number;
    totalDays: number;
    sort: "newest" | "oldest" | "highest-revenue" | "highest-outstanding" | "most-invoices";
    rows: BillingDayRow[];
  };
};

function formatDayLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export function AdminBillingDayListView() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<
    BillingDaySummaryResponse["summary"]["sort"]
  >("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BillingDaySummaryResponse["summary"] | null>(null);
  const dateError =
    dateFrom && dateTo && dateFrom > dateTo
      ? "From date cannot be later than To date."
      : null;

  useEffect(() => {
    if (dateError) {
      return;
    }

    let mounted = true;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiRequest<BillingDaySummaryResponse>(
          `/api/hospital/admin/billing/days?page=${page}&pageSize=10&sort=${encodeURIComponent(sort)}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
        );

        if (mounted) {
          setData(response.summary);
        }
      } catch (nextError) {
        if (mounted) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Billing summaries are not available right now.",
          );
          setData(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [dateError, dateFrom, dateTo, page, sort]);

  const totalPages = data ? Math.max(1, Math.ceil(data.totalDays / data.pageSize)) : 1;

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Billing"
        description="Review billing by day, follow daily revenue and outstanding amounts, and open the exact invoice history for a selected date."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,14rem)_minmax(0,12rem)_minmax(0,12rem)_auto] xl:items-end">
        <div className="space-y-2">
          <label className="text-sm font-medium">Sort days by</label>
          <Select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as BillingDaySummaryResponse["summary"]["sort"]);
              setPage(1);
            }}
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="highest-revenue">Highest revenue</option>
            <option value="highest-outstanding">Highest outstanding</option>
            <option value="most-invoices">Most invoices</option>
            </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">From Date</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">To Date</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={!dateFrom && !dateTo}
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setPage(1);
            }}
          >
            Clear Date Filter
          </Button>
        {data ? (
          <p className="text-sm text-[color:var(--muted-foreground)]">
            {data.totalDays} billing day{data.totalDays === 1 ? "" : "s"} found
          </p>
        ) : null}
        </div>
      </div>

      {dateError ? <p className="text-sm text-rose-600 dark:text-rose-300">{dateError}</p> : null}

      {loading ? (
        <EmptyState
          title="Loading billing days..."
          description="Preparing grouped billing history for this hospital workspace."
        />
      ) : dateError ? (
        <EmptyState
          title="Invalid billing date range"
          description={dateError}
        />
      ) : error ? (
        <EmptyState title="Billing unavailable" description={error} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          title="No billing history yet"
          description="Daily billing summaries will appear here as invoices are generated."
        />
      ) : (
        <>
          <div className="space-y-4">
            {data.rows.map((row) => (
              <Card key={row.date} className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{formatDayLabel(row.date)}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      {row.invoiceCount} invoice{row.invoiceCount === 1 ? "" : "s"} · {row.paidCount} paid · {row.pendingPartialCount} pending or partial
                    </p>
                  </div>
                  <Link href={`/dashboard/admin/billing/${row.date}`}>
                    <Button type="button" variant="secondary">
                      View day
                    </Button>
                  </Link>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted-foreground)]">Total billed</p>
                    <p className="mt-2 font-semibold">{formatMoney(row.totalBilledCents)}</p>
                  </div>
                  <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted-foreground)]">Collected</p>
                    <p className="mt-2 font-semibold">{formatMoney(row.totalCollectedCents)}</p>
                  </div>
                  <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted-foreground)]">Outstanding</p>
                    <p className="mt-2 font-semibold">{formatMoney(row.outstandingCents)}</p>
                  </div>
                  <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted-foreground)]">Consultation</p>
                    <p className="mt-2 font-semibold">{formatMoney(row.consultationRevenueCents)}</p>
                  </div>
                  <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted-foreground)]">Laboratory / Pharmacy</p>
                    <p className="mt-2 font-semibold">
                      {formatMoney(row.labRevenueCents + row.pharmacyRevenueCents)}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Page {page} of {totalPages}
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
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
