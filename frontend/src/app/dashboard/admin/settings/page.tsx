"use client";

import { useState } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { HospitalSettingsDraft } from "@/lib/hospital-data";

function buildSettingsDraft({
  organization,
  bookingCapacity,
}: ReturnType<typeof useHospitalData>["state"]): HospitalSettingsDraft {
  return {
    hospitalName: organization.name,
    address: organization.address ?? "",
    city: organization.city ?? "",
    state: organization.state ?? "",
    contactPhone: organization.contactPhone ?? "",
    contactEmail: organization.contactEmail ?? "",
    emergencyContact: organization.emergencyContact ?? "",
    operatingHours: organization.operatingHours ?? "",
    timezone: organization.timezone ?? "Asia/Calcutta",
    defaultLanguage: organization.defaultLanguage ?? "English",
    emergencyServicesEnabled: organization.emergencyServicesEnabled ?? true,
    defaultConsultationSlotDurationMinutes:
      organization.defaultConsultationSlotDurationMinutes ?? 30,
    defaultDoctorSlotCapacity: bookingCapacity.doctorSlotCapacity,
    morningSessionCapacity:
      bookingCapacity.sessions.find((session) => session.id === "morning")?.maxAppointments ?? 1,
    afternoonSessionCapacity:
      bookingCapacity.sessions.find((session) => session.id === "afternoon")?.maxAppointments ?? 1,
    eveningSessionCapacity:
      bookingCapacity.sessions.find((session) => session.id === "evening")?.maxAppointments ?? 1,
    defaultLabSlotCapacity: bookingCapacity.labSlotCapacity,
  };
}

const timezoneOptions = ["Asia/Calcutta", "UTC", "Asia/Dubai", "Europe/London"].map((value) => ({
  value,
  label: value,
}));

const languageOptions = ["English", "Tamil", "Hindi"].map((value) => ({
  value,
  label: value,
}));

type SettingsFieldProps = {
  field: keyof HospitalSettingsDraft;
  label: string;
  editing: boolean;
  value: string | number;
  error?: string;
  type?: "text" | "email" | "tel" | "number";
  placeholder?: string;
  onChange: (value: string) => void;
};

function SettingsField({
  field,
  label,
  editing,
  value,
  error,
  type = "text",
  placeholder,
  onChange,
}: SettingsFieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={field}>
        {label}
      </label>
      <Input
        id={field}
        type={type}
        value={value}
        disabled={!editing}
        placeholder={placeholder}
        min={type === "number" ? 1 : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
    </div>
  );
}

