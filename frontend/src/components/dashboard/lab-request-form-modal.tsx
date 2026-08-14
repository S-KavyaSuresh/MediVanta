"use client";

import { useMemo, useState } from "react";

import { DatePickerField, TimePickerField } from "@/components/dashboard/appointment-form-modal";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import type {
  BookingCapacityRecord,
  FamilyMemberRecord,
  HospitalState,
  LabSlotLoadRecord,
  LabRequestDraft,
  LabRequestRecord,
  LabTestRecord,
} from "@/lib/hospital-data";
import { isLabSlotFullyBooked, validateLabRequestDraft } from "@/lib/hospital-data";

type LabRequestFormModalProps = {
  open: boolean;
  organizationName: string;
  bookingCapacity: BookingCapacityRecord;
  labSlotLoads: LabSlotLoadRecord[];
  labTests: LabTestRecord[];
  existingRequests: LabRequestRecord[];
  patientName: string;
  familyMembers?: FamilyMemberRecord[];
  onClose: () => void;
  onSubmit: (
    draft: LabRequestDraft,
  ) => Promise<{
    ok: boolean;
    message?: string;
    fieldErrors?: Partial<Record<keyof LabRequestDraft, string>>;
  }>;
  /**
   * When set, this modal is being used from the doctor clinical workflow to order
   * a lab test for a specific patient/dependent rather than a patient self-booking.
   * The subject is preselected and locked (no "request for" picker), and the
   * copy reflects that this is a clinical order rather than a personal booking.
   */
  doctorOrderContext?: {
    patientId: string;
    familyMemberId?: string;
    appointmentId?: string;
    subjectLabel: string;
  };
};

const emptyDraft: LabRequestDraft = {
  testId: "",
  requestedDate: "",
  requestedTime: "",
};

export function LabRequestFormModal({
  open,
  organizationName,
  bookingCapacity,
  labSlotLoads,
  labTests,
  existingRequests,
  patientName,
  familyMembers = [],
  onClose,
  onSubmit,
  doctorOrderContext,
}: LabRequestFormModalProps) {
  const [draft, setDraft] = useState<LabRequestDraft>(emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<keyof LabRequestDraft, string>>>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const labCapacityState = useMemo(
    () =>
      ({
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
        labTests,
        labRequests: existingRequests,
        labReports: [],
        invoices: [],
        inventoryItems: [],
        notifications: [],
        bookingCapacity,
        configuredSupportLines: 0,
      }) satisfies HospitalState,
    [bookingCapacity, existingRequests, labTests, organizationName],
  );

  const busySlots = useMemo(
    () =>
      new Set(
        draft.requestedDate
          ? ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00"].filter(
              (slot) =>
                (labSlotLoads.find(
                  (load) =>
                    load.requestedDate === draft.requestedDate &&
                    load.requestedTime === slot,
                )?.bookings ?? 0) >= bookingCapacity.labSlotCapacity ||
                isLabSlotFullyBooked(labCapacityState, draft.requestedDate, slot),
            )
          : [],
      ),
    [bookingCapacity.labSlotCapacity, draft.requestedDate, labCapacityState, labSlotLoads],
  );

  return (
    <Modal
      open={open}
      onClose={() => {
        setMessage("");
        setErrors({});
        setDraft(emptyDraft);
        onClose();
      }}
      title={doctorOrderContext ? "Order Lab Test" : "Book Lab Test"}
      description={
        doctorOrderContext
          ? "Send a laboratory order for this patient. It will appear in Laboratory's queue and the patient's lab requests."
          : "Choose your hospital, test, and preferred date and time for a laboratory request."
      }
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitting(true);
          setMessage("");
          const validation = validateLabRequestDraft(labCapacityState, draft);
          if (!validation.isValid) {
            setSubmitting(false);
            setErrors(validation.errors);
            return;
          }
          const result = await onSubmit(
            doctorOrderContext
              ? {
                  ...draft,
                  patientId: doctorOrderContext.patientId,
                  familyMemberId: doctorOrderContext.familyMemberId,
                  appointmentId: doctorOrderContext.appointmentId,
                }
              : draft,
          );
          setSubmitting(false);
          setErrors(result.fieldErrors ?? {});

          if (result.ok) {
            setDraft(emptyDraft);
            onClose();
            return;
          }

          if (result.message) {
            setMessage(result.message);
          }
        }}
      >
        {doctorOrderContext ? (
          <div>
            <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
              Ordering for
            </label>
            <Select value={doctorOrderContext.subjectLabel} disabled aria-label="Ordering for">
              <option value={doctorOrderContext.subjectLabel}>{doctorOrderContext.subjectLabel}</option>
            </Select>
          </div>
        ) : (
          <div>
            <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
              Request for
            </label>
            <Select
              aria-label="Request for"
              value={draft.familyMemberId ?? "self"}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  familyMemberId: event.target.value === "self" ? undefined : event.target.value,
                }))
              }
            >
              <option value="self">{patientName}</option>
              {familyMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.fullName} - {member.relationship}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
            Hospital
          </label>
          <Select value={organizationName} disabled aria-label="Hospital">
            <option value={organizationName}>{organizationName}</option>
          </Select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-[color:var(--foreground)]">
            Lab test
          </label>
          <Select
            aria-label="Lab test"
            value={draft.testId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, testId: event.target.value }))
            }
          >
            <option value="">Select lab test</option>
            {labTests.map((test) => (
              <option key={test.id} value={test.id}>
                {test.name}
              </option>
            ))}
          </Select>
          {errors.testId ? (
            <p className="mt-2 text-sm text-[color:var(--danger)]">{errors.testId}</p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <DatePickerField
            value={draft.requestedDate}
            error={errors.requestedDate}
            onChange={(value) =>
              setDraft((current) => ({ ...current, requestedDate: value }))
            }
          />
          <TimePickerField
            value={draft.requestedTime}
            error={errors.requestedTime}
            selectedDate={draft.requestedDate}
            unavailableSlots={busySlots}
            onChange={(value) =>
              setDraft((current) => ({ ...current, requestedTime: value }))
            }
          />
        </div>

        {message ? (
          <p className="rounded-2xl border border-[color:var(--danger)]/20 bg-[color:var(--danger)]/8 px-4 py-3 text-sm text-[color:var(--danger)]">
            {message}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit request"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
