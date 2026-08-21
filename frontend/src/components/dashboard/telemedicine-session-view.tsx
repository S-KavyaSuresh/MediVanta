"use client";

import {
  FilePlus2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
  Send,
  Video,
  VideoOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
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

type TelemedicineSignal = {
  id: string;
  senderUserId: string;
  recipientUserId: string;
  signalType: "offer" | "answer" | "ice-candidate" | "hangup";
  payload: string;
  createdAt: string;
};

type TelemedicineSignalPayload = {
  signals?: TelemedicineSignal[];
};

type ConnectionState =
  | "idle"
  | "waiting"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "unsupported"
  | "permission-denied";

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
  const router = useRouter();
  const [appointment, setAppointment] = useState<AppointmentRecord | null>(null);
  const [consultation, setConsultation] = useState<TelemedicineSession | null>(null);
  const [messages, setMessages] = useState<TelemedicineMessage[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [joined, setJoined] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const consultationRoomRef = useRef<HTMLDivElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const signalSessionIdRef = useRef("");
  const remoteParticipantUserIdRef = useRef("");
  const lastSignalAtRef = useRef<string | undefined>(undefined);
  const handledSignalIdsRef = useRef<Set<string>>(new Set());

  const loadSession = useCallback(async () => {
    const payload = await apiRequest<TelemedicinePayload>(
      `/api/hospital/telemedicine/appointments/${appointmentId}`,
    );
    setAppointment(payload.appointment ?? null);
    setConsultation(payload.session ?? null);
    setMessages(payload.messages ?? []);
  }, [appointmentId]);

  const remoteParticipantUserId = useMemo(() => {
    if (!consultation) {
      return "";
    }

    return session.user.id === consultation.doctorUserId
      ? consultation.patientUserId
      : consultation.doctorUserId;
  }, [consultation, session.user.id]);

  const isOfferInitiator = consultation?.doctorUserId === session.user.id;

  useEffect(() => {
    signalSessionIdRef.current = consultation?.id ?? "";
    remoteParticipantUserIdRef.current = remoteParticipantUserId;
  }, [consultation?.id, remoteParticipantUserId]);

  const mergeMessages = useCallback((nextMessages: TelemedicineMessage[]) => {
    setMessages((current) => {
      const merged = new Map(current.map((message) => [message.id, message]));

      for (const message of nextMessages) {
        merged.set(message.id, message);
      }

      return [...merged.values()].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      );
    });
  }, []);

  const sendSignal = useCallback(
    async (signalType: TelemedicineSignal["signalType"], payload: unknown) => {
      if (!consultation?.id || !remoteParticipantUserId) {
        return;
      }

      await apiRequest(`/api/hospital/telemedicine/sessions/${consultation.id}/signals`, {
        method: "POST",
        body: JSON.stringify({
          recipientUserId: remoteParticipantUserId,
          signalType,
          payload: JSON.stringify(payload),
        }),
      });
    },
    [consultation, remoteParticipantUserId],
  );

  const sendSignalForSession = useCallback(
    async (
      sessionId: string,
      recipientUserId: string,
      signalType: TelemedicineSignal["signalType"],
      payload: unknown,
    ) => {
      await apiRequest(`/api/hospital/telemedicine/sessions/${sessionId}/signals`, {
        method: "POST",
        body: JSON.stringify({
          recipientUserId,
          signalType,
          payload: JSON.stringify(payload),
        }),
      });
    },
    [],
  );

  const stopLocalMedia = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  const closePeerConnection = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    remoteStreamRef.current = null;
    handledSignalIdsRef.current.clear();
    lastSignalAtRef.current = undefined;

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const cleanupCall = useCallback(() => {
    closePeerConnection();
    stopLocalMedia();
    setJoined(false);
  }, [closePeerConnection, stopLocalMedia]);

  const getPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    if (typeof RTCPeerConnection === "undefined") {
      setConnectionState("unsupported");
      throw new Error("This browser does not support online video consultations.");
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const sessionId = signalSessionIdRef.current;
        const recipientUserId = remoteParticipantUserIdRef.current;

        if (!sessionId || !recipientUserId) {
          return;
        }

        void sendSignalForSession(
          sessionId,
          recipientUserId,
          "ice-candidate",
          event.candidate.toJSON(),
        ).catch(() => undefined);
      }
    };

    peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;

      if (remoteStream) {
        remoteStreamRef.current = remoteStream;

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }

        setConnectionState("connected");
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;

      if (state === "connected") {
        setConnectionState("connected");
      } else if (state === "failed") {
        setConnectionState("failed");
      } else if (state === "disconnected" || state === "closed") {
        setConnectionState("disconnected");
      } else if (state === "connecting") {
        setConnectionState("connecting");
      }
    };

    peerConnectionRef.current = peerConnection;
    return peerConnection;
  }, [sendSignalForSession]);

  const handleSignal = useCallback(
    async (signal: TelemedicineSignal) => {
      if (handledSignalIdsRef.current.has(signal.id)) {
        return;
      }

      handledSignalIdsRef.current.add(signal.id);
      lastSignalAtRef.current = signal.createdAt;

      if (signal.signalType === "hangup") {
        cleanupCall();
        setConnectionState("disconnected");
        return;
      }

      const peerConnection = getPeerConnection();
      const payload = JSON.parse(signal.payload) as RTCSessionDescriptionInit | RTCIceCandidateInit;

      if (signal.signalType === "offer") {
        setConnectionState("connecting");
        await peerConnection.setRemoteDescription(payload as RTCSessionDescriptionInit);

        streamRef.current?.getTracks().forEach((track) => {
          if (!peerConnection.getSenders().some((sender) => sender.track === track)) {
            peerConnection.addTrack(track, streamRef.current!);
          }
        });

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await sendSignal("answer", answer);
      } else if (signal.signalType === "answer") {
        await peerConnection.setRemoteDescription(payload as RTCSessionDescriptionInit);
      } else if (signal.signalType === "ice-candidate") {
        await peerConnection.addIceCandidate(payload as RTCIceCandidateInit);
      }
    },
    [cleanupCall, getPeerConnection, sendSignal],
  );

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
      void loadSession()
        .then(() => undefined)
        .catch(() => undefined);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [consultation?.id, appointmentId, loadSession]);

  useEffect(() => {
    if (!consultation?.id || !joined) {
      return;
    }

    const pollSignals = async () => {
      try {
        const query = lastSignalAtRef.current
          ? `?since=${encodeURIComponent(lastSignalAtRef.current)}`
          : "";
        const payload = await apiRequest<TelemedicineSignalPayload>(
          `/api/hospital/telemedicine/sessions/${consultation.id}/signals${query}`,
        );

        for (const signal of payload.signals ?? []) {
          await handleSignal(signal);
        }
      } catch {
        setConnectionState((current) => (current === "connected" ? current : "failed"));
      }
    };

    void pollSignals();
    const interval = window.setInterval(() => {
      void pollSignals();
    }, 1500);

    return () => window.clearInterval(interval);
  }, [consultation?.id, handleSignal, joined]);

  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, [cleanupCall]);

  useEffect(() => {
    const updateFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === consultationRoomRef.current);
    };

    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
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

      signalSessionIdRef.current = payload.session?.id ?? "";
      remoteParticipantUserIdRef.current =
        payload.session?.doctorUserId === session.user.id
          ? (payload.session?.patientUserId ?? "")
          : (payload.session?.doctorUserId ?? "");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      streamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setConnectionState("waiting");
      const peerConnection = getPeerConnection();
      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      const statusPayload = await apiRequest<TelemedicinePayload>(
        `/api/hospital/telemedicine/sessions/${payload.session?.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "Live" }),
        },
      );
      setAppointment(statusPayload.appointment ?? payload.appointment ?? null);
      setConsultation(statusPayload.session ?? payload.session ?? null);

      setJoined(true);

      if (isOfferInitiator || payload.session?.doctorUserId === session.user.id) {
        setConnectionState("connecting");
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        if (payload.session) {
          await sendSignalForSession(
            payload.session.id,
            payload.session.patientUserId,
            "offer",
            offer,
          );
        }
      }
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : "Unable to join the consultation.";
      setConnectionState(
        message.toLowerCase().includes("permission") ||
          message.toLowerCase().includes("denied")
          ? "permission-denied"
          : "failed",
      );
      setError(
        message,
      );
      cleanupCall();
    }
  }

  async function handleLeaveCall() {
    if (!consultation?.id) {
      return;
    }

    try {
      await sendSignal("hangup", { reason: "left" });
      cleanupCall();
      setConnectionState("disconnected");
    } catch {
      cleanupCall();
      setConnectionState("disconnected");
    }
  }

  async function handleToggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await consultationRoomRef.current?.requestFullscreen();
    } catch {
      setError("Fullscreen mode is not available in this browser.");
    }
  }

  async function handleCompleteConsultation() {
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
      await sendSignal("hangup", { reason: "left" });
      cleanupCall();
      setConnectionState("disconnected");
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
      if (payload.message) {
        mergeMessages([payload.message]);
      }
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

  const connectionLabel =
    connectionState === "connected"
      ? "Connected"
      : connectionState === "connecting"
        ? "Connecting"
        : connectionState === "waiting"
          ? "Waiting for participant"
          : connectionState === "disconnected"
            ? "Participant disconnected"
            : connectionState === "permission-denied"
              ? "Permission denied"
              : connectionState === "unsupported"
                ? "Unsupported browser"
                : connectionState === "failed"
                  ? "Connection failed"
                  : "Not joined";

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
        <div
          ref={consultationRoomRef}
          className="rounded-2xl fullscreen:bg-[color:var(--surface)] fullscreen:p-6"
        >
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
              <div className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                You
              </div>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="aspect-video w-full object-cover"
                style={{ transform: "none" }}
              />
            </div>
            <div className="overflow-hidden rounded-3xl border border-[color:var(--border)] bg-slate-950">
              <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                <span>Remote participant</span>
                <span>{connectionLabel}</span>
              </div>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="aspect-video w-full object-cover"
                style={{ transform: "none" }}
              />
            </div>
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

          <div className="flex flex-wrap gap-3">
            {!joined ? (
              <Button type="button" onClick={handleJoin}>
                Join Consultation
              </Button>
            ) : null}
            {joined ? (
              <>
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
                <Button type="button" variant="secondary" onClick={handleToggleFullscreen}>
                  {isFullscreen ? (
                    <Minimize2 className="mr-2 h-4 w-4" />
                  ) : (
                    <Maximize2 className="mr-2 h-4 w-4" />
                  )}
                  {isFullscreen ? "Exit Full Screen" : "Full Screen"}
                </Button>
                <Button type="button" variant="danger" onClick={handleLeaveCall}>
                  <PhoneOff className="mr-2 h-4 w-4" />
                  Leave Consultation
                </Button>
                {session.user.role === "doctor" ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        router.push(
                          `/dashboard/doctor/prescriptions?appointmentId=${encodeURIComponent(appointment.id)}&returnTo=${encodeURIComponent(`/dashboard/doctor/consultations/${appointment.id}`)}`,
                        )
                      }
                    >
                      <FilePlus2 className="mr-2 h-4 w-4" />
                      Create Prescription
                    </Button>
                    <Button type="button" onClick={handleCompleteConsultation}>
                      Complete Consultation
                    </Button>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
          </Card>
        </div>

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