export default function AdminSettingsPage() {
  const { session, updateSession } = useAuth();
  const { state, updateHospitalSettings } = useHospitalData();
  const [draft, setDraft] = useState<HospitalSettingsDraft>(() => buildSettingsDraft(state));
  const [editing, setEditing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const effectiveDraft = editing ? draft : buildSettingsDraft(state);

  const updateField = <K extends keyof HospitalSettingsDraft>(field: K, value: HospitalSettingsDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Manage hospital information, scheduling capacity, laboratory capacity, and key service preferences."
      />

      <div className="grid gap-6">
        <Card className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Hospital Information</h2>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Keep hospital contact details and operating information accurate and up to date.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsField
              field="hospitalName"
              label="Hospital Name"
              editing={editing}
              value={effectiveDraft.hospitalName}
              error={fieldErrors.hospitalName}
              onChange={(value) => updateField("hospitalName", value)}
            />
            <SettingsField
              field="contactPhone"
              label="Contact Phone"
              editing={editing}
              value={effectiveDraft.contactPhone}
              error={fieldErrors.contactPhone}
              type="tel"
              onChange={(value) => updateField("contactPhone", value)}
            />
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="address">
                Address
              </label>
              <Textarea
                id="address"
                value={effectiveDraft.address}
                disabled={!editing}
                onChange={(event) => updateField("address", event.target.value)}
              />
              {fieldErrors.address ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">{fieldErrors.address}</p>
              ) : null}
            </div>
            <SettingsField
              field="city"
              label="City"
              editing={editing}
              value={effectiveDraft.city}
              error={fieldErrors.city}
              onChange={(value) => updateField("city", value)}
            />
            <SettingsField
              field="state"
              label="State"
              editing={editing}
              value={effectiveDraft.state}
              error={fieldErrors.state}
              onChange={(value) => updateField("state", value)}
            />
            <SettingsField
              field="contactEmail"
              label="Contact Email"
              editing={editing}
              value={effectiveDraft.contactEmail}
              error={fieldErrors.contactEmail}
              type="email"
              onChange={(value) => updateField("contactEmail", value)}
            />
            <SettingsField
              field="emergencyContact"
              label="Emergency Contact"
              editing={editing}
              value={effectiveDraft.emergencyContact}
              error={fieldErrors.emergencyContact}
              type="tel"
              onChange={(value) => updateField("emergencyContact", value)}
            />
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="operatingHours">
                Operating Hours
              </label>
              <Textarea
                id="operatingHours"
                value={effectiveDraft.operatingHours}
                disabled={!editing}
                onChange={(event) => updateField("operatingHours", event.target.value)}
              />
              {fieldErrors.operatingHours ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">
                  {fieldErrors.operatingHours}
                </p>
              ) : null}
            </div>
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Appointment Settings</h2>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Set consultation timing and doctor capacity for appointment scheduling.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <SettingsField
              field="defaultConsultationSlotDurationMinutes"
              label="Default Consultation Slot Duration (Minutes)"
              editing={editing}
              value={effectiveDraft.defaultConsultationSlotDurationMinutes}
              error={fieldErrors.defaultConsultationSlotDurationMinutes}
              type="number"
              onChange={(value) =>
                updateField("defaultConsultationSlotDurationMinutes", Number(value) || 0)
              }
            />
            <SettingsField
              field="defaultDoctorSlotCapacity"
              label="Default Doctor Slot Capacity"
              editing={editing}
              value={effectiveDraft.defaultDoctorSlotCapacity}
              error={fieldErrors.defaultDoctorSlotCapacity}
              type="number"
              onChange={(value) => updateField("defaultDoctorSlotCapacity", Number(value) || 0)}
            />
            <SettingsField
              field="morningSessionCapacity"
              label="Morning Session Capacity"
              editing={editing}
              value={effectiveDraft.morningSessionCapacity}
              error={fieldErrors.morningSessionCapacity}
              type="number"
              onChange={(value) => updateField("morningSessionCapacity", Number(value) || 0)}
            />
            <SettingsField
              field="afternoonSessionCapacity"
              label="Afternoon Session Capacity"
              editing={editing}
              value={effectiveDraft.afternoonSessionCapacity}
              error={fieldErrors.afternoonSessionCapacity}
              type="number"
              onChange={(value) => updateField("afternoonSessionCapacity", Number(value) || 0)}
            />
            <SettingsField
              field="eveningSessionCapacity"
              label="Evening Session Capacity"
              editing={editing}
              value={effectiveDraft.eveningSessionCapacity}
              error={fieldErrors.eveningSessionCapacity}
              type="number"
              onChange={(value) => updateField("eveningSessionCapacity", Number(value) || 0)}
            />
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Laboratory Settings</h2>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Set laboratory request capacity for daily booking and coordination.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsField
              field="defaultLabSlotCapacity"
              label="Default Lab Slot Capacity"
              editing={editing}
              value={effectiveDraft.defaultLabSlotCapacity}
              error={fieldErrors.defaultLabSlotCapacity}
              type="number"
              onChange={(value) => updateField("defaultLabSlotCapacity", Number(value) || 0)}
            />
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Preferences</h2>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Manage timezone, language, and emergency service availability.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="timezone">
                Timezone
              </label>
              <Select
                id="timezone"
                value={effectiveDraft.timezone}
                disabled={!editing}
                onChange={(event) => updateField("timezone", event.target.value)}
              >
                {timezoneOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              {fieldErrors.timezone ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">{fieldErrors.timezone}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="defaultLanguage">
                Default Language
              </label>
              <Select
                id="defaultLanguage"
                value={effectiveDraft.defaultLanguage}
                disabled={!editing}
                onChange={(event) => updateField("defaultLanguage", event.target.value)}
              >
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              {fieldErrors.defaultLanguage ? (
                <p className="text-sm text-rose-600 dark:text-rose-300">
                  {fieldErrors.defaultLanguage}
                </p>
              ) : null}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3">
                <input
                  type="checkbox"
                  checked={effectiveDraft.emergencyServicesEnabled}
                  disabled={!editing}
                  className="h-4 w-4 accent-[color:var(--accent)]"
                  onChange={(event) =>
                    updateField("emergencyServicesEnabled", event.target.checked)
                  }
                />
                <span className="min-w-0 text-sm text-[color:var(--foreground)]">
                  Emergency service availability enabled
                </span>
              </label>
            </div>
          </div>
        </Card>
      </div>

      {message ? <p className="text-sm text-[color:var(--muted-foreground)]">{message}</p> : null}

      <div className="flex flex-wrap justify-end gap-3">
        {editing ? (
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => {
                setDraft(buildSettingsDraft(state));
                setFieldErrors({});
                setMessage(null);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                setMessage(null);

                const result = await updateHospitalSettings(draft);

                if (!result.ok) {
                  setFieldErrors(result.fieldErrors ?? {});
                  setMessage(result.message ?? "The hospital settings could not be updated.");
                  setSubmitting(false);
                  return;
                }

                updateSession({
                  ...session,
                  organization: {
                    ...session.organization,
                    name: draft.hospitalName.trim(),
                    address: draft.address.trim(),
                    city: draft.city.trim(),
                    state: draft.state.trim(),
                    contactPhone: draft.contactPhone.trim(),
                    contactEmail: draft.contactEmail.trim().toLowerCase(),
                    emergencyContact: draft.emergencyContact.trim(),
                    operatingHours: draft.operatingHours.trim(),
                    timezone: draft.timezone.trim(),
                    defaultLanguage: draft.defaultLanguage.trim(),
                    emergencyServicesEnabled: draft.emergencyServicesEnabled,
                    defaultConsultationSlotDurationMinutes:
                      draft.defaultConsultationSlotDurationMinutes,
                  },
                });
                setFieldErrors({});
                setMessage("Hospital settings updated.");
                setEditing(false);
                setSubmitting(false);
              }}
            >
              {submitting ? "Saving..." : "Save Changes"}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            onClick={() => {
              setDraft(buildSettingsDraft(state));
              setFieldErrors({});
              setMessage(null);
              setEditing(true);
            }}
          >
            Edit Settings
          </Button>
        )}
      </div>
    </div>
  );
}
