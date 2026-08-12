"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import type {
  DoctorRecord,
  FamilyMemberRecord,
  PrescriptionRecord,
} from "@/lib/hospital-data";
import {
  formatPrescriptionDose,
  formatPrescriptionDuration,
  formatPrescriptionMedicineName,
} from "@/lib/hospital-data";

type PrescriptionViewModalProps = {
  open: boolean;
  prescription: PrescriptionRecord | null;
  organizationName: string;
  patientFriendlyId?: string;
  familyMembers?: FamilyMemberRecord[];
  doctors?: DoctorRecord[];
  onClose: () => void;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function buildPrintablePrescription(input: {
  prescription: PrescriptionRecord;
  organizationName: string;
  patientFriendlyId?: string;
  doctorSpecialization?: string;
  familyMemberName?: string;
}) {
  const { doctorSpecialization, familyMemberName, organizationName, patientFriendlyId, prescription } =
    input;

  const medicines = prescription.medicines
    .map(
      (medicine) => `
        <tr>
          <td>${escapeHtml(formatPrescriptionMedicineName(medicine))}</td>
          <td>${escapeHtml(medicine.strength ?? "-")}</td>
          <td>${escapeHtml(formatPrescriptionDose(medicine))}</td>
          <td>${escapeHtml(medicine.frequency)}</td>
          <td>${escapeHtml(formatPrescriptionDuration(medicine))}</td>
          <td style="text-align:right">${escapeHtml(String(medicine.totalQuantity ?? "-"))}</td>
          <td>${escapeHtml(medicine.instructions ?? "-")}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(`Prescription ${prescription.id}`)}</title>
      <style>
        body{font-family:Segoe UI,Arial,sans-serif;padding:32px;color:#0f172a}
        h1,h2,p{margin:0}
        .row{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}
        .section{margin-top:24px}
        .meta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:16px}
        .meta-card{border:1px solid #dbe3ee;border-radius:16px;padding:14px}
        table{width:100%;border-collapse:collapse;margin-top:16px}
        th,td{padding:10px 12px;border-bottom:1px solid #dbe3ee;text-align:left;font-size:14px;vertical-align:top}
        th{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#475569}
      </style>
    </head>
    <body>
      <div class="row">
        <div>
          <p style="font-size:12px;letter-spacing:.24em;color:#0369a1">MEDIVANTA</p>
          <h1 style="margin-top:8px">Prescription</h1>
          <p style="margin-top:8px;color:#475569">${escapeHtml(organizationName)}</p>
        </div>
        <div style="text-align:right">
          <p style="font-weight:600">${escapeHtml(prescription.id)}</p>
          <p style="margin-top:8px;color:#475569">Issued ${escapeHtml(formatDateTime(prescription.createdAt))}</p>
          <p style="margin-top:8px;color:#475569">Follow-up ${escapeHtml(formatDate(prescription.followUpDate))}</p>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-card">
          <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#475569">Patient</p>
          <p style="margin-top:8px;font-weight:600">${escapeHtml(prescription.patientName)}</p>
          <p style="margin-top:8px;color:#475569">Patient ID: ${escapeHtml(patientFriendlyId ?? prescription.patientId)}</p>
          ${
            familyMemberName
              ? `<p style="margin-top:8px;color:#475569">Family member: ${escapeHtml(familyMemberName)}</p>`
              : ""
          }
        </div>
        <div class="meta-card">
          <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#475569">Doctor</p>
          <p style="margin-top:8px;font-weight:600">${escapeHtml(prescription.doctorName)}</p>
          <p style="margin-top:8px;color:#475569">Specialization: ${escapeHtml(doctorSpecialization ?? "-")}</p>
          <p style="margin-top:8px;color:#475569">Professional ID: ${escapeHtml(prescription.doctorId)}</p>
        </div>
      </div>

      <div class="section">
        <h2>Medicines</h2>
        <table>
          <thead>
            <tr>
              <th>Medicine</th>
              <th>Strength</th>
              <th>Dose</th>
              <th>Frequency</th>
              <th>Duration</th>
              <th style="text-align:right">Total Quantity</th>
              <th>Instructions</th>
            </tr>
          </thead>
          <tbody>${medicines}</tbody>
        </table>
      </div>

      <div class="section">
        <h2>General Instructions</h2>
        <p style="margin-top:12px;white-space:pre-wrap;color:#334155">${escapeHtml(
          prescription.instructions,
        )}</p>
      </div>
    </body>
  </html>`;
}

export function printPrescription(input: {
  prescription: PrescriptionRecord;
  organizationName: string;
  patientFriendlyId?: string;
  familyMembers?: FamilyMemberRecord[];
  doctors?: DoctorRecord[];
}) {
  const familyMemberName = input.prescription.familyMemberId
    ? input.familyMembers?.find((member) => member.id === input.prescription.familyMemberId)?.fullName
    : undefined;
  const doctorSpecialization = input.doctors?.find(
    (doctor) => doctor.id === input.prescription.doctorId,
  )?.specialization;
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
  printDocument.write(
    buildPrintablePrescription({
      prescription: input.prescription,
      organizationName: input.organizationName,
      patientFriendlyId: input.patientFriendlyId,
      doctorSpecialization,
      familyMemberName,
    }),
  );
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

export function PrescriptionViewModal({
  open,
  prescription,
  organizationName,
  patientFriendlyId,
  familyMembers,
  doctors,
  onClose,
}: PrescriptionViewModalProps) {
  const familyMemberName = useMemo(() => {
    if (!prescription?.familyMemberId) {
      return null;
    }

    return familyMembers?.find((member) => member.id === prescription.familyMemberId)?.fullName ?? null;
  }, [familyMembers, prescription]);

  const doctor = useMemo(
    () => doctors?.find((entry) => entry.id === prescription?.doctorId) ?? null,
    [doctors, prescription?.doctorId],
  );

  if (!prescription) {
    return null;
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Prescription ${prescription.id}`}
      description="Review the prescribed medicines and print the prescription when needed."
    >
      <div className="space-y-4">
        <Card className="space-y-3 p-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="font-semibold">Hospital</p>
              <p className="text-[color:var(--muted-foreground)]">{organizationName}</p>
            </div>
            <div>
              <p className="font-semibold">Issued</p>
              <p className="text-[color:var(--muted-foreground)]">
                {formatDateTime(prescription.createdAt)}
              </p>
            </div>
            <div>
              <p className="font-semibold">Patient</p>
              <p className="text-[color:var(--muted-foreground)]">{prescription.patientName}</p>
            </div>
            <div>
              <p className="font-semibold">Patient ID</p>
              <p className="text-[color:var(--muted-foreground)]">
                {patientFriendlyId ?? prescription.patientId}
              </p>
            </div>
            {familyMemberName ? (
              <div>
                <p className="font-semibold">Family Member</p>
                <p className="text-[color:var(--muted-foreground)]">{familyMemberName}</p>
              </div>
            ) : null}
            <div>
              <p className="font-semibold">Doctor</p>
              <p className="text-[color:var(--muted-foreground)]">{prescription.doctorName}</p>
            </div>
            <div>
              <p className="font-semibold">Specialization</p>
              <p className="text-[color:var(--muted-foreground)]">{doctor?.specialization ?? "-"}</p>
            </div>
            <div>
              <p className="font-semibold">Professional ID</p>
              <p className="text-[color:var(--muted-foreground)]">{prescription.doctorId}</p>
            </div>
            <div>
              <p className="font-semibold">Follow-up Date</p>
              <p className="text-[color:var(--muted-foreground)]">
                {formatDate(prescription.followUpDate)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <p className="font-semibold">Medicines</p>
          <div className="space-y-3">
            {prescription.medicines.map((medicine, index) => (
              <div
                key={`${prescription.id}-${index}`}
                className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3"
              >
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="font-medium">{formatPrescriptionMedicineName(medicine)}</p>
                    <p className="mt-1 text-[color:var(--muted-foreground)]">
                      Strength: {medicine.strength ?? "-"}
                    </p>
                  </div>
                  <div className="text-[color:var(--muted-foreground)]">
                    <p>Dose: {formatPrescriptionDose(medicine)}</p>
                    <p className="mt-1">Frequency: {medicine.frequency}</p>
                    <p className="mt-1">Duration: {formatPrescriptionDuration(medicine)}</p>
                    <p className="mt-1">Total quantity: {medicine.totalQuantity ?? "-"}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">
                  Instructions: {medicine.instructions || "-"}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <p className="font-semibold">General Instructions</p>
          <p className="whitespace-pre-wrap text-sm leading-6 text-[color:var(--muted-foreground)]">
            {prescription.instructions}
          </p>
        </Card>

        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              printPrescription({
                prescription,
                organizationName,
                patientFriendlyId,
                familyMembers,
                doctors,
              })
            }
          >
            Print / Save as PDF
          </Button>
        </div>
      </div>
    </Modal>
  );
}
