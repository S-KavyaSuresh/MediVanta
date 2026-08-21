"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Clock3,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SafeUser } from "@/lib/auth";
import {
  type AppointmentSlotLoadRecord,
  type BookingCapacityRecord,
  getCurrentLocalDateIso,
  isDoctorOnBreakAtSlot,
  isClosedAppointmentTimeSlot,
  isPastLocalTimeSlot,
  getSessionForTime,
  type AppointmentDraft,
  type AppointmentRecord,
  type DepartmentRecord,
  type DoctorRecord,
  type FamilyMemberRecord,
  type HospitalBranchRecord,
  type PaymentMethod,
} from "@/lib/hospital-data";
import { cn } from "@/lib/utils";

type AppointmentFormModalProps = {
  open: boolean;
  organizationName: string;
  bookingCapacity: BookingCapacityRecord;
  appointmentSlotLoads: AppointmentSlotLoadRecord[];
  branches?: HospitalBranchRecord[];
  departments: DepartmentRecord[];
  doctors: DoctorRecord[];
  appointments: AppointmentRecord[];
  initialAppointment?: AppointmentRecord | null;
  patientName?: string;
  familyMembers?: FamilyMemberRecord[];
  doctorProfiles?: SafeUser[];
  patientMode?: boolean;
  onClose: () => void;
  onSubmit: (
    draft: AppointmentDraft,
  ) => Promise<{
    isValid: boolean;
    errors: Partial<Record<keyof AppointmentDraft, string>>;
    message?: string;
  }>;
};

type PatientBookingStep = "details" | "payment" | "review";

const emptyDraft: AppointmentDraft = {
  patientName: "",
  branchId: "",
  doctorId: "",
  appointmentDate: "",
  appointmentTime: "",
  reasonForAppointment: "",
  consultationMode: "In Person",
  paymentMethod: "UPI",
  paymentReferenceNumber: "",
};

const weekdayLabels = [
  { id: "sun", label: "S" },
  { id: "mon", label: "M" },
  { id: "tue", label: "T" },
  { id: "wed", label: "W" },
  { id: "thu", label: "T" },
  { id: "fri", label: "F" },
  { id: "sat", label: "S" },
];

const timeSlots = [
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
];

const appointmentPaymentMethods: PaymentMethod[] = [
  "UPI",
  "Credit Card",
  "Debit Card",
  "Net Banking",
];

function parseCurrencyTextToCents(value?: string) {
  if (!value) {
    return 0;
  }

  const amount = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function formatMoney(cents: number) {
  return `INR ${(cents / 100).toFixed(2)}`;
}

function isActiveDoctorProfile(profile?: SafeUser) {
  return !profile || profile.staffStatus?.trim().toLowerCase() !== "deactivated";
}

function formatBranchOptionLabel(branch: HospitalBranchRecord) {
  return branch.name.toLowerCase().includes(branch.city.toLowerCase())
    ? branch.name
    : `${branch.name} - ${branch.city}`;
}

function getDraftFromAppointment(initialAppointment?: AppointmentRecord | null): AppointmentDraft {
  if (!initialAppointment) {
    return emptyDraft;
  }

  return {
    patientName: initialAppointment.patientName,
    familyMemberId: initialAppointment.familyMemberId,
    branchId: "",
    doctorId: initialAppointment.doctorId,
    appointmentDate: initialAppointment.appointmentDate,
    appointmentTime: initialAppointment.appointmentTime,
    reasonForAppointment: initialAppointment.reasonForAppointment,
    consultationMode: initialAppointment.consultationMode ?? "In Person",
  };
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value: string) {
  if (!value) {
    return "Select date";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parseIsoDate(value));
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function getCalendarDays(monthDate: Date) {
  const startOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const endOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const startOffset = startOfMonth.getDay();
  const daysInMonth = endOfMonth.getDate();
  const cells: Array<Date | null> = [];

  for (let index = 0; index < startOffset; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function useDismissablePopover(
  open: boolean,
  onClose: () => void,
  refs: Array<RefObject<HTMLElement | null>>,
) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInside = refs.some((ref) => ref.current?.contains(target));

      if (!isInside) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, refs]);
}

type PickerButtonProps = {
  buttonRef?: RefObject<HTMLButtonElement | null>;
  icon: ReactNode;
  label: string;
  value: string;
  open: boolean;
  hasError: boolean;
  onClick: () => void;
};

function PickerButton({
  buttonRef,
  icon,
  label,
  value,
  open,
  hasError,
  onClick,
}: PickerButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-2xl border bg-[color:var(--surface)] px-4 py-3 text-left shadow-[0_18px_45px_-36px_rgba(15,23,42,0.36)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]",
        open
          ? "border-[color:var(--accent)]"
          : hasError
            ? "border-[color:var(--danger)]"
            : "border-[color:var(--border)]",
      )}
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--accent)]">
          {icon}
          {label}
        </div>
        <div className="truncate text-sm font-medium text-[color:var(--foreground)]">
          {value}
        </div>
      </div>
      <ChevronsUpDown className="h-4 w-4 shrink-0 text-[color:var(--muted-foreground)]" />
    </button>
  );
}

