"use client";

import { useMemo, useState } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import type { InvoiceRecord, PaymentDraft, PaymentMethod } from "@/lib/hospital-data";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/providers/toast-provider";

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPrintableInvoice(invoice: InvoiceRecord, organizationName: string) {
  const payments = invoice.payments
    .map(
      (payment) => `
        <tr>
          <td>${escapeHtml(formatDateTime(payment.paidAt))}</td>
          <td>${escapeHtml(payment.method)}</td>
          <td>${escapeHtml(payment.referenceNumber ?? "-")}</td>
          <td style="text-align:right">${escapeHtml(formatMoney(payment.amountCents))}</td>
        </tr>`,
    )
    .join("");
  const items = invoice.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.description)}</td>
          <td>${escapeHtml(item.category)}</td>
          <td style="text-align:right">${item.quantity}</td>
          <td style="text-align:right">${escapeHtml(formatMoney(item.unitAmountCents))}</td>
          <td style="text-align:right">${escapeHtml(formatMoney(item.totalAmountCents))}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(invoice.invoiceNumber)}</title>
      <style>
        body{font-family:Segoe UI,Arial,sans-serif;padding:32px;color:#0f172a}
        h1,h2,p{margin:0}
        .row{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}
        .meta{margin-top:24px}
        table{width:100%;border-collapse:collapse;margin-top:16px}
        th,td{padding:10px 12px;border-bottom:1px solid #dbe3ee;text-align:left;font-size:14px}
        th{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#475569}
        .summary{margin-top:20px;margin-left:auto;max-width:320px}
        .summary div{display:flex;justify-content:space-between;padding:6px 0}
        .section{margin-top:28px}
      </style>
    </head>
    <body>
      <div class="row">
        <div>
          <p style="font-size:12px;letter-spacing:.24em;color:#0369a1">MEDIVANTA</p>
          <h1 style="margin-top:8px">Invoice</h1>
          <p style="margin-top:8px;color:#475569">${escapeHtml(organizationName)}</p>
          <p style="margin-top:8px;color:#475569">${escapeHtml(invoice.invoiceNumber)}</p>
        </div>
        <div style="text-align:right">
          <p style="font-weight:600">${escapeHtml(invoice.patientName)}</p>
          <p style="margin-top:8px;color:#475569">Created ${escapeHtml(formatDateTime(invoice.createdAt))}</p>
          <p style="margin-top:8px;color:#475569">Status ${escapeHtml(invoice.paymentStatus)}</p>
        </div>
      </div>
      <div class="section">
        <h2>Charges</h2>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Category</th>
              <th style="text-align:right">Qty</th>
              <th style="text-align:right">Unit</th>
              <th style="text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>${items}</tbody>
        </table>
      </div>
      <div class="summary">
        <div><span>Subtotal</span><strong>${escapeHtml(formatMoney(invoice.subtotalCents))}</strong></div>
        <div><span>Paid</span><strong>${escapeHtml(formatMoney(invoice.amountPaidCents))}</strong></div>
        <div><span>Due</span><strong>${escapeHtml(formatMoney(invoice.amountDueCents))}</strong></div>
        <div><span>Total</span><strong>${escapeHtml(formatMoney(invoice.totalCents))}</strong></div>
      </div>
      <div class="section">
        <h2>Payments</h2>
        ${
          payments
            ? `<table>
                <thead>
                  <tr>
                    <th>Paid at</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th style="text-align:right">Amount</th>
                  </tr>
                </thead>
                <tbody>${payments}</tbody>
              </table>`
            : "<p style='margin-top:12px;color:#475569'>No payments recorded yet.</p>"
        }
      </div>
    </body>
  </html>`;
}

function printInvoice(invoice: InvoiceRecord, organizationName: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const printDocument = iframe.contentWindow?.document;
  if (!printDocument || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    window.print();
    return;
  }

  printDocument.open();
  printDocument.write(buildPrintableInvoice(invoice, organizationName));
  printDocument.close();
  iframe.contentWindow.focus();
  iframe.contentWindow.addEventListener(
    "afterprint",
    () => {
      iframe.remove();
    },
    { once: true },
  );
  iframe.contentWindow.print();
}

const staffPaymentMethods: PaymentMethod[] = ["Cash", "Card", "UPI", "Bank Transfer"];

function getDefaultPaymentAmount(invoice: InvoiceRecord) {
  return invoice.amountDueCents > 0 ? (invoice.amountDueCents / 100).toFixed(2) : "";
}

export function BillingView({
  eyebrow,
  title,
  description,
  canManagePayments,
}: {
  eyebrow: string;
  title: string;
  description: string;
  canManagePayments: boolean;
}) {
  const { recordInvoicePayment, state } = useHospitalData();
  const { pushToast } = useToast();
  const [query, setQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    canManagePayments ? "Cash" : "Demo Payment",
  );
  const [paymentReference, setPaymentReference] = useState("");

  const invoices = useMemo(
    () =>
      [...state.invoices]
        .filter((invoice) => (selectedStatus === "All" ? true : invoice.paymentStatus === selectedStatus))
        .filter((invoice) =>
          [invoice.invoiceNumber, invoice.patientName]
            .join(" ")
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .sort(
          (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        ),
    [query, selectedStatus, state.invoices],
  );
  const activeInvoice = invoices.find((invoice) => invoice.id === activeInvoiceId) ?? null;
  const outstandingTotal = invoices.reduce((sum, invoice) => sum + invoice.amountDueCents, 0);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="space-y-2">
          <p className="text-sm text-[color:var(--muted-foreground)]">Invoices</p>
          <p className="text-2xl font-semibold">{state.invoices.length}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-sm text-[color:var(--muted-foreground)]">Outstanding balance</p>
          <p className="text-2xl font-semibold">{formatMoney(outstandingTotal)}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-sm text-[color:var(--muted-foreground)]">Paid invoices</p>
          <p className="text-2xl font-semibold">
            {state.invoices.filter((invoice) => invoice.paymentStatus === "Paid").length}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={canManagePayments ? "Search by invoice or patient" : "Search invoices"}
        />
        <Select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
          <option value="All">All statuses</option>
          <option value="Pending">Pending</option>
          <option value="Partially Paid">Partially Paid</option>
          <option value="Paid">Paid</option>
          <option value="Cancelled">Cancelled</option>
        </Select>
      </div>

      {invoices.length > 0 ? (
        <div className="space-y-4">
          {invoices.map((invoice) => (
            <Card key={invoice.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{invoice.invoiceNumber}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                    {invoice.patientName} · Created {formatDateTime(invoice.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={invoice.paymentStatus} />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setActiveInvoiceId(invoice.id);
                      setPaymentAmount(getDefaultPaymentAmount(invoice));
                      setPaymentMethod(canManagePayments ? "Cash" : "Demo Payment");
                      setPaymentReference("");
                    }}
                  >
                    View invoice
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                    Total
                  </p>
                  <p className="mt-1 font-semibold">{formatMoney(invoice.totalCents)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                    Paid
                  </p>
                  <p className="mt-1 font-semibold">{formatMoney(invoice.amountPaidCents)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                    Due
                  </p>
                  <p className="mt-1 font-semibold">{formatMoney(invoice.amountDueCents)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No invoices available"
          description="Invoices will appear here when consultation, laboratory, or medicine charges are generated."
        />
      )}

      <Modal
        open={Boolean(activeInvoice)}
        onClose={() => {
          setActiveInvoiceId(null);
          setPaymentAmount("");
          setPaymentReference("");
          setPaymentMethod(canManagePayments ? "Cash" : "Demo Payment");
        }}
        title={activeInvoice?.invoiceNumber ?? "Invoice"}
        description="Review itemized charges and record payment when needed."
      >
        {activeInvoice ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-[color:var(--muted-foreground)]">
                    {activeInvoice.patientName}
                  </p>
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

            {activeInvoice.amountDueCents > 0 ? (
              <form
                className="space-y-4 rounded-2xl border border-[color:var(--border)] p-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const amount = Number(paymentAmount || getDefaultPaymentAmount(activeInvoice));

                  if (!Number.isFinite(amount) || amount <= 0) {
                    pushToast("Unable to record payment", "Payment amount must be greater than zero.");
                    return;
                  }

                  const payload: PaymentDraft = {
                    amount,
                    method: paymentMethod,
                    referenceNumber: paymentReference || undefined,
                  };
                  const result = await recordInvoicePayment(activeInvoice.id, payload);
                  if (!result.ok) {
                    pushToast("Unable to record payment", result.message ?? "Please review the payment details.");
                    return;
                  }

                  pushToast("Payment recorded", `Payment saved for ${activeInvoice.invoiceNumber}.`);
                  setActiveInvoiceId(null);
                  setPaymentAmount("");
                  setPaymentReference("");
                }}
              >
                <p className="text-sm font-semibold">
                  {canManagePayments ? "Record payment" : "Complete payment"}
                </p>
                <div>
                  <label className="mb-2 block text-sm font-medium">Amount</label>
                  <Input
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    placeholder={getDefaultPaymentAmount(activeInvoice)}
                    type="number"
                    min="0.01"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Method</label>
                  <Select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                  >
                    {(canManagePayments
                      ? staffPaymentMethods
                      : (["Demo Payment"] as PaymentMethod[])).map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Reference number</label>
                  <Input
                    value={paymentReference}
                    onChange={(event) => setPaymentReference(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => printInvoice(activeInvoice, state.organization.name)}
                  >
                    Print invoice
                  </Button>
                  <Button type="submit" disabled={activeInvoice.amountDueCents <= 0}>
                    {canManagePayments ? "Record payment" : "Pay now"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-sm text-[color:var(--muted-foreground)]">
                  {activeInvoice.totalCents <= 0 && activeInvoice.amountPaidCents <= 0
                    ? "No payment required"
                    : "Paid"}
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
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
