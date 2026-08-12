"use client";

import { useMemo, useState } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FamilyMemberDraft } from "@/lib/hospital-data";

const bloodGroupOptions = ["Unknown", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
const languageOptions = ["English", "Hindi", "Tamil"] as const;

const emptyDraft: FamilyMemberDraft = {
  fullName: "",
  relationship: "",
  dateOfBirth: "",
  gender: "",
  bloodGroup: "",
  phoneNumber: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  allergies: "None reported",
  medicalConditions: "None reported",
  preferredLanguage: "English",
};

export function PatientFamilyMembersView() {
  const { createFamilyMember, state, unlinkFamilyMember, updateFamilyMember } = useHospitalData();
  const [draft, setDraft] = useState<FamilyMemberDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sortedMembers = useMemo(
    () =>
      [...(state.familyMembers ?? [])].sort((left, right) =>
        left.fullName.localeCompare(right.fullName),
      ),
    [state.familyMembers],
  );

  async function handleSubmit() {
    setSubmitting(true);
    setMessage(null);

    const result = editingId
      ? await updateFamilyMember(editingId, draft)
      : await createFamilyMember(draft);

    setSubmitting(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      setMessage(result.message ?? "The family member could not be saved.");
      return;
    }

    setDraft(emptyDraft);
    setEditingId(null);
    setFieldErrors({});
    setMessage(editingId ? "Family member updated." : "Family member added.");
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Patient Dashboard"
        title="Family Members"
        description="Manage linked family profiles for dependent appointment and laboratory bookings."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">
              {editingId ? "Update family member" : "Add family member"}
            </h2>
            <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
              Linked family profiles stay under your account and do not create separate sign-ins.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input
                value={draft.fullName ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, fullName: event.target.value }))
                }
              />
              {fieldErrors.fullName ? <p className="text-sm text-rose-600">{fieldErrors.fullName}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Relationship</label>
              <Input
                value={draft.relationship ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, relationship: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Date of Birth</label>
              <Input
                type="date"
                value={draft.dateOfBirth ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, dateOfBirth: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Gender</label>
              <Select
                value={draft.gender ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, gender: event.target.value }))
                }
              >
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Blood Group</label>
              <Select
                value={draft.bloodGroup ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, bloodGroup: event.target.value }))
                }
              >
                <option value="">Select blood group</option>
                {bloodGroupOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={draft.phoneNumber ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, phoneNumber: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Preferred Language</label>
              <Select
                value={draft.preferredLanguage ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, preferredLanguage: event.target.value }))
                }
              >
                {languageOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Emergency Contact Name</label>
              <Input
                value={draft.emergencyContactName ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    emergencyContactName: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Emergency Contact Phone</label>
              <Input
                value={draft.emergencyContactPhone ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    emergencyContactPhone: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium">Allergies</label>
              <Textarea
                value={draft.allergies ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, allergies: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium">Existing / Chronic Medical Conditions</label>
              <Textarea
                value={draft.medicalConditions ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    medicalConditions: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          {message ? <p className="text-sm text-[color:var(--muted-foreground)]">{message}</p> : null}

          <div className="flex flex-wrap justify-end gap-3">
            {editingId ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditingId(null);
                  setDraft(emptyDraft);
                  setFieldErrors({});
                  setMessage(null);
                }}
              >
                Cancel
              </Button>
            ) : null}
            <Button type="button" disabled={submitting} onClick={handleSubmit}>
              {submitting ? "Saving..." : editingId ? "Save Changes" : "Add Family Member"}
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          {sortedMembers.length > 0 ? (
            sortedMembers.map((member) => (
              <Card key={member.id} className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{member.fullName}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      {member.relationship} · {member.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setEditingId(member.id);
                        setDraft({
                          fullName: member.fullName,
                          relationship: member.relationship,
                          dateOfBirth: member.dateOfBirth ?? "",
                          gender: member.gender ?? "",
                          bloodGroup: member.bloodGroup ?? "",
                          phoneNumber: member.phoneNumber ?? "",
                          emergencyContactName: member.emergencyContactName ?? "",
                          emergencyContactPhone: member.emergencyContactPhone ?? "",
                          allergies: member.allergies ?? "",
                          medicalConditions: member.medicalConditions ?? "",
                          preferredLanguage: member.preferredLanguage ?? "",
                        });
                        setFieldErrors({});
                        setMessage(null);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={async () => {
                        const result = await unlinkFamilyMember(member.id);
                        if (!result.ok) {
                          setMessage(result.message ?? "Unable to update this family member.");
                        }
                      }}
                    >
                      {member.status === "Inactive" ? "Keep Unlinked" : "Unlink"}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-sm">
                    <p className="font-medium">Profile</p>
                    <p className="mt-2 text-[color:var(--muted-foreground)]">
                      Date of birth: {member.dateOfBirth || "Not assigned"}
                    </p>
                    <p className="mt-1 text-[color:var(--muted-foreground)]">
                      Gender: {member.gender || "Not assigned"}
                    </p>
                    <p className="mt-1 text-[color:var(--muted-foreground)]">
                      Blood group: {member.bloodGroup || "Not assigned"}
                    </p>
                    <p className="mt-1 text-[color:var(--muted-foreground)]">
                      Phone: {member.phoneNumber || "Not assigned"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-sm">
                    <p className="font-medium">Clinical Notes</p>
                    <p className="mt-2 text-[color:var(--muted-foreground)]">
                      Allergies: {member.allergies || "None reported"}
                    </p>
                    <p className="mt-1 text-[color:var(--muted-foreground)]">
                      Conditions: {member.medicalConditions || "None reported"}
                    </p>
                    <p className="mt-1 text-[color:var(--muted-foreground)]">
                      Preferred language: {member.preferredLanguage || "Not assigned"}
                    </p>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <EmptyState
              title="No family members added"
              description="Add a linked family profile when you need to schedule care or request lab tests on someone else's behalf."
            />
          )}
        </div>
      </div>
    </div>
  );
}
