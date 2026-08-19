"use client";

import { useEffect, useState } from "react";

import { apiRequest } from "@/lib/api";
import type { InvoiceRecord } from "@/lib/hospital-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { formatDateTime, formatMoney, printInvoice } from "@/components/dashboard/billing-view";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { useToast } from "@/components/providers/toast-provider";

type DayDetailResponse = {
  day: {
    date: string;
    page: number;
    pageSize: number;
    sort: "newest" | "oldest" | "highest-total" | "highest-due";
    totalInvoices: number;
    summary: {
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
    rows: Array<{
      id: string;
      invoiceNumber: string;
      patientName: string;
      familyMemberId?: string;
      sourceType: string;
      createdAt: string;
      totalCents: number;
      amountPaidCents: number;
      amountDueCents: number;
      paymentStatus: "Pending" | "Partially Paid" | "Paid" | "Cancelled";
      paymentMethod?: string;
    }>;
  };
};

type InvoiceDetailResponse = {
  invoice: InvoiceRecord;
};

function formatDayLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function getSourceLabel(value: string) {
  if (value === "appointment") {
    return "Consultation";
  }

  if (value === "lab-request") {
    return "Laboratory";
  }

  if (value === "prescription") {
    return "Pharmacy";
  }

  return "Other";
}

export function AdminBillingDayDetailView({ billingDate }: { billingDate: string }) {
  const { state } = useHospitalData();
  const { pushToast } = useToast();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<DayDetailResponse["day"]["sort"]>("newest");
  const [query, setQuery] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<
    "All" | "Pending" | "Partially Paid" | "Paid" | "Cancelled"
  >("All");
  const [sourceType, setSourceType] = useState<
    "All" | "appointment" | "lab-request" | "prescription" | "other"
  >("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DayDetailResponse["day"] | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<InvoiceRecord | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  useEffect(() => {
    let mounted = true;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiRequest<DayDetailResponse>(
          `/api/hospital/admin/billing/days/${billingDate}?page=${page}&pageSize=20&sort=${encodeURIComponent(sort)}&paymentStatus=${encodeURIComponent(paymentStatus)}&sourceType=${encodeURIComponent(sourceType)}&q=${encodeURIComponent(query)}`,
        );

        if (mounted) {
          setData(response.day);
        }
      } catch (nextError) {
        if (mounted) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Billing details are not available right now.",
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
  }, [billingDate, page, sort, query, paymentStatus, sourceType]);

  const totalPages = data ? Math.max(1, Math.ceil(data.totalInvoices / data.pageSize)) : 1;

  async function openInvoice(invoiceId: string) {
    setInvoiceLoading(true);

    try {
      const response = await apiRequest<InvoiceDetailResponse>(
        `/api/hospital/admin/billing/invoices/${invoiceId}`,
      );
      setActiveInvoice(response.invoice);
    } catch (nextError) {
      pushToast(
        "Unable to open invoice",
        nextError instanceof Error ? nextError.message : "Please try again.",
      );
    } finally {
      setInvoiceLoading(false);
    }
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Administration"
        title={`Billing for ${formatDayLabel(billingDate)}`}
        description="Review invoices for the selected local billing day, filter the history, and monitor payment progress from one oversight view."
      />

      {loading ? (
        <EmptyState
          title="Loading daily billing..."
          description="Preparing invoice history and totals for the selected day."
        />
      ) : error ? (
        <EmptyState title="Billing unavailable" description={error} />
      ) : !data ? (
        <EmptyState
          title="No billing details available"
          description="The selected billing day could not be loaded."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Card className="space-y-2">
              <p className="text-sm text-[color:var(--muted-foreground)]">Invoices</p>
              <p className="text-2xl font-semibold">{data.summary.invoiceCount}</p>
            </Card>
            <Card className="space-y-2">
              <p className="text-sm text-[color:var(--muted-foreground)]">Total billed</p>
              <p className="text-2xl font-semibold">{formatMoney(data.summary.totalBilledCents)}</p>
            </Card>
            <Card className="space-y-2">
              <p className="text-sm text-[color:var(--muted-foreground)]">Collected</p>
              <p className="text-2xl font-semibold">{formatMoney(data.summary.totalCollectedCents)}</p>
            </Card>
            <Card className="space-y-2">
              <p className="text-sm text-[color:var(--muted-foreground)]">Outstanding</p>
              <p className="text-2xl font-semibold">{formatMoney(data.summary.outstandingCents)}</p>
            </Card>
            <Card className="space-y-2">
              <p className="text-sm text-[color:var(--muted-foreground)]">Paid / Pending</p>
              <p className="text-2xl font-semibold">
                {data.summary.paidCount} / {data.summary.pendingPartialCount}
              </p>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_12rem]">
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search by invoice ID or patient"
            />
            <Select
              value={paymentStatus}
              onChange={(event) => {
                setPaymentStatus(
                  event.target.value as "All" | "Pending" | "Partially Paid" | "Paid" | "Cancelled",
                );
                setPage(1);
              }}
            >
              <option value="All">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Paid">Paid</option>
              <option value="Cancelled">Cancelled</option>
            </Select>
            <Select
              value={sourceType}
              onChange={(event) => {
                setSourceType(
                  event.target.value as "All" | "appointment" | "lab-request" | "prescription" | "other",
                );
                setPage(1);
              }}
            >
              <option value="All">All sources</option>
              <option value="appointment">Consultation</option>
              <option value="lab-request">Laboratory</option>
              <option value="prescription">Pharmacy</option>
              <option value="other">Other</option>
            </Select>
            <Select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as DayDetailResponse["day"]["sort"]);
                setPage(1);
              }}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="highest-total">Highest total</option>
              <option value="highest-due">Highest due</option>
            </Select>
          </div>

          {data.rows.length > 0 ? (
            <div className="space-y-4">
              {data.rows.map((invoice) => (
                <Card key={invoice.id} className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold">{invoice.invoiceNumber}</p>
                      {invoice.familyMemberId ? (
                        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                          For {(state.familyMembers ?? []).find((member) => member.id === invoice.familyMemberId)?.fullName ?? invoice.patientName}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                        {invoice.patientName} · {formatDateTime(invoice.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge status={invoice.paymentStatus} />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={invoiceLoading}
                        onClick={() => void openInvoice(invoice.id)}
                      >
                        {invoiceLoading && activeInvoice?.id !== invoice.id ? "Loading..." : "View invoice"}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted-foreground)]">Source</p>
                      <p className="mt-1 font-semibold">{getSourceLabel(invoice.sourceType)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted-foreground)]">Total</p>
                      <p className="mt-1 font-semibold">{formatMoney(invoice.totalCents)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted-foreground)]">Paid</p>
                      <p className="mt-1 font-semibold">{formatMoney(invoice.amountPaidCents)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted-foreground)]">Due</p>
                      <p className="mt-1 font-semibold">{formatMoney(invoice.amountDueCents)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted-foreground)]">Payment method</p>
                      <p className="mt-1 font-semibold">{invoice.paymentMethod ?? "-"}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No invoices match this view"
              description="Try a different search term or filter to find billing records for this day."
            />
          )}

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

      <Modal
        open={Boolean(activeInvoice)}
        onClose={() => {
          setActiveInvoice(null);
        }}
        title={activeInvoice?.invoiceNumber ?? "Invoice"}
        description="Review charges, payment history, and invoice detail from the administrative oversight view."
      >
        {activeInvoice ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-[color:var(--muted-foreground)]">{activeInvoice.patientName}</p>
                  <p className="mt-1 font-semibold">{formatMoney(activeInvoice.totalCents)}</p>
                </div>
                <StatusBadge status={activeInvoice.paymentStatus} />
              </div>
            </div>

            <div className="space-y-3">
              {activeInvoice.items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[color:var(--border)] p-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{item.description}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      {item.category} · Qty {item.quantity}
                    </p>
                  </div>
                  <p className="font-semibold">{formatMoney(item.totalAmountCents)}</p>
                </div>
              ))}
            </div>

            {activeInvoice.payments.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold">Payments</p>
                {activeInvoice.payments.map((payment) => (
                  <div key={payment.id} className="rounded-2xl border border-[color:var(--border)] p-4">
                    <p className="font-medium">{formatMoney(payment.amountCents)}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      {payment.method} · {formatDateTime(payment.paidAt)}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-sm text-[color:var(--muted-foreground)]">
              Routine payment collection is handled from Reception Billing. This administrative view remains focused on oversight, invoice detail, and printing.
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => printInvoice(activeInvoice, state.organization.name)}
              >
                Print invoice
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
