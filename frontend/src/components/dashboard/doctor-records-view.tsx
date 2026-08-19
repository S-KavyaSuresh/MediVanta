"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import {
  FilePlus2,
  FlaskConical,
  Paperclip,
  ShieldPlus,
  Syringe,
} from "lucide-react";

import {
  DatePickerField,
  TimePickerField,
} from "@/components/dashboard/appointment-form-modal";
import {
  LabReportViewModal,
  downloadLabReport,
} from "@/components/dashboard/lab-report-view-modal";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  AppointmentRecord,
  ClinicalAttachmentDraft,
  LabReportRecord,
  LabRequestDraft,
  MedicalHistoryEntryDraft,
  MedicalRecordDraft,
  MedicalRecordRecord,
} from "@/lib/hospital-data";
import {
  getCurrentLocalDateIso,
  isLabSlotFullyBooked,
  validateLabRequestDraft,
} from "@/lib/hospital-data";

type ClinicalAction =
  | "medical-record"
  | "lab-request"
  | "vaccination"
  | "surgery"
  | "attachment";

type HistoryFilter =
  | "All"
  | "Medical Records"
  | "Lab Requests"
  | "Lab Reports"
  | "Vaccinations"
  | "Surgeries"
  | "Clinical Attachments";

const todayIso = getCurrentLocalDateIso();
const labTimeSlots = [
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
] as const;

function formatVisitDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
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

