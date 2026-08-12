"use client";

import { Mic, MicOff, PhoneOff, Send, Video, VideoOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { apiRequest } from "@/lib/api";
import type { AppointmentRecord } from "@/lib/hospital-data";

type TelemedicineMessage = {
  id: string;
  sessionId: string;
  organizationId: string;
  senderUserId: string;
  senderName: string;
  message: string;
  createdAt: string;
};

type TelemedicineSession = {
  id: string;
  organizationId: string;
  appointmentId: string;
  patientUserId: string;
  doctorUserId: string;
  familyMemberId?: string;
  status: "Scheduled" | "Live" | "Ended";
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type TelemedicinePayload = {
  appointment?: AppointmentRecord;
  session?: TelemedicineSession | null;
  messages?: TelemedicineMessage[];
  message?: TelemedicineMessage;
};

function formatDateTime(value?: string) {
  if (!value) {
    return "Not started";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function TelemedicineSessionView({
  appointmentId,
  roleLabel,
}: {
  appointmentId: string;
  roleLabel: string;
}) {
  const { session } = useAuth();
  const [appointment, setAppointment] = useState<AppointmentRecord | null>(null);
  const [consultation, setConsultation] = useState<TelemedicineSession | null>(null);
  const [messages, setMessages] = useState<TelemedicineMessage[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const loadSession = useCallback(async () => {
    const payload = await apiRequest<TelemedicinePayload>(
      `/api/hospital/telemedicine/appointments/${appointmentId}`,
    );
    setAppointment(payload.appointment ?? null);
    setConsultation(payload.session ?? null);
    setMessages(payload.messages ?? []);
  }, [appointmentId]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        setLoading(true);
        await loadSession();
      } catch (nextError) {
        if (mounted) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Unable to open the consultation session.",
          );
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
  }, [appointmentId, loadSession]);

  useEffect(() => {
    if (!consultation?.id) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadSession().catch(() => undefined);
    }, 4000);

    return () => window.clearInterval(interval);
  }, [consultation?.id, appointmentId, loadSession]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const canJoin = appointment?.consultationMode === "Online";
  const appointmentContext = useMemo(
    () =>
      appointment
        ? `${appointment.patientName} · ${appointment.appointmentDate} at ${appointment.appointmentTime}`
        : "",
    [appointment],
  );

  async function handleJoin() {
    try {
      setError(null);
      const payload = await apiRequest<TelemedicinePayload>(
        `/api/hospital/telemedicine/appointments/${appointmentId}/join`,
        {
          method: "POST",
        },
      );
      setAppointment(payload.appointment ?? null);
      setConsultation(payload.session ?? null);
      setMessages(payload.messages ?? []);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      streamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      await apiRequest<TelemedicinePayload>(
        `/api/hospital/telemedicine/sessions/${payload.session?.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "Live" }),
        },
      );

      setJoined(true);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to join the consultation.",
      );
    }
  }

  async function handleEndCall() {
    if (!consultation?.id) {
      return;
    }

    try {
      await apiRequest<TelemedicinePayload>(
        `/api/hospital/telemedicine/sessions/${consultation.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "Ended" }),
        },
      );
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setJoined(false);
      await loadSession();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to end the consultation.",
      );
    }
  }

  async function handleSendMessage() {
    if (!consultation?.id || !draftMessage.trim()) {
      return;
    }

    try {
      setSending(true);
      const payload = await apiRequest<TelemedicinePayload>(
        `/api/hospital/telemedicine/sessions/${consultation.id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ message: draftMessage }),
        },
      );
      setMessages((current) => [...current, ...(payload.message ? [payload.message] : [])]);
      setDraftMessage("");
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to send the message.",
      );
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) {
      return;
    }

    stream.getAudioTracks().forEach((track) => {
      track.enabled = micEnabled;
    });
  }, [micEnabled]);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream) {
      return;
    }

    stream.getVideoTracks().forEach((track) => {
      track.enabled = cameraEnabled;
    });
  }, [cameraEnabled]);

  if (loading) {
    return (
      <div className="space-y-6 md:space-y-8">
        <PageHeader
          eyebrow={roleLabel}
          title="Online Consultation"
          description="Loading the current session."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 md:space-y-8">
        <PageHeader
          eyebrow={roleLabel}
          title="Online Consultation"
          description="Open the assigned session for your scheduled online appointment."
        />
        <EmptyState title="Session unavailable" description={error} />
      </div>
    );
  }

  if (!appointment || !canJoin) {
    return (
      <div className="space-y-6 md:space-y-8">
        <PageHeader
          eyebrow={roleLabel}
          title="Online Consultation"
          description="Open the assigned session for your scheduled online appointment."
        />
        <EmptyState
          title="No online consultation available"
          description="This appointment is not scheduled as an online consultation."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow={roleLabel}
        title="Online Consultation"
        description="Stay connected to the scheduled online visit and use the consultation chat when needed."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)]">
        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Consultation Room</h2>
              <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                {appointmentContext}
              </p>
            </div>
            <div className="text-sm text-[color:var(--muted-foreground)]">
              Status: {consultation?.status ?? "Scheduled"}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-3xl border border-[color:var(--border)] bg-slate-950">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="aspect-video w-full object-cover"
              />
            </div>
            <div className="rounded-3xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)] p-6">
              <p className="text-sm font-semibold">Participant Context</p>
              <div className="mt-3 space-y-2 text-sm text-[color:var(--muted-foreground)]">
                <p>Patient: {appointment.patientName}</p>
                {appointment.familyMemberId ? <p>Family member consultation</p> : null}
                <p>Appointment: {appointment.id}</p>
                <p>Starts: {appointment.appointmentDate} at {appointment.appointmentTime}</p>
                <p>Session opened: {formatDateTime(consultation?.startedAt ?? consultation?.createdAt)}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {!joined ? (
              <Button type="button" onClick={handleJoin}>
                Join Consultation
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setMicEnabled((current) => !current)}
            >
              {micEnabled ? <Mic className="mr-2 h-4 w-4" /> : <MicOff className="mr-2 h-4 w-4" />}
              {micEnabled ? "Mute Microphone" : "Enable Microphone"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCameraEnabled((current) => !current)}
            >
              {cameraEnabled ? (
                <Video className="mr-2 h-4 w-4" />
              ) : (
                <VideoOff className="mr-2 h-4 w-4" />
              )}
              {cameraEnabled ? "Turn Camera Off" : "Turn Camera On"}
            </Button>
            <Button type="button" variant="danger" onClick={handleEndCall}>
              <PhoneOff className="mr-2 h-4 w-4" />
              End Call
            </Button>
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Consultation Chat</h2>
            <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
              Share consultation notes and coordination messages during the visit.
            </p>
          </div>

          <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
            {messages.length > 0 ? (
              messages.map((message) => {
                const isOwnMessage = message.senderUserId === session.user.id;
                return (
                  <div
                    key={message.id}
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      isOwnMessage
                        ? "ml-8 bg-[color:var(--accent)] text-white"
                        : "mr-8 bg-[color:var(--surface)] text-[color:var(--foreground)]"
                    }`}
                  >
                    <p className="font-semibold">{message.senderName}</p>
                    <p className="mt-2 whitespace-pre-wrap">{message.message}</p>
                    <p
                      className={`mt-2 text-xs ${
                        isOwnMessage ? "text-white/75" : "text-[color:var(--muted-foreground)]"
                      }`}
                    >
                      {formatDateTime(message.createdAt)}
                    </p>
                  </div>
                );
              })
            ) : (
              <EmptyState
                title="No chat messages yet"
                description="Messages sent during this consultation will appear here."
              />
            )}
          </div>

          <div className="flex gap-3">
            <Input
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.target.value)}
              placeholder="Type a consultation message"
            />
            <Button type="button" disabled={sending} onClick={() => void handleSendMessage()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
