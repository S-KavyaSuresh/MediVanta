"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  getPatientUpcomingAppointments,
  type PatientJourneyRecord,
} from "@/lib/hospital-data";

function PatientJourneyContent() {
  const searchParams = useSearchParams();
  const { fetchPatientJourney, state } = useHospitalData();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [journey, setJourney] = useState<Awaited<ReturnType<typeof fetchPatientJourney>>["journey"]>();
  const [journeyLink, setJourneyLink] = useState("");
  const [journeyQr, setJourneyQr] = useState("");
  const queryToken = searchParams.get("token") ?? "";
  const nextAppointment = getPatientUpcomingAppointments(state.appointments)[0];
  const activeJourney = state.patientJourneys?.find((item) =>
    nextAppointment ? item.appointmentId === nextAppointment.id : false,
  );
  const localJourney: PatientJourneyRecord | undefined = activeJourney;
  const token = queryToken || localJourney?.token || "";

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!token) {
        setJourney(undefined);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      const result = await fetchPatientJourney(token);
      if (!active) {
        return;
      }

      if (!result.ok || !result.journey) {
        setError(result.message ?? "The hospital journey could not be loaded.");
        setLoading(false);
        return;
      }

      setJourney(result.journey);
      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, [fetchPatientJourney, token]);

  useEffect(() => {
    let active = true;

    const loadQr = async () => {
      if (!token || typeof window === "undefined") {
        setJourneyLink("");
        setJourneyQr("");
        return;
      }

      const nextLink = `${window.location.origin}/dashboard/patient/journey?token=${encodeURIComponent(token)}`;
      setJourneyLink(nextLink);
      const QRCode = await import("qrcode");
      const dataUrl = await QRCode.toDataURL(nextLink, {
        margin: 1,
        width: 176,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      });

      if (active) {
        setJourneyQr(dataUrl);
      }
    };

    void loadQr();

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Hospital Journey"
        title="Hospital Journey"
        description="Track the current step, next step, and the latest queue estimate for your active care visit."
      />

      {loading ? (
        <Card className="text-sm text-[color:var(--muted-foreground)]">Loading current journey...</Card>
      ) : error ? (
        <EmptyState title="Journey unavailable" description={error} />
      ) : journey ? (
        <Card className="space-y-5">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
            <p className="text-sm font-semibold">Hospital Journey QR</p>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              Scan to view your current hospital journey.
            </p>
            {journeyQr ? (
              <img
                src={journeyQr}
                alt="Hospital journey QR"
                className="mt-4 h-44 w-44 rounded-2xl border border-[color:var(--border)] bg-white p-3"
              />
            ) : null}
            {journeyLink ? (
              <div className="mt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(journeyLink);
                  }}
                >
                  Copy Journey Link
                </Button>
              </div>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                Current step
              </p>
              <p className="mt-2 text-lg font-semibold">{journey.currentStep ?? "In progress"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                Next step
              </p>
              <p className="mt-2 text-lg font-semibold">{journey.nextStep ?? "Continue care"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                Department
              </p>
              <p className="mt-2 text-lg font-semibold">{journey.departmentName ?? "Not assigned"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                Doctor
              </p>
              <p className="mt-2 text-lg font-semibold">{journey.doctorName ?? "Doctor pending"}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Queue estimate
            </p>
            <p className="mt-2 text-lg font-semibold">{journey.estimatedWait ?? "Not available yet"}</p>
          </div>
        </Card>
      ) : (
        <EmptyState
          title="No active hospital journey"
          description="Your hospital journey will appear here when an active visit is linked to your account."
        />
      )}
    </div>
  );
}

export default function PatientJourneyPage() {
  return (
    <Suspense fallback={null}>
      <PatientJourneyContent />
    </Suspense>
  );
}