type DatePickerFieldProps = {
  value: string;
  error?: string;
  onChange: (value: string) => void;
};

export function DatePickerField({ value, error, onChange }: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() =>
    value ? parseIsoDate(value) : parseIsoDate(getCurrentLocalDateIso()),
  );

  useDismissablePopover(open, () => setOpen(false), [triggerRef, popoverRef]);

  const calendarDays = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);
  const todayDate = getCurrentLocalDateIso();

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
        Appointment date
      </label>
      <PickerButton
        buttonRef={triggerRef}
        icon={<CalendarDays className="h-4 w-4" />}
        label="Calendar"
        value={formatDisplayDate(value)}
        open={open}
        hasError={Boolean(error)}
        onClick={() => {
          setVisibleMonth(value ? parseIsoDate(value) : parseIsoDate(todayDate));
          setOpen((current) => !current);
        }}
      />
      {open ? (
        <div
          ref={popoverRef}
          className="relative z-20 mt-2 max-w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-2xl sm:absolute sm:left-0 sm:right-auto sm:w-[20rem]"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded-full p-2 text-[color:var(--foreground)] hover:bg-[color:var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
              onClick={() =>
                setVisibleMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                )
              }
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold text-[color:var(--foreground)]">
              {formatMonthLabel(visibleMonth)}
            </p>
            <button
              type="button"
              className="rounded-full p-2 text-[color:var(--foreground)] hover:bg-[color:var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
              onClick={() =>
                setVisibleMonth(
                  (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                )
              }
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase tracking-[0.12em] text-[color:var(--muted-foreground)]">
            {weekdayLabels.map((day) => (
              <div key={day.id} className="py-1">
                {day.label}
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {calendarDays.map((day, index) => {
              if (!day) {
                return <div key={`empty-${index}`} className="aspect-square" />;
              }

              const isoDate = toIsoDate(day);
              const isSelected = isoDate === value;
              const isToday = isoDate === todayDate;
              const isDisabled = isoDate < todayDate;

              return (
                <button
                  key={isoDate}
                  type="button"
                  disabled={isDisabled}
                  className={cn(
                    "aspect-square rounded-xl text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]",
                    isSelected
                      ? "bg-[color:var(--accent)] font-semibold text-white"
                      : isToday
                        ? "border border-[color:var(--accent)] bg-[color:var(--surface-muted)] font-semibold text-[color:var(--accent)]"
                        : "text-[color:var(--foreground)] hover:bg-[color:var(--surface-muted)]",
                    isDisabled && "cursor-not-allowed text-[color:var(--muted-foreground)] opacity-45 hover:bg-transparent",
                  )}
                  onClick={() => {
                    onChange(isoDate);
                    setOpen(false);
                  }}
                  aria-label={formatDisplayDate(isoDate)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
        Choose today or a future date for this visit.
      </p>
      {error ? <p className="mt-2 text-sm text-[color:var(--danger)]">{error}</p> : null}
    </div>
  );
}

type TimePickerFieldProps = {
  value: string;
  error?: string;
  selectedDate: string;
  unavailableSlots: Set<string>;
  unavailableReasons?: Map<string, string>;
  hiddenSlots?: Set<string>;
  onChange: (value: string) => void;
};

export function TimePickerField({
  value,
  error,
  selectedDate,
  unavailableSlots,
  unavailableReasons,
  hiddenSlots = new Set<string>(),
  onChange,
}: TimePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useDismissablePopover(open, () => setOpen(false), [triggerRef, popoverRef]);

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
        Appointment time
      </label>
      <PickerButton
        buttonRef={triggerRef}
        icon={<Clock3 className="h-4 w-4" />}
        label="Time slot"
        value={value || "Select time"}
        open={open}
        hasError={Boolean(error)}
        onClick={() => setOpen((current) => !current)}
      />
      {open ? (
        <div
          ref={popoverRef}
          className="relative z-20 mt-2 max-w-full overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl sm:absolute sm:left-0 sm:right-auto sm:w-[20rem]"
        >
          <div className="border-b border-[color:var(--border)] px-4 py-3">
            <p className="text-sm font-semibold text-[color:var(--foreground)]">Select a time slot</p>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
              Half-hour appointment slots keep scheduling and queue intake consistent.
            </p>
          </div>
          <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto p-4">
            {timeSlots.filter((slot) => !hiddenSlots.has(slot)).map((slot) => {
              const isSelected = slot === value;
              const isUnavailable =
                (!isSelected && unavailableSlots.has(slot)) ||
                (!isSelected &&
                  Boolean(selectedDate) &&
                  isPastLocalTimeSlot(selectedDate, slot));

              return (
                <button
                  key={slot}
                  type="button"
                  disabled={isUnavailable}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]",
                    isSelected
                      ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
                      : "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] hover:bg-[color:var(--surface-muted)]",
                    isUnavailable && "cursor-not-allowed opacity-45 hover:bg-[color:var(--surface)]",
                  )}
                  onClick={() => {
                    onChange(slot);
                    setOpen(false);
                  }}
                >
                  <span className="block">{slot}</span>
                  {isUnavailable && unavailableReasons?.has(slot) ? (
                    <span className="mt-1 block text-[0.68rem] leading-4">
                      {unavailableReasons.get(slot)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-[color:var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function AppointmentFormModal({
  open,
  organizationName,
  bookingCapacity,
  appointmentSlotLoads,
  branches = [],
  departments,
  doctors,
  appointments,
  initialAppointment,
  patientName,
  familyMembers = [],
  doctorProfiles = [],
  patientMode = false,
  onClose,
  onSubmit,
}: AppointmentFormModalProps) {
  const [draft, setDraft] = useState<AppointmentDraft>(() =>
    initialAppointment
      ? getDraftFromAppointment(initialAppointment)
      : {
          ...emptyDraft,
          patientName: patientName ?? "",
        },
  );
  const [errors, setErrors] = useState<Partial<Record<keyof AppointmentDraft, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const initialDoctor = initialAppointment
    ? doctors.find((doctor) => doctor.id === initialAppointment.doctorId)
    : undefined;
  const activeBranches = useMemo(() => branches.filter((branch) => branch.active), [branches]);
  const [selectedHospitalName, setSelectedHospitalName] = useState(
    initialAppointment ? organizationName : "",
  );
  const [selectedBranchId, setSelectedBranchId] = useState(
    initialDoctor?.branchId ?? "",
  );
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(
    initialAppointment?.departmentId ?? "",
  );
  const [languageFilter, setLanguageFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [bookingStep, setBookingStep] = useState<PatientBookingStep>("details");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  const doctorProfileMap = useMemo(
    () =>
      new Map(
        doctorProfiles
          .filter((profile) => profile.role === "doctor")
          .map((profile) => [profile.doctorId ?? "", profile] as const),
      ),
    [doctorProfiles],
  );

  const availableLanguages = useMemo(
    () =>
      [...new Set(
        doctorProfiles
          .flatMap((profile) =>
            (profile.languages ?? "")
              .split(",")
              .map((language) => language.trim())
              .filter(Boolean),
          ),
      )].sort((left, right) => left.localeCompare(right)),
    [doctorProfiles],
  );

  const visibleDepartments = useMemo(() => {
    if (!patientMode || !selectedHospitalName || !selectedBranchId) {
      return departments;
    }

    return departments;
  }, [departments, patientMode, selectedBranchId, selectedHospitalName]);

  const visibleDoctors = useMemo(
    () => {
      return doctors.filter((doctor) => {
        const profile = doctorProfileMap.get(doctor.id);
        const matchesAccountStatus = isActiveDoctorProfile(profile);
        const matchesHospital = patientMode ? Boolean(selectedHospitalName) : true;
        const matchesBranch = patientMode ? Boolean(selectedBranchId) && doctor.branchId === selectedBranchId : true;
        const matchesDepartment = patientMode ? !selectedDepartmentId || doctor.departmentId === selectedDepartmentId : true;
        const matchesLanguage =
          languageFilter === "all" ||
          (profile?.languages ?? "")
            .toLowerCase()
            .split(",")
            .map((language) => language.trim())
            .includes(languageFilter.toLowerCase());
        const matchesAvailability =
          availabilityFilter === "all" ||
          (availabilityFilter === "on-duty"
            ? doctor.status !== "Off duty"
            : profile?.consultationMode?.toLowerCase().includes("video") ||
              profile?.consultationMode?.toLowerCase().includes("online"));

        return matchesAccountStatus && matchesHospital && matchesBranch && matchesDepartment && matchesLanguage && matchesAvailability;
      });
    },
    [
      availabilityFilter,
      doctorProfileMap,
      doctors,
      languageFilter,
      patientMode,
      selectedBranchId,
      selectedDepartmentId,
      selectedHospitalName,
    ],
  );

  const selectedDoctor = doctors.find((doctor) => doctor.id === draft.doctorId);
  const selectedDepartment = departments.find((department) => department.id === selectedDepartmentId);
  const selectedDoctorProfile = selectedDoctor ? doctorProfileMap.get(selectedDoctor.id) : undefined;
  const consultationFeeCents = parseCurrencyTextToCents(selectedDoctorProfile?.consultationFee);
  const shouldCollectAppointmentFee = patientMode && !initialAppointment;
  const showDetailsStep = !shouldCollectAppointmentFee || bookingStep === "details";
  const showPaymentStep = shouldCollectAppointmentFee && bookingStep === "payment";
  const showReviewStep = shouldCollectAppointmentFee && bookingStep === "review";
  const visibleSubmitError =
    submitError === "Please complete payment before booking this appointment." ? null : submitError;
  const hiddenTimeSlots = useMemo(
    () =>
      new Set(
        timeSlots.filter(
          (slot) => isClosedAppointmentTimeSlot(slot) || isDoctorOnBreakAtSlot(selectedDoctor, slot),
        ),
      ),
    [selectedDoctor],
  );
  const unavailableTimeSlots = useMemo(() => {
    if (!draft.doctorId || !draft.appointmentDate) {
      return new Set<string>();
    }

    const sessionBookingCount = (slot: string) => {
      const session = getSessionForTime(
        {
          organization: {
            id: "org-medivanta-general",
            name: organizationName,
            slug: "medivanta-general",
          },
          departments: [],
          doctors: [],
          medicineCatalog: [],
          appointments: [],
          queueEntries: [],
          medicalRecords: [],
          prescriptions: [],
          labTests: [],
          labRequests: [],
          labReports: [],
          invoices: [],
          inventoryItems: [],
          notifications: [],
          bookingCapacity,
          configuredSupportLines: 0,
        },
        slot,
      );

      if (!session) {
        return 0;
      }

      return appointmentSlotLoads
        .filter(
          (load) =>
            load.doctorId === draft.doctorId &&
            load.appointmentDate === draft.appointmentDate &&
            load.appointmentTime >= session.startTime &&
            load.appointmentTime <= session.endTime &&
            (!initialAppointment || load.appointmentTime !== initialAppointment.appointmentTime),
        )
        .reduce((total, load) => total + load.bookings, 0);
    };

    return new Set(
      timeSlots.filter((slot) => {
        const slotBookings = appointmentSlotLoads.find(
          (load) =>
            load.doctorId === draft.doctorId &&
            load.appointmentDate === draft.appointmentDate &&
            load.appointmentTime === slot,
        )?.bookings ?? 0;
        const session = getSessionForTime(
          {
            organization: {
              id: "org-medivanta-general",
              name: organizationName,
              slug: "medivanta-general",
            },
            departments: [],
            doctors: [],
            medicineCatalog: [],
            appointments: [],
            queueEntries: [],
            medicalRecords: [],
            prescriptions: [],
            labTests: [],
            labRequests: [],
            labReports: [],
            invoices: [],
            inventoryItems: [],
            notifications: [],
            bookingCapacity,
            configuredSupportLines: 0,
          },
          slot,
        );

        return (
          slotBookings >= bookingCapacity.doctorSlotCapacity ||
          Boolean(session && sessionBookingCount(slot) >= session.maxAppointments)
        );
      }),
    );
  }, [
    appointmentSlotLoads,
    bookingCapacity,
    draft.appointmentDate,
    draft.doctorId,
    initialAppointment,
    organizationName,
  ]);

  const validateDetailsStep = () => {
    const nextErrors: Partial<Record<keyof AppointmentDraft, string>> = {};

    if (!selectedHospitalName) {
      nextErrors.branchId = "Select a hospital.";
    } else if (activeBranches.length > 0 && !selectedBranchId) {
      nextErrors.branchId = "Select a hospital branch.";
    }

    if (!selectedDepartmentId) {
      nextErrors.doctorId = "Select a department and doctor.";
    }

    if (!draft.doctorId || !selectedDoctor) {
      nextErrors.doctorId = "Select a doctor.";
    }

    if (!draft.appointmentDate) {
      nextErrors.appointmentDate = "Select an appointment date.";
    }

    if (!draft.appointmentTime) {
      nextErrors.appointmentTime = "Select an appointment time.";
    } else if (
      hiddenTimeSlots.has(draft.appointmentTime) ||
      unavailableTimeSlots.has(draft.appointmentTime)
    ) {
      nextErrors.appointmentTime = "This appointment time is not available. Please choose another slot.";
    }

    if (draft.appointmentDate && isPastLocalTimeSlot(draft.appointmentDate, draft.appointmentTime)) {
      nextErrors.appointmentTime = "Select a future appointment time.";
    }

    if (draft.reasonForAppointment.trim().length < 3) {
      nextErrors.reasonForAppointment = "Please enter the reason for appointment.";
    }

    setErrors(nextErrors);
    setSubmitError(null);
    return Object.keys(nextErrors).length === 0;
  };

  const validatePaymentStep = () => {
    const nextErrors: Partial<Record<keyof AppointmentDraft, string>> = {};

    if (!draft.paymentMethod) {
      nextErrors.paymentMethod = "Select a payment method.";
    }

    setErrors(nextErrors);
    setSubmitError(null);
    return Object.keys(nextErrors).length === 0;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialAppointment ? "Update appointment" : "Create appointment"}
      description={
        patientMode
          ? "Choose your hospital, department, doctor, date, and time to confirm a new appointment."
          : "Capture patient details, assign the right doctor, and keep the hospital schedule aligned."
      }
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (shouldCollectAppointmentFee && bookingStep !== "review") {
            if (bookingStep === "details" && validateDetailsStep()) {
              setBookingStep("payment");
            } else if (bookingStep === "payment" && validatePaymentStep()) {
              setPaymentConfirmed(true);
              setBookingStep("review");
            }
            return;
          }

          if (shouldCollectAppointmentFee && !paymentConfirmed) {
            setBookingStep("payment");
            validatePaymentStep();
            return;
          }

          setSubmitting(true);
          const result = await onSubmit({
            ...draft,
            consultationMode: draft.consultationMode ?? "In Person",
          });
          setSubmitting(false);
          setErrors(result.errors);
          setSubmitError(result.message ?? null);

          if (result.isValid) {
            setSubmitError(null);
            setBookingStep("details");
            setPaymentConfirmed(false);
            onClose();
          } else if (shouldCollectAppointmentFee && Object.keys(result.errors).length > 0) {
            setBookingStep("details");
            setPaymentConfirmed(false);
          }
        }}
      >
        {showDetailsStep ? (
          <>
        {patientMode ? (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
                Appointment for
              </label>
              <Select
                aria-label="Appointment for"
                value={draft.familyMemberId ?? "self"}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  const nextFamilyMember =
                    nextValue === "self"
                      ? undefined
                      : familyMembers.find((member) => member.id === nextValue);
                  setDraft((current) => ({
                    ...current,
                    familyMemberId: nextValue === "self" ? undefined : nextValue,
                    patientName: nextFamilyMember?.fullName ?? (patientName ?? current.patientName),
                  }));
                }}
              >
                <option value="self">Self</option>
                {familyMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.fullName} - {member.relationship}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
                Hospital
              </label>
              <Select
                value={selectedHospitalName}
                aria-label="Hospital"
                onChange={(event) => {
                  const nextHospitalName = event.target.value;
                  setSelectedHospitalName(nextHospitalName);
                  setSelectedBranchId("");
                  setSelectedDepartmentId("");
                  setDraft((current) => ({
                    ...current,
                    branchId: "",
                    doctorId: "",
                  }));
                }}
              >
                <option value="">Select hospital</option>
                <option value={organizationName}>{organizationName}</option>
              </Select>
              {!selectedHospitalName && errors.branchId ? (
                <p className="mt-2 text-sm text-[color:var(--danger)]">{errors.branchId}</p>
              ) : null}
            </div>
            {activeBranches.length > 0 ? (
              <div>
                <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
                  Hospital branch
                </label>
                <Select
                  aria-label="Hospital branch"
                  value={selectedBranchId}
                  disabled={!selectedHospitalName}
                  onChange={(event) => {
                    const nextBranchId = event.target.value;
                    setSelectedBranchId(nextBranchId);
                    setSelectedDepartmentId("");
                    setDraft((current) => ({
                      ...current,
                      branchId: nextBranchId,
                      doctorId: "",
                    }));
                  }}
                >
                  <option value="">Select branch</option>
                  {activeBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {formatBranchOptionLabel(branch)}
                    </option>
                  ))}
                </Select>
                {selectedHospitalName && errors.branchId ? (
                  <p className="mt-2 text-sm text-[color:var(--danger)]">{errors.branchId}</p>
                ) : null}
              </div>
            ) : null}
            <div>
              <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
                Department or service
              </label>
              <Select
                aria-label="Department"
                value={selectedDepartmentId}
                disabled={patientMode && activeBranches.length > 0 && !selectedBranchId}
                onChange={(event) => {
                  const nextDepartmentId = event.target.value;
                  setSelectedDepartmentId(nextDepartmentId);
                  setDraft((current) => ({ ...current, doctorId: "" }));
                }}
              >
                <option value="">Select department</option>
                {visibleDepartments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 md:grid-cols-2">
              <Select
                aria-label="Filter by language"
                value={languageFilter}
                onChange={(event) => setLanguageFilter(event.target.value)}
              >
                <option value="all">All languages</option>
                {availableLanguages.map((language) => (
                  <option key={language} value={language}>
                    {language}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Filter by availability"
                value={availabilityFilter}
                onChange={(event) => setAvailabilityFilter(event.target.value)}
              >
                <option value="all">All availability</option>
                <option value="on-duty">Available / on duty</option>
                <option value="online">Online consultations</option>
              </Select>
            </div>
          </>
        ) : (
          <div>
            <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
              Patient name
            </label>
            <Input
              aria-label="Patient name"
              placeholder="Patient name"
              value={draft.patientName}
              onChange={(event) =>
                setDraft((current) => ({ ...current, patientName: event.target.value }))
              }
            />
            {errors.patientName ? (
              <p className="mt-2 text-sm text-[color:var(--danger)]">{errors.patientName}</p>
            ) : null}
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
            Doctor
          </label>
          <Select
            aria-label="Doctor"
            value={draft.doctorId}
            onChange={(event) => {
              const nextDoctorId = event.target.value;
              const nextDoctor = doctors.find((doctor) => doctor.id === nextDoctorId);
              setDraft((current) => ({
                ...current,
                branchId: selectedBranchId || nextDoctor?.branchId || current.branchId,
                doctorId: nextDoctorId,
              }));
            }}
          >
            <option value="">Select doctor</option>
            {visibleDoctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name} - {doctor.specialization}
              </option>
            ))}
          </Select>
          {selectedDoctor ? (
            <div className="mt-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-sm">
              <p className="font-semibold text-[color:var(--foreground)]">{selectedDoctor.name}</p>
              <div className="mt-2 space-y-1 text-[color:var(--muted-foreground)]">
                <p>Department: {selectedDoctor.departmentId.replace("dept-", "").replaceAll("-", " ")}</p>
                <p>Specialization: {selectedDoctor.specialization}</p>
                <p>Availability: {selectedDoctor.availability}</p>
                <p>Shift: {selectedDoctor.shiftLabel}</p>
                {selectedDoctor.breakWindows?.length ? (
                  <p>
                    Break:{" "}
                    {selectedDoctor.breakWindows
                      .map((breakWindow) => `${breakWindow.label} ${breakWindow.startTime}-${breakWindow.endTime}`)
                      .join(", ")}
                  </p>
                ) : null}
                {selectedDoctorProfile?.qualifications ? <p>Qualifications: {selectedDoctorProfile.qualifications}</p> : null}
                {selectedDoctorProfile?.experience ? <p>Experience: {selectedDoctorProfile.experience}</p> : null}
                {selectedDoctorProfile?.languages ? <p>Languages: {selectedDoctorProfile.languages}</p> : null}
                {selectedDoctorProfile?.consultationFee ? <p>Consultation fee: {selectedDoctorProfile.consultationFee}</p> : null}
                <p>
                  Verification: {selectedDoctorProfile?.profileVerificationStatus?.trim() || "Verified doctor profile"}
                </p>
              </div>
            </div>
          ) : null}
          {errors.doctorId ? (
            <p className="mt-2 text-sm text-[color:var(--danger)]">{errors.doctorId}</p>
          ) : null}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
            Consultation mode
          </label>
          <Select
            aria-label="Consultation mode"
            value={draft.consultationMode ?? "In Person"}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                consultationMode: event.target.value as AppointmentDraft["consultationMode"],
              }))
            }
          >
            <option value="In Person">In Person</option>
            <option value="Online">Online</option>
          </Select>
          {errors.consultationMode ? (
            <p className="mt-2 text-sm text-[color:var(--danger)]">{errors.consultationMode}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <DatePickerField
            value={draft.appointmentDate}
            error={errors.appointmentDate}
            onChange={(value) =>
              setDraft((current) => ({ ...current, appointmentDate: value }))
            }
          />
          <TimePickerField
            value={draft.appointmentTime}
            error={errors.appointmentTime}
            selectedDate={draft.appointmentDate}
            unavailableSlots={unavailableTimeSlots}
            hiddenSlots={hiddenTimeSlots}
            onChange={(value) =>
              setDraft((current) => ({ ...current, appointmentTime: value }))
            }
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
            Reason for Appointment
          </label>
          <Textarea
            aria-label="Reason for Appointment"
            placeholder="Briefly describe why this visit is needed"
            value={draft.reasonForAppointment}
            onChange={(event) =>
              setDraft((current) => ({ ...current, reasonForAppointment: event.target.value }))
            }
          />
          {errors.reasonForAppointment ? (
            <p className="mt-2 text-sm text-[color:var(--danger)]">{errors.reasonForAppointment}</p>
          ) : null}
        </div>
          </>
        ) : null}

        {showPaymentStep ? (
          <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <div className="flex flex-col gap-2 border-b border-[color:var(--border)] pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--accent)]">
                  Appointment invoice
                </p>
                <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
                  Consultation fee
                </p>
                <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                  Review the fee and record payment before booking.
                </p>
              </div>
              <p className="text-xl font-semibold text-[color:var(--foreground)]">
                {consultationFeeCents > 0 ? formatMoney(consultationFeeCents) : "Demo payment"}
              </p>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <p>
                <span className="block text-[color:var(--muted-foreground)]">Patient</span>
                <span className="font-medium text-[color:var(--foreground)]">{draft.patientName}</span>
              </p>
              <p>
                <span className="block text-[color:var(--muted-foreground)]">Doctor</span>
                <span className="font-medium text-[color:var(--foreground)]">
                  {selectedDoctor?.name ?? "Not selected"}
                </span>
              </p>
              <p>
                <span className="block text-[color:var(--muted-foreground)]">Date and time</span>
                <span className="font-medium text-[color:var(--foreground)]">
                  {draft.appointmentDate} at {draft.appointmentTime}
                </span>
              </p>
              <p>
                <span className="block text-[color:var(--muted-foreground)]">Mode</span>
                <span className="font-medium text-[color:var(--foreground)]">
                  {draft.consultationMode ?? "In Person"}
                </span>
              </p>
            </div>
            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
                  Payment method
                </label>
                <Select
                  aria-label="Payment method"
                  value={draft.paymentMethod ?? "UPI"}
                  onChange={(event) => {
                    setPaymentConfirmed(false);
                    setDraft((current) => ({
                      ...current,
                      paymentMethod: event.target.value as PaymentMethod,
                    }));
                  }}
                >
                  {appointmentPaymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </Select>
                {errors.paymentMethod ? (
                  <p className="mt-2 text-sm text-[color:var(--danger)]">{errors.paymentMethod}</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {showReviewStep ? (
          <div className="space-y-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--accent)]">
                Book appointment
              </p>
              <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
                Confirm appointment details
              </p>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                Payment has been recorded. Confirm these details to finish booking.
              </p>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <p>
                <span className="block text-[color:var(--muted-foreground)]">Patient</span>
                <span className="font-medium text-[color:var(--foreground)]">{draft.patientName}</span>
              </p>
              <p>
                <span className="block text-[color:var(--muted-foreground)]">Hospital</span>
                <span className="font-medium text-[color:var(--foreground)]">{organizationName}</span>
              </p>
              <p>
                <span className="block text-[color:var(--muted-foreground)]">Department</span>
                <span className="font-medium text-[color:var(--foreground)]">
                  {selectedDepartment?.name ?? selectedDoctor?.departmentId.replace("dept-", "").replaceAll("-", " ") ?? "Not selected"}
                </span>
              </p>
              <p>
                <span className="block text-[color:var(--muted-foreground)]">Doctor</span>
                <span className="font-medium text-[color:var(--foreground)]">
                  {selectedDoctor?.name ?? "Not selected"}
                </span>
              </p>
              <p>
                <span className="block text-[color:var(--muted-foreground)]">Date and time</span>
                <span className="font-medium text-[color:var(--foreground)]">
                  {draft.appointmentDate} at {draft.appointmentTime}
                </span>
              </p>
              <p>
                <span className="block text-[color:var(--muted-foreground)]">Consultation mode</span>
                <span className="font-medium text-[color:var(--foreground)]">
                  {draft.consultationMode ?? "In Person"}
                </span>
              </p>
              <p>
                <span className="block text-[color:var(--muted-foreground)]">Amount paid</span>
                <span className="font-medium text-[color:var(--foreground)]">
                  {consultationFeeCents > 0 ? formatMoney(consultationFeeCents) : "Demo payment"}
                </span>
              </p>
              <p>
                <span className="block text-[color:var(--muted-foreground)]">Payment method</span>
                <span className="font-medium text-[color:var(--foreground)]">
                  {draft.paymentMethod ?? "UPI"}
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-[color:var(--muted-foreground)]">Reason for Appointment</p>
              <p className="mt-1 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-sm text-[color:var(--foreground)]">
                {draft.reasonForAppointment}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          {visibleSubmitError ? (
            <p className="mr-auto max-w-md text-sm text-[color:var(--danger)]">{visibleSubmitError}</p>
          ) : null}
          {shouldCollectAppointmentFee && bookingStep !== "details" ? (
            <Button
              type="button"
              variant="secondary"
              className="min-w-24 whitespace-nowrap"
              onClick={() => {
                setBookingStep(bookingStep === "review" ? "payment" : "details");
              }}
            >
              Back
            </Button>
          ) : null}
          {shouldCollectAppointmentFee && bookingStep === "details" ? (
            <Button
              type="button"
              onClick={() => {
                if (validateDetailsStep()) {
                  setBookingStep("payment");
                }
              }}
            >
              Continue to payment
            </Button>
          ) : shouldCollectAppointmentFee && bookingStep === "payment" ? (
            <Button
              type="button"
              onClick={() => {
                if (validatePaymentStep()) {
                  setPaymentConfirmed(true);
                  setBookingStep("review");
                }
              }}
            >
              Pay now
            </Button>
          ) : (
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving..."
                : initialAppointment
                  ? "Save changes"
                  : "Book appointment"}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
