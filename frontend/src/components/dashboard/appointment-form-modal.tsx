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
import {
  HOSPITAL_TODAY,
  type AppointmentDraft,
  type AppointmentRecord,
  type DoctorRecord,
} from "@/lib/hospital-data";
import { cn } from "@/lib/utils";

type AppointmentFormModalProps = {
  open: boolean;
  doctors: DoctorRecord[];
  appointments: AppointmentRecord[];
  initialAppointment?: AppointmentRecord | null;
  onClose: () => void;
  onSubmit: (
    draft: AppointmentDraft,
  ) => {
    isValid: boolean;
    errors: Partial<Record<keyof AppointmentDraft, string>>;
  };
};

const emptyDraft: AppointmentDraft = {
  patientName: "",
  doctorId: "",
  appointmentDate: "",
  appointmentTime: "",
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

function getDraftFromAppointment(initialAppointment?: AppointmentRecord | null): AppointmentDraft {
  if (!initialAppointment) {
    return emptyDraft;
  }

  return {
    patientName: initialAppointment.patientName,
    doctorId: initialAppointment.doctorId,
    appointmentDate: initialAppointment.appointmentDate,
    appointmentTime: initialAppointment.appointmentTime,
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

function DatePickerField({ value, error, onChange }: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() =>
    value ? parseIsoDate(value) : parseIsoDate(HOSPITAL_TODAY),
  );

  useDismissablePopover(open, () => setOpen(false), [triggerRef, popoverRef]);

  const calendarDays = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);
  const todayDate = HOSPITAL_TODAY;

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
          setVisibleMonth(value ? parseIsoDate(value) : parseIsoDate(HOSPITAL_TODAY));
          setOpen((current) => !current);
        }}
      />
      {open ? (
        <div
          ref={popoverRef}
          className="absolute left-0 right-0 z-20 mt-2 max-w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-2xl sm:right-auto sm:w-[20rem]"
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
              const isDisabled = isoDate < HOSPITAL_TODAY;

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
  unavailableSlots: Set<string>;
  onChange: (value: string) => void;
};

function TimePickerField({
  value,
  error,
  unavailableSlots,
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
          className="absolute left-0 right-0 z-20 mt-2 max-w-full overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl sm:right-auto sm:w-[20rem]"
        >
          <div className="border-b border-[color:var(--border)] px-4 py-3">
            <p className="text-sm font-semibold text-[color:var(--foreground)]">Select a time slot</p>
            <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
              Half-hour appointment slots keep scheduling and queue intake consistent.
            </p>
          </div>
          <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto p-4">
            {timeSlots.map((slot) => {
              const isSelected = slot === value;
              const isUnavailable = unavailableSlots.has(slot) && !isSelected;

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
                  {slot}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
        Unavailable slots are disabled when the selected doctor already has an appointment.
      </p>
      {error ? <p className="mt-2 text-sm text-[color:var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function AppointmentFormModal({
  open,
  doctors,
  appointments,
  initialAppointment,
  onClose,
  onSubmit,
}: AppointmentFormModalProps) {
  const [draft, setDraft] = useState<AppointmentDraft>(() =>
    getDraftFromAppointment(initialAppointment),
  );
  const [errors, setErrors] = useState<Partial<Record<keyof AppointmentDraft, string>>>({});

  const selectedDoctor = doctors.find((doctor) => doctor.id === draft.doctorId);
  const unavailableTimeSlots = useMemo(() => {
    if (!draft.doctorId || !draft.appointmentDate) {
      return new Set<string>();
    }

    return new Set(
      appointments
        .filter((appointment) => {
          if (appointment.status === "Cancelled") {
            return false;
          }

          if (initialAppointment && appointment.id === initialAppointment.id) {
            return false;
          }

          return (
            appointment.doctorId === draft.doctorId &&
            appointment.appointmentDate === draft.appointmentDate
          );
        })
        .map((appointment) => appointment.appointmentTime),
    );
  }, [appointments, draft.appointmentDate, draft.doctorId, initialAppointment]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialAppointment ? "Update appointment" : "Create appointment"}
      description="Capture patient details, assign the right doctor, and keep the hospital schedule aligned."
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const result = onSubmit(draft);
          setErrors(result.errors);

          if (result.isValid) {
            onClose();
          }
        }}
      >
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

        <div>
          <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
            Doctor
          </label>
          <Select
            aria-label="Doctor"
            value={draft.doctorId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, doctorId: event.target.value }))
            }
          >
            <option value="">Select doctor</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name} - {doctor.specialization}
              </option>
            ))}
          </Select>
          {selectedDoctor ? (
            <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
              Department: {selectedDoctor.departmentId.replace("dept-", "").replaceAll("-", " ")}
            </p>
          ) : null}
          {errors.doctorId ? (
            <p className="mt-2 text-sm text-[color:var(--danger)]">{errors.doctorId}</p>
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
            unavailableSlots={unavailableTimeSlots}
            onChange={(value) =>
              setDraft((current) => ({ ...current, appointmentTime: value }))
            }
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit">
            {initialAppointment ? "Save changes" : "Create appointment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