function compareOptionalCreatedAtDesc(
  left: { createdAt?: string },
  right: { createdAt?: string },
) {
  return (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
}

function buildMedicalRecordDraft(patientId = "", appointmentId = ""): MedicalRecordDraft {
  return {
    patientId,
    appointmentId,
    visitDate: todayIso,
    diagnosis: "",
    clinicalNotes: "",
    treatmentAdvice: "",
  };
}

function buildLabRequestDraft(patientId = ""): LabRequestDraft {
  return {
    patientId,
    appointmentId: "",
    testId: "",
    requestedDate: todayIso,
    requestedTime: "",
    clinicalNotes: "",
    familyMemberId: "",
  };
}

function buildHistoryDraft(
  category: MedicalHistoryEntryDraft["category"],
  patientId = "",
): MedicalHistoryEntryDraft {
  return {
    patientId,
    category,
    title: "",
    details: "",
    recordedDate: todayIso,
    familyMemberId: "",
  };
}

function buildAttachmentDraft(patientId = ""): ClinicalAttachmentDraft {
  return {
    patientId,
    label: "",
    fileName: "",
    contentType: "application/pdf",
    fileSize: 0,
    contentBase64: "",
    familyMemberId: "",
    medicalRecordId: "",
  };
}

function canEditRecord(record: MedicalRecordRecord) {
  const createdAt = new Date(record.createdAt).getTime();

  if (Number.isNaN(createdAt)) {
    return false;
  }

  return Date.now() - createdAt <= 3 * 60 * 60 * 1000;
}

function isRelevantLabAppointment(appointment: AppointmentRecord) {
  if (appointment.status === "Cancelled" || appointment.status === "No Show") {
    return false;
  }

  if (appointment.appointmentDate > todayIso) {
    return (
      appointment.status === "Scheduled" ||
      appointment.status === "Checked in" ||
      appointment.status === "In consultation"
    );
  }

  if (appointment.appointmentDate === todayIso) {
    return (
      appointment.status === "Scheduled" ||
      appointment.status === "Checked in" ||
      appointment.status === "In consultation" ||
      appointment.status === "Completed"
    );
  }

  return false;
}

function sectionMatches(filter: HistoryFilter, section: Exclude<HistoryFilter, "All">) {
  return filter === "All" || filter === section;
}

export function DoctorRecordsView() {
  const {
    createClinicalAttachment,
    createLabRequest,
    createMedicalHistoryEntry,
    createMedicalRecord,
    meta,
    state,
    updateMedicalRecord,
  } = useHospitalData();
  const [selectedReport, setSelectedReport] = useState<LabReportRecord | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("All");
  const [activeAction, setActiveAction] = useState<ClinicalAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [labDraft, setLabDraft] = useState<LabRequestDraft>(buildLabRequestDraft());
  const [labErrors, setLabErrors] = useState<Partial<Record<keyof LabRequestDraft, string>>>({});
  const [labMessage, setLabMessage] = useState<string | null>(null);
  const [labSubmitting, setLabSubmitting] = useState(false);
  const [historyDraft, setHistoryDraft] = useState<MedicalHistoryEntryDraft>(
    buildHistoryDraft("Vaccination"),
  );
  const [historyErrors, setHistoryErrors] = useState<Record<string, string>>({});
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [historySubmitting, setHistorySubmitting] = useState(false);
  const [attachmentDraft, setAttachmentDraft] = useState<ClinicalAttachmentDraft>(
    buildAttachmentDraft(),
  );
  const [attachmentErrors, setAttachmentErrors] = useState<Record<string, string>>({});
  const [attachmentMessage, setAttachmentMessage] = useState<string | null>(null);
  const [attachmentSubmitting, setAttachmentSubmitting] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    diagnosis: "",
    clinicalNotes: "",
    treatmentAdvice: "",
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const patientOptions = useMemo(() => {
    const grouped = new Map<
      string,
      { patientId: string; patientName: string; appointments: AppointmentRecord[] }
    >();

    for (const appointment of state.appointments) {
      const patientId =
        appointment.patientId ??
        `external:${appointment.patientName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const existing = grouped.get(patientId);

      if (existing) {
        existing.appointments.push(appointment);
        continue;
      }

      grouped.set(patientId, {
        patientId,
        patientName: appointment.patientName,
        appointments: [appointment],
      });
    }

    return [...grouped.values()].map((patient) => ({
      ...patient,
      appointments: [...patient.appointments].sort((left, right) =>
        `${right.appointmentDate}${right.appointmentTime}`.localeCompare(
          `${left.appointmentDate}${left.appointmentTime}`,
        ),
      ),
    }));
  }, [state.appointments]);

  const appointmentOptionsByPatient = useMemo(
    () =>
      new Map(
        patientOptions.map((patient) => [
          patient.patientId,
          patient.appointments.filter(isRelevantLabAppointment),
        ]),
      ),
    [patientOptions],
  );

  const [draft, setDraft] = useState<MedicalRecordDraft>(buildMedicalRecordDraft());

  const activePatientId =
    draft.patientId && patientOptions.some((patient) => patient.patientId === draft.patientId)
      ? draft.patientId
      : (patientOptions[0]?.patientId ?? "");
  const selectedPatient = patientOptions.find((patient) => patient.patientId === activePatientId);
  const activeAppointmentId =
    draft.appointmentId &&
    selectedPatient?.appointments.some((appointment) => appointment.id === draft.appointmentId)
      ? draft.appointmentId
      : (selectedPatient?.appointments[0]?.id ?? "");

  const activeLabPatientId =
    labDraft.patientId && patientOptions.some((patient) => patient.patientId === labDraft.patientId)
      ? labDraft.patientId
      : activePatientId;
  const selectedLabPatient = patientOptions.find((patient) => patient.patientId === activeLabPatientId);
  const relevantLabAppointments = appointmentOptionsByPatient.get(activeLabPatientId) ?? [];
  const activeLabAppointmentId =
    labDraft.appointmentId &&
    relevantLabAppointments.some((appointment) => appointment.id === labDraft.appointmentId)
      ? labDraft.appointmentId
      : "";
  const selectedLabAppointment = relevantLabAppointments.find(
    (appointment) => appointment.id === activeLabAppointmentId,
  );

  const activeHistoryPatientId =
    historyDraft.patientId &&
    patientOptions.some((patient) => patient.patientId === historyDraft.patientId)
      ? historyDraft.patientId
      : activePatientId;

  const activeAttachmentPatientId =
    attachmentDraft.patientId &&
    patientOptions.some((patient) => patient.patientId === attachmentDraft.patientId)
      ? attachmentDraft.patientId
      : activePatientId;

  const familyMemberNameById = useMemo(
    () => new Map((state.familyMembers ?? []).map((member) => [member.id, member.fullName] as const)),
    [state.familyMembers],
  );

  const familyMembersByPatientId = useMemo(() => {
    const map = new Map<string, NonNullable<typeof state.familyMembers>>();

    for (const patient of patientOptions) {
      const familyMemberIds = new Set(
        patient.appointments
          .map((appointment) => appointment.familyMemberId)
          .filter((value): value is string => Boolean(value)),
      );

      map.set(
        patient.patientId,
        (state.familyMembers ?? []).filter((member) => familyMemberIds.has(member.id)),
      );
    }

    return map;
  }, [patientOptions, state.familyMembers]);

  const labFamilyMembers = familyMembersByPatientId.get(activeLabPatientId) ?? [];
  const historyFamilyMembers = familyMembersByPatientId.get(activeHistoryPatientId) ?? [];
  const attachmentFamilyMembers = familyMembersByPatientId.get(activeAttachmentPatientId) ?? [];

  const recentMedicalRecords = useMemo(
    () =>
      [...state.medicalRecords]
        .filter((record) => patientOptions.some((patient) => patient.patientId === record.patientId))
        .sort((left, right) =>
          `${right.visitDate}${right.createdAt}`.localeCompare(`${left.visitDate}${left.createdAt}`),
        )
        .slice(0, 3),
    [patientOptions, state.medicalRecords],
  );

  const recentLabRequests = useMemo(
    () =>
      [...state.labRequests]
        .filter((request) => patientOptions.some((patient) => patient.patientId === request.patientId))
        .sort(compareOptionalCreatedAtDesc)
        .slice(0, 3),
    [patientOptions, state.labRequests],
  );

  const recentLabReports = useMemo(() => {
    const requestsById = new Map(state.labRequests.map((request) => [request.id, request] as const));

    return [...state.labReports]
      .map((report) => ({ report, request: requestsById.get(report.labRequestId) }))
      .filter(({ request }) =>
        request ? patientOptions.some((patient) => patient.patientId === request.patientId) : false,
      )
      .sort(
        (left, right) =>
          new Date(right.report.uploadedAt).getTime() - new Date(left.report.uploadedAt).getTime(),
      )
      .slice(0, 3);
  }, [patientOptions, state.labReports, state.labRequests]);

  const recentVaccinations = useMemo(
    () =>
      [...(state.medicalHistoryEntries ?? [])]
        .filter(
          (entry) =>
            entry.category === "Vaccination" &&
            patientOptions.some((patient) => patient.patientId === entry.patientUserId),
        )
        .sort((left, right) =>
          `${right.recordedDate}${right.createdAt}`.localeCompare(`${left.recordedDate}${left.createdAt}`),
        )
        .slice(0, 3),
    [patientOptions, state.medicalHistoryEntries],
  );

  const recentSurgeries = useMemo(
    () =>
      [...(state.medicalHistoryEntries ?? [])]
        .filter(
          (entry) =>
            entry.category === "Surgery" &&
            patientOptions.some((patient) => patient.patientId === entry.patientUserId),
        )
        .sort((left, right) =>
          `${right.recordedDate}${right.createdAt}`.localeCompare(`${left.recordedDate}${left.createdAt}`),
        )
        .slice(0, 3),
    [patientOptions, state.medicalHistoryEntries],
  );

  const recentAttachments = useMemo(
    () =>
      [...(state.clinicalAttachments ?? [])]
        .filter((attachment) =>
          patientOptions.some((patient) => patient.patientId === attachment.patientUserId),
        )
        .sort(compareOptionalCreatedAtDesc)
        .slice(0, 3),
    [patientOptions, state.clinicalAttachments],
  );

  const labCapacityState = useMemo(() => ({ ...state, labRequests: state.labRequests }), [state]);
  const busyLabSlots = useMemo(
    () =>
      new Set(
        labDraft.requestedDate
          ? labTimeSlots.filter(
              (slot) =>
                (meta?.labSlotLoads?.find(
                  (load) =>
                    load.requestedDate === labDraft.requestedDate &&
                    load.requestedTime === slot,
                )?.bookings ?? 0) >= state.bookingCapacity.labSlotCapacity ||
                isLabSlotFullyBooked(labCapacityState, labDraft.requestedDate, slot),
            )
          : [],
      ),
    [labCapacityState, labDraft.requestedDate, meta?.labSlotLoads, state.bookingCapacity.labSlotCapacity],
  );

  const actionCards = [
    {
      id: "medical-record" as const,
      title: "New Medical Record",
      description: "Document diagnosis, notes, and treatment advice.",
      icon: FilePlus2,
    },
    {
      id: "lab-request" as const,
      title: "Order Lab Test",
      description: "Create a shared laboratory request for the current patient context.",
      icon: FlaskConical,
    },
    {
      id: "vaccination" as const,
      title: "Add Vaccination",
      description: "Record a structured vaccination entry.",
      icon: Syringe,
    },
    {
      id: "surgery" as const,
      title: "Add Surgery",
      description: "Record a structured procedure or surgery entry.",
      icon: ShieldPlus,
    },
    {
      id: "attachment" as const,
      title: "Upload Clinical Attachment",
      description: "Attach PDFs and clinical images to the patient record context.",
      icon: Paperclip,
    },
  ];

  function openAction(action: ClinicalAction) {
    const defaultPatientId = patientOptions[0]?.patientId ?? "";
    const nextMedicalRecordPatientId = activePatientId || defaultPatientId;
    const nextMedicalRecordPatient = patientOptions.find(
      (patient) => patient.patientId === nextMedicalRecordPatientId,
    );
    const nextLabPatientId = activeLabPatientId || activePatientId || defaultPatientId;
    const nextHistoryPatientId = activeHistoryPatientId || activePatientId || defaultPatientId;
    const nextAttachmentPatientId =
      activeAttachmentPatientId || activePatientId || defaultPatientId;

    setActiveAction(action);
    setMessage(null);
    setLabMessage(null);
    setHistoryMessage(null);
    setAttachmentMessage(null);
    setFieldErrors({});
    setLabErrors({});
    setHistoryErrors({});
    setAttachmentErrors({});

    if (action === "medical-record") {
      setDraft(
        buildMedicalRecordDraft(
          nextMedicalRecordPatientId,
          nextMedicalRecordPatient?.appointments[0]?.id ?? "",
        ),
      );
      return;
    }

    if (action === "lab-request") {
      setLabDraft(buildLabRequestDraft(nextLabPatientId));
      return;
    }

    if (action === "vaccination") {
      setHistoryDraft(buildHistoryDraft("Vaccination", nextHistoryPatientId));
      return;
    }

    if (action === "surgery") {
      setHistoryDraft(buildHistoryDraft("Surgery", nextHistoryPatientId));
      return;
    }

    setAttachmentDraft(buildAttachmentDraft(nextAttachmentPatientId));
  }

  function closeActionModal() {
    setActiveAction(null);
    setMessage(null);
    setLabMessage(null);
    setHistoryMessage(null);
    setAttachmentMessage(null);
    setFieldErrors({});
    setLabErrors({});
    setHistoryErrors({});
    setAttachmentErrors({});
  }

  async function onSubmitMedicalRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const result = await createMedicalRecord({
      ...draft,
      patientId: activePatientId,
      appointmentId: activeAppointmentId || undefined,
    });
    setSubmitting(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      setMessage(result.message ?? "The medical record could not be saved.");
      return;
    }

    setFieldErrors({});
    setMessage(null);
    setDraft(buildMedicalRecordDraft(activePatientId, ""));
    closeActionModal();
  }

  async function onSubmitLabRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (labSubmitting) {
      return;
    }

    setLabSubmitting(true);
    setLabMessage(null);

    const submissionDraft: LabRequestDraft = {
      ...labDraft,
      patientId: activeLabPatientId,
      appointmentId: activeLabAppointmentId || undefined,
      familyMemberId:
        selectedLabAppointment?.familyMemberId ??
        labDraft.familyMemberId ??
        undefined,
      clinicalNotes: labDraft.clinicalNotes?.trim() || undefined,
    };

    const validation = validateLabRequestDraft(labCapacityState, submissionDraft);
    if (!validation.isValid) {
      setLabErrors(validation.errors);
      setLabSubmitting(false);
      return;
    }

    const result = await createLabRequest(submissionDraft);
    setLabSubmitting(false);

    if (!result.ok) {
      setLabErrors(result.fieldErrors ?? {});
      setLabMessage(result.message ?? "The laboratory request could not be created.");
      return;
    }

    setLabErrors({});
    setLabMessage(null);
    setLabDraft(buildLabRequestDraft(activeLabPatientId));
    closeActionModal();
  }

  async function onSubmitHistory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (historySubmitting) {
      return;
    }

    const currentCategory = activeAction === "surgery" ? "Surgery" : "Vaccination";
    const nextErrors: Record<string, string> = {};

    if (!activeHistoryPatientId) {
      nextErrors.patientId = "Select a patient.";
    }

    if (!historyDraft.recordedDate) {
      nextErrors.recordedDate =
        currentCategory === "Vaccination"
          ? "Select the vaccination date."
          : "Select the surgery date.";
    }

    if (!historyDraft.title.trim()) {
      nextErrors.title =
        currentCategory === "Vaccination"
          ? "Enter the vaccine name."
          : "Enter the surgery/procedure name.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setHistoryErrors(nextErrors);
      setHistoryMessage(null);
      return;
    }

    setHistorySubmitting(true);
    setHistoryMessage(null);
    const result = await createMedicalHistoryEntry({
      ...historyDraft,
      category: currentCategory,
      patientId: activeHistoryPatientId,
      familyMemberId: historyDraft.familyMemberId || undefined,
      details: historyDraft.details?.trim() || undefined,
    });
    setHistorySubmitting(false);

    if (!result.ok) {
      setHistoryErrors(result.fieldErrors ?? {});
      setHistoryMessage(result.message ?? "The clinical history entry could not be saved.");
      return;
    }

    setHistoryErrors({});
    setHistoryMessage(null);
    setHistoryDraft(buildHistoryDraft(currentCategory, activeHistoryPatientId));
    closeActionModal();
  }

  async function handleAttachmentFile(file: File | null) {
    if (!file) {
      return;
    }

    const contentBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result ?? "");
        resolve(value.includes(",") ? value.split(",")[1] ?? "" : value);
      };
      reader.onerror = () => reject(new Error("Unable to read the selected file."));
      reader.readAsDataURL(file);
    });

    setAttachmentDraft((current) => ({
      ...current,
      fileName: file.name,
      fileSize: file.size,
      contentType:
        file.type === "image/png" || file.type === "image/jpeg"
          ? (file.type as "image/png" | "image/jpeg")
          : "application/pdf",
      contentBase64,
    }));
  }

  async function onSubmitAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (attachmentSubmitting) {
      return;
    }

    setAttachmentSubmitting(true);
    setAttachmentMessage(null);
    const result = await createClinicalAttachment({
      ...attachmentDraft,
      patientId: activeAttachmentPatientId,
      familyMemberId: attachmentDraft.familyMemberId || undefined,
      medicalRecordId: attachmentDraft.medicalRecordId || undefined,
    });
    setAttachmentSubmitting(false);

    if (!result.ok) {
      setAttachmentErrors(result.fieldErrors ?? {});
      setAttachmentMessage(result.message ?? "The clinical attachment could not be uploaded.");
      return;
    }

    setAttachmentErrors({});
    setAttachmentMessage(null);
    setAttachmentDraft(buildAttachmentDraft(activeAttachmentPatientId));
    closeActionModal();
  }

  const actionModalTitle =
    activeAction === "medical-record"
      ? "New Medical Record"
      : activeAction === "lab-request"
        ? "Order Lab Test"
        : activeAction === "vaccination"
          ? "Add Vaccination"
          : activeAction === "surgery"
            ? "Add Surgery"
            : activeAction === "attachment"
              ? "Upload Clinical Attachment"
              : "";

  const actionModalDescription =
    activeAction === "medical-record"
      ? "Use the existing clinical record workflow for patients already in your care."
      : activeAction === "lab-request"
        ? "Create a follow-up or visit-linked laboratory request without leaving the doctor workspace."
        : activeAction === "vaccination"
          ? "Record a vaccination entry with structured patient or dependent context."
          : activeAction === "surgery"
            ? "Record a surgery or procedure entry with structured patient or dependent context."
            : activeAction === "attachment"
              ? "Upload a PDF or image into the existing clinical attachment workflow."
              : "";

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Doctor Workspace"
        title="Medical Records"
        description="Use focused clinical actions and review recent patient record activity without leaving the current doctor workspace."
      />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">Clinical Actions</h2>
            <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
              Open the exact form you need for the current patient workflow.
            </p>
          </div>
          <Link
            href="/dashboard/doctor/history?tab=medical-records"
            className="inline-flex items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2.5 text-sm font-semibold text-[color:var(--foreground)] transition hover:bg-[color:var(--surface-muted)]"
          >
            Doctor History
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {actionCards.map((action) => (
            <button
              key={action.id}
              type="button"
              className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-left transition hover:bg-[color:var(--surface-muted)]"
              onClick={() => openAction(action.id)}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-[color:var(--surface-muted)] p-2 text-[color:var(--accent)]">
                  <action.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold">{action.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                    {action.description}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">Recent &amp; Related History</h2>
            <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
              Review only the latest related records here. Full record history stays in Doctor History.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                "All",
                "Medical Records",
                "Lab Requests",
                "Lab Reports",
                "Vaccinations",
                "Surgeries",
                "Clinical Attachments",
              ] as HistoryFilter[]
            ).map((filter) => (
              <Button
                key={filter}
                type="button"
                variant={historyFilter === filter ? "primary" : "secondary"}
                size="sm"
                onClick={() => setHistoryFilter(filter)}
              >
                {filter}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {sectionMatches(historyFilter, "Medical Records") ? (
            <Card className="space-y-4 border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">Medical Records</h3>
                <Link
                  href="/dashboard/doctor/history?tab=medical-records"
                  className="text-sm font-semibold text-[color:var(--accent)]"
                >
                  View full history
                </Link>
              </div>
              {recentMedicalRecords.length > 0 ? (
                <div className="space-y-3">
                  {recentMedicalRecords.map((record) => {
                    const editable = canEditRecord(record);
                    const isEditing = editingRecordId === record.id;

                    return (
                      <div
                        key={record.id}
                        className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold">{record.patientName}</p>
                            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                              {record.familyMemberId
                                ? `Dependent: ${familyMemberNameById.get(record.familyMemberId) ?? record.patientName}`
                                : "Primary patient"}
                            </p>
                            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                              {record.diagnosis} · {formatVisitDate(record.visitDate)}
                            </p>
                          </div>
                          {editable ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setEditingRecordId(record.id);
                                setEditDraft({
                                  diagnosis: record.diagnosis,
                                  clinicalNotes: record.clinicalNotes,
                                  treatmentAdvice: record.treatmentAdvice,
                                });
                                setEditErrors({});
                                setEditMessage(null);
                              }}
                            >
                              Edit
                            </Button>
                          ) : null}
                        </div>
                        {isEditing ? (
                          <div className="mt-3 space-y-3">
                            <Input
                              value={editDraft.diagnosis}
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  diagnosis: event.target.value,
                                }))
                              }
                            />
                            {editErrors.diagnosis ? (
                              <p className="text-sm text-rose-600 dark:text-rose-300">
                                {editErrors.diagnosis}
                              </p>
                            ) : null}
                            <Textarea
                              value={editDraft.clinicalNotes}
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  clinicalNotes: event.target.value,
                                }))
                              }
                            />
                            <Textarea
                              value={editDraft.treatmentAdvice}
                              onChange={(event) =>
                                setEditDraft((current) => ({
                                  ...current,
                                  treatmentAdvice: event.target.value,
                                }))
                              }
                            />
                            {editMessage ? (
                              <p className="text-sm text-[color:var(--muted-foreground)]">
                                {editMessage}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setEditingRecordId(null);
                                  setEditErrors({});
                                  setEditMessage(null);
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                disabled={editSubmitting}
                                onClick={async () => {
                                  if (editSubmitting) {
                                    return;
                                  }

                                  setEditSubmitting(true);
                                  const result = await updateMedicalRecord(record.id, editDraft);
                                  setEditSubmitting(false);

                                  if (!result.ok) {
                                    setEditErrors(result.fieldErrors ?? {});
                                    setEditMessage(
                                      result.message ?? "The medical record could not be updated.",
                                    );
                                    return;
                                  }

                                  setEditingRecordId(null);
                                  setEditErrors({});
                                  setEditMessage(null);
                                }}
                              >
                                {editSubmitting ? "Saving..." : "Save Changes"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-3 text-sm leading-6 text-[color:var(--muted-foreground)]">
                            {record.clinicalNotes}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="No recent medical records"
                  description="Recently documented visit records will appear here."
                />
              )}
            </Card>
          ) : null}

          {sectionMatches(historyFilter, "Lab Requests") ? (
            <Card className="space-y-4 border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
              <h3 className="text-lg font-semibold">Lab Requests</h3>
              {recentLabRequests.length > 0 ? (
                <div className="space-y-3">
                  {recentLabRequests.map((request) => (
                    <div
                      key={request.id}
                      className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={request.status} />
                        <p className="text-sm text-[color:var(--muted-foreground)]">
                          {request.requestedDate} at {request.requestedTime}
                        </p>
                      </div>
                      <p className="mt-3 font-semibold">{request.testName}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                        {request.patientName}
                        {request.familyMemberId
                          ? ` · Dependent: ${familyMemberNameById.get(request.familyMemberId) ?? request.patientName}`
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No recent lab requests"
                  description="Recent laboratory requests for your patient scope will appear here."
                />
              )}
            </Card>
          ) : null}

          {sectionMatches(historyFilter, "Lab Reports") ? (
            <Card className="space-y-4 border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
              <h3 className="text-lg font-semibold">Lab Reports</h3>
              {recentLabReports.length > 0 ? (
                <div className="space-y-3">
                  {recentLabReports.map(({ report, request }) => (
                    <div
                      key={report.id}
                      className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
                    >
                      <p className="font-semibold">{report.testName}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                        {request?.patientName ?? "Linked patient"}
                        {report.familyMemberId
                          ? ` · Dependent: ${familyMemberNameById.get(report.familyMemberId) ?? request?.patientName ?? "Dependent"}`
                          : ""}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                        Uploaded {formatDateTime(report.uploadedAt)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button type="button" variant="secondary" onClick={() => setSelectedReport(report)}>
                          View Report
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            void downloadLabReport(report, state.organization.name);
                          }}
                        >
                          Download Report
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No recent lab reports"
                  description="Completed reports for your recent patient scope will appear here."
                />
              )}
            </Card>
          ) : null}

          {sectionMatches(historyFilter, "Vaccinations") ? (
            <Card className="space-y-4 border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
              <h3 className="text-lg font-semibold">Vaccinations</h3>
              {recentVaccinations.length > 0 ? (
                <div className="space-y-3">
                  {recentVaccinations.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
                    >
                      <p className="font-semibold">{entry.title}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                        {entry.familyMemberId
                          ? `Dependent: ${familyMemberNameById.get(entry.familyMemberId) ?? "Dependent"}`
                          : "Primary patient"}{" "}
                        · {formatVisitDate(entry.recordedDate)}
                      </p>
                      {entry.details ? (
                        <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">{entry.details}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No recent vaccinations"
                  description="Recent vaccination entries will appear here."
                />
              )}
            </Card>
          ) : null}

          {sectionMatches(historyFilter, "Surgeries") ? (
            <Card className="space-y-4 border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
              <h3 className="text-lg font-semibold">Surgeries</h3>
              {recentSurgeries.length > 0 ? (
                <div className="space-y-3">
                  {recentSurgeries.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
                    >
                      <p className="font-semibold">{entry.title}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                        {entry.familyMemberId
                          ? `Dependent: ${familyMemberNameById.get(entry.familyMemberId) ?? "Dependent"}`
                          : "Primary patient"}{" "}
                        · {formatVisitDate(entry.recordedDate)}
                      </p>
                      {entry.details ? (
                        <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">{entry.details}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No recent surgeries"
                  description="Recent surgery or procedure entries will appear here."
                />
              )}
            </Card>
          ) : null}

          {sectionMatches(historyFilter, "Clinical Attachments") ? (
            <Card className="space-y-4 border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
              <h3 className="text-lg font-semibold">Clinical Attachments</h3>
              {recentAttachments.length > 0 ? (
                <div className="space-y-3">
                  {recentAttachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
                    >
                      <p className="font-semibold">{attachment.label}</p>
                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                        {attachment.fileName}
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                        {attachment.familyMemberId
                          ? `Dependent: ${familyMemberNameById.get(attachment.familyMemberId) ?? "Dependent"}`
                          : "Primary patient"}{" "}
                        · Uploaded {formatDateTime(attachment.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No recent clinical attachments"
                  description="Recent clinical files in your patient scope will appear here."
                />
              )}
            </Card>
          ) : null}
        </div>
      </Card>

      <Modal
        key={activeAction ?? "closed"}
        open={Boolean(activeAction)}
        title={actionModalTitle}
        description={actionModalDescription}
        onClose={closeActionModal}
      >
        {activeAction === "medical-record" ? (
          <form className="space-y-4" onSubmit={onSubmitMedicalRecord}>
            <div className="space-y-2">
              <label className="text-sm font-medium">Patient</label>
              <Select
                value={activePatientId}
                onChange={(event) => {
                  const nextPatient = patientOptions.find(
                    (patient) => patient.patientId === event.target.value,
                  );
                  setDraft((current) => ({
                    ...current,
                    patientId: event.target.value,
                    appointmentId: nextPatient?.appointments[0]?.id ?? "",
                  }));
                }}
              >
                {patientOptions.map((patient) => (
                  <option key={patient.patientId} value={patient.patientId}>
                    {patient.patientName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Linked appointment</label>
              <Select
                value={activeAppointmentId}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, appointmentId: event.target.value }))
                }
              >
                <option value="">No linked appointment</option>
                {selectedPatient?.appointments.map((appointment) => (
                  <option key={appointment.id} value={appointment.id}>
                    {appointment.id} · {appointment.appointmentDate} {appointment.appointmentTime}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Visit date</label>
              <Input
                type="date"
                value={draft.visitDate}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, visitDate: event.target.value }))
                }
              />
              {fieldErrors.visitDate ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">{fieldErrors.visitDate}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Diagnosis</label>
              <Input
                value={draft.diagnosis}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, diagnosis: event.target.value }))
                }
              />
              {fieldErrors.diagnosis ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">{fieldErrors.diagnosis}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Clinical notes</label>
              <Textarea
                value={draft.clinicalNotes}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, clinicalNotes: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Treatment / advice</label>
              <Textarea
                value={draft.treatmentAdvice}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, treatmentAdvice: event.target.value }))
                }
              />
            </div>
            {message ? <p className="text-sm text-[color:var(--muted-foreground)]">{message}</p> : null}
            <Button type="submit" disabled={!patientOptions.length || submitting}>
              {submitting ? "Saving..." : "Save Record"}
            </Button>
          </form>
        ) : null}

        {activeAction === "lab-request" ? (
          <form className="space-y-4" onSubmit={onSubmitLabRequest}>
            <div className="space-y-2">
              <label className="text-sm font-medium">Patient</label>
              <Select
                value={activeLabPatientId}
                onChange={(event) =>
                  setLabDraft((current) => ({
                    ...current,
                    patientId: event.target.value,
                    appointmentId: "",
                    familyMemberId: "",
                  }))
                }
              >
                {patientOptions.map((patient) => (
                  <option key={patient.patientId} value={patient.patientId}>
                    {patient.patientName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Linked appointment</label>
              <Select
                value={activeLabAppointmentId}
                onChange={(event) =>
                  setLabDraft((current) => ({
                    ...current,
                    appointmentId: event.target.value,
                    familyMemberId:
                      relevantLabAppointments.find(
                        (appointment) => appointment.id === event.target.value,
                      )?.familyMemberId ?? "",
                  }))
                }
              >
                <option value="">No linked appointment - Follow-up order</option>
                {relevantLabAppointments.map((appointment) => (
                  <option key={appointment.id} value={appointment.id}>
                    {appointment.id} · {appointment.status} · {appointment.appointmentDate} {appointment.appointmentTime}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Family member</label>
              <Select
                value={selectedLabAppointment?.familyMemberId ?? (labDraft.familyMemberId ?? "")}
                disabled={Boolean(selectedLabAppointment?.familyMemberId)}
                onChange={(event) =>
                  setLabDraft((current) => ({
                    ...current,
                    familyMemberId: event.target.value || undefined,
                  }))
                }
              >
                <option value="">Primary patient</option>
                {labFamilyMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.fullName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Lab test</label>
              <Select
                value={labDraft.testId}
                onChange={(event) =>
                  setLabDraft((current) => ({ ...current, testId: event.target.value }))
                }
              >
                <option value="">Select lab test</option>
                {state.labTests.map((test) => (
                  <option key={test.id} value={test.id}>
                    {test.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <DatePickerField
                value={labDraft.requestedDate}
                error={labErrors.requestedDate}
                onChange={(value) =>
                  setLabDraft((current) => ({ ...current, requestedDate: value }))
                }
              />
              <TimePickerField
                value={labDraft.requestedTime}
                error={labErrors.requestedTime}
                selectedDate={labDraft.requestedDate}
                unavailableSlots={busyLabSlots}
                onChange={(value) =>
                  setLabDraft((current) => ({ ...current, requestedTime: value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Clinical reason / notes</label>
              <Textarea
                value={labDraft.clinicalNotes ?? ""}
                onChange={(event) =>
                  setLabDraft((current) => ({ ...current, clinicalNotes: event.target.value }))
                }
              />
            </div>
            {labMessage ? <p className="text-sm text-[color:var(--muted-foreground)]">{labMessage}</p> : null}
            <Button type="submit" disabled={labSubmitting || !patientOptions.length}>
              {labSubmitting ? "Submitting..." : "Create Lab Request"}
            </Button>
          </form>
        ) : null}

        {activeAction === "vaccination" || activeAction === "surgery" ? (
          <form className="space-y-4" onSubmit={onSubmitHistory}>
            <div className="space-y-2">
              <label className="text-sm font-medium">Patient</label>
              <Select
                value={activeHistoryPatientId}
                onChange={(event) =>
                  setHistoryDraft((current) => ({
                    ...current,
                    patientId: event.target.value,
                    familyMemberId: "",
                  }))
                }
              >
                {patientOptions.map((patient) => (
                  <option key={patient.patientId} value={patient.patientId}>
                    {patient.patientName}
                  </option>
                ))}
              </Select>
              {historyErrors.patientId ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">
                  {historyErrors.patientId}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Family member</label>
              <Select
                value={historyDraft.familyMemberId ?? ""}
                onChange={(event) =>
                  setHistoryDraft((current) => ({
                    ...current,
                    familyMemberId: event.target.value,
                  }))
                }
              >
                <option value="">Primary patient</option>
                {historyFamilyMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.fullName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Recorded date</label>
              <Input
                type="date"
                value={historyDraft.recordedDate}
                onChange={(event) =>
                  setHistoryDraft((current) => ({ ...current, recordedDate: event.target.value }))
                }
              />
              {historyErrors.recordedDate ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">
                  {historyErrors.recordedDate}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {activeAction === "vaccination" ? "Vaccine name" : "Procedure / surgery"}
              </label>
              <Input
                value={historyDraft.title}
                onChange={(event) =>
                  setHistoryDraft((current) => ({ ...current, title: event.target.value }))
                }
              />
              {historyErrors.title ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">{historyErrors.title}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Details</label>
              <Textarea
                value={historyDraft.details ?? ""}
                onChange={(event) =>
                  setHistoryDraft((current) => ({ ...current, details: event.target.value }))
                }
              />
            </div>
            {historyMessage ? (
              <p className="text-sm text-[color:var(--muted-foreground)]">{historyMessage}</p>
            ) : null}
            <Button type="submit" disabled={historySubmitting || !patientOptions.length}>
              {historySubmitting ? "Saving..." : activeAction === "vaccination" ? "Save Vaccination" : "Save Surgery"}
            </Button>
          </form>
        ) : null}

        {activeAction === "attachment" ? (
          <form className="space-y-4" onSubmit={onSubmitAttachment}>
            <div className="space-y-2">
              <label className="text-sm font-medium">Patient</label>
              <Select
                value={activeAttachmentPatientId}
                onChange={(event) =>
                  setAttachmentDraft((current) => ({
                    ...current,
                    patientId: event.target.value,
                    familyMemberId: "",
                    medicalRecordId: "",
                  }))
                }
              >
                {patientOptions.map((patient) => (
                  <option key={patient.patientId} value={patient.patientId}>
                    {patient.patientName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Family member</label>
              <Select
                value={attachmentDraft.familyMemberId ?? ""}
                onChange={(event) =>
                  setAttachmentDraft((current) => ({
                    ...current,
                    familyMemberId: event.target.value,
                  }))
                }
              >
                <option value="">Primary patient</option>
                {attachmentFamilyMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.fullName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Label</label>
              <Input
                value={attachmentDraft.label}
                onChange={(event) =>
                  setAttachmentDraft((current) => ({ ...current, label: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Linked medical record</label>
              <Select
                value={attachmentDraft.medicalRecordId ?? ""}
                onChange={(event) =>
                  setAttachmentDraft((current) => ({
                    ...current,
                    medicalRecordId: event.target.value,
                  }))
                }
              >
                <option value="">No linked record</option>
                {state.medicalRecords
                  .filter((record) => record.patientId === activeAttachmentPatientId)
                  .slice(0, 20)
                  .map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.id} · {record.diagnosis}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Attachment</label>
              <Input
                type="file"
                accept=".pdf,image/png,image/jpeg"
                onChange={(event) => {
                  void handleAttachmentFile(event.target.files?.[0] ?? null);
                }}
              />
            </div>
            {attachmentMessage ? (
              <p className="text-sm text-[color:var(--muted-foreground)]">{attachmentMessage}</p>
            ) : null}
            <Button type="submit" disabled={attachmentSubmitting || !patientOptions.length}>
              {attachmentSubmitting ? "Uploading..." : "Upload Attachment"}
            </Button>
          </form>
        ) : null}
      </Modal>

      <LabReportViewModal
        open={Boolean(selectedReport)}
        report={selectedReport}
        organizationName={state.organization.name}
        onClose={() => setSelectedReport(null)}
      />
    </div>
  );
}
