"use client";

import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ProfileSecurityPanel } from "@/components/dashboard/profile-security-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/api";
import { roleLabels, type SafeUser } from "@/lib/auth";
import { getCurrentLocalDateIso } from "@/lib/hospital-data";

type EditableProfileDraft = {
  fullName: string;
  phoneNumber?: string;
  gender?: string;
  dateOfBirth?: string;
  bloodGroup?: string;
  address?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  emergencyContact?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  allergies?: string;
  medicalConditions?: string;
  preferredLanguage?: string;
  qualifications?: string;
  experience?: string;
  languages?: string;
  consultationFee?: string;
  availableTimings?: string;
  deskLabel?: string;
  consultationMode?: string;
};

type UpdateProfileResponse = {
  sessionUser: SafeUser;
};

type FieldOption = {
  value: string;
  label: string;
};

type ProfileField = {
  key:
    | keyof EditableProfileDraft
    | "email"
    | "organization"
    | "role"
    | "status"
    | "department"
    | "specialization"
    | "profileId"
    | "age"
    | "designation"
    | "shift"
    | "professionalRegistrationNumber"
    | "profileVerificationStatus"
    | "administrativeUnit";
  label: string;
  type: "text" | "tel" | "date" | "textarea" | "select" | "readonly";
  editable?: boolean;
  options?: FieldOption[];
  placeholder?: string;
};

type RoleProfilePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  initialDraft: EditableProfileDraft;
  fields: ProfileField[];
  derivedValues?: Partial<Record<ProfileField["key"], string>>;
};

function getFieldValue(
  key: ProfileField["key"],
  draft: EditableProfileDraft,
  session: ReturnType<typeof useAuth>["session"],
  derivedValues?: Partial<Record<ProfileField["key"], string>>,
) {
  if (key === "email") {
    return session.user.email;
  }

  if (key === "organization") {
    return session.organization.name;
  }

  if (key === "role") {
    return roleLabels[session.user.role];
  }

  return derivedValues?.[key] ?? draft[key as keyof EditableProfileDraft] ?? "";
}

function getDisplayValue(value?: string | null, fallback = "Not assigned") {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function renderFieldControl(
  field: ProfileField,
  value: string,
  editing: boolean,
  onChange: (nextValue: string) => void,
) {
  const isDisabled = !editing || field.editable === false;

  if (field.type === "readonly") {
    return <Input value={value} disabled />;
  }

  if (field.type === "textarea") {
    return (
      <Textarea
        value={value}
        disabled={isDisabled}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.type === "select") {
    return (
      <Select value={value} disabled={isDisabled} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select {field.label.toLowerCase()}</option>
        {field.options?.map((option) => (
          <option key={`${field.key}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    );
  }

  return (
    <Input
      type={field.type}
      value={value}
      disabled={isDisabled}
      placeholder={field.placeholder}
      max={field.type === "date" ? getCurrentLocalDateIso() : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function isEditableDraftKey(key: ProfileField["key"]): key is keyof EditableProfileDraft {
  return ![
    "email",
    "organization",
    "role",
    "status",
    "department",
    "specialization",
    "profileId",
    "age",
    "designation",
    "shift",
    "professionalRegistrationNumber",
    "profileVerificationStatus",
    "administrativeUnit",
  ].includes(key);
}

export function RoleProfilePage({
  eyebrow,
  title,
  description,
  initialDraft,
  fields,
  derivedValues,
}: RoleProfilePageProps) {
  const { session, updateSession } = useAuth();
  const [draft, setDraft] = useState<EditableProfileDraft>(initialDraft);
  const [editing, setEditing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <Card className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => {
            const value = getFieldValue(field.key, draft, session, derivedValues);
            const displayValue =
              field.type === "readonly" ? getDisplayValue(value) : value;
            const isWide =
              field.type === "textarea" ||
              field.key === "availableTimings";

            return (
              <div key={field.key} className={`space-y-2 ${isWide ? "sm:col-span-2" : ""}`}>
                <label className="text-sm font-medium" htmlFor={`profile-${field.key}`}>
                  {field.label}
                </label>
                <div id={`profile-${field.key}`}>
                  {renderFieldControl(field, displayValue, editing, (nextValue) =>
                    isEditableDraftKey(field.key)
                      ? setDraft((current) => ({ ...current, [field.key]: nextValue }))
                      : undefined,
                  )}
                </div>
                {fieldErrors[field.key] ? (
                  <p className="text-sm text-rose-600 dark:text-rose-300">{fieldErrors[field.key]}</p>
                ) : null}
              </div>
            );
          })}
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
                  setDraft(initialDraft);
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

                  try {
                    const response = await apiRequest<UpdateProfileResponse>("/api/hospital/profile", {
                      method: "PATCH",
                      body: JSON.stringify(draft),
                    });

                    updateSession({
                      ...session,
                      user: {
                        ...session.user,
                        ...response.sessionUser,
                      },
                    });
                    setFieldErrors({});
                    setMessage("Profile updated.");
                    setEditing(false);
                  } catch (error) {
                    const maybeError = error as Error & { fieldErrors?: Record<string, string> };
                    setFieldErrors(maybeError.fieldErrors ?? {});
                    setMessage(maybeError.message);
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {submitting ? "Saving..." : "Save Changes"}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={() => setEditing(true)}>
              Edit Profile
            </Button>
          )}
        </div>
      </Card>

      <ProfileSecurityPanel />
    </div>
  );
}
