"use client";

import { useState } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/providers/toast-provider";
import { roleLabels } from "@/lib/auth";

const supportedRoles = ["doctor", "receptionist", "laboratory", "pharmacist"] as const;

function getDepartmentUnitLabel(user: {
  role: string;
  departmentId?: string;
  deskLabel?: string;
}, getDepartmentName: (departmentId: string) => string) {
  if (user.role === "doctor") {
    return user.departmentId ? getDepartmentName(user.departmentId) : "Not assigned";
  }

  if (user.role === "receptionist") {
    if (user.departmentId) {
      return getDepartmentName(user.departmentId);
    }

    return user.deskLabel?.trim() || "Reception";
  }

  if (user.role === "laboratory") {
    return user.departmentId ? getDepartmentName(user.departmentId) : "Laboratory";
  }

  if (user.role === "pharmacist") {
    return user.departmentId ? getDepartmentName(user.departmentId) : "Pharmacy";
  }

  if (user.role === "administrator") {
    return "Administration";
  }

  return "Not assigned";
}

export function AdminUsersView() {
  const { createStaffMember, getDepartmentName, meta, state, updateUserAccountStatus } =
    useHospitalData();
  const { session } = useAuth();
  const { pushToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const users = (meta?.users ?? []).filter((user) => user.role !== "patient");

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Staff Management"
        description="Review hospital staff records and add doctors or operational team members."
        action={<Button onClick={() => setModalOpen(true)}>+ Add Staff</Button>}
      />
      {users.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {users.map((user) => (
            <Card key={user.id} className="space-y-4">
              <p className="text-lg font-semibold">{user.displayName}</p>
              <p className="text-sm text-[color:var(--muted-foreground)]">{user.email}</p>
              <div className="space-y-2 text-sm text-[color:var(--muted-foreground)]">
                <p>
                  <span className="font-medium text-[color:var(--foreground)]">Role:</span>{" "}
                  {roleLabels[user.role]}
                </p>
                <p>
                  <span className="font-medium text-[color:var(--foreground)]">Department / Unit:</span>{" "}
                  {getDepartmentUnitLabel(user, getDepartmentName)}
                </p>
                <p>
                  <span className="font-medium text-[color:var(--foreground)]">Status:</span>{" "}
                  {user.staffStatus?.trim() || "Active"}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {user.id === session.user.id ? (
                  <p className="text-sm text-[color:var(--muted-foreground)]">
                    Current signed-in account
                  </p>
                ) : user.staffStatus?.trim() === "Deactivated" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={async () => {
                      const confirmed = window.confirm(
                        "Reactivate this account?\nThe user will be able to sign in again.",
                      );

                      if (!confirmed) {
                        return;
                      }

                      const result = await updateUserAccountStatus(user.id, "Active");
                      if (!result.ok) {
                        pushToast(
                          "Unable to reactivate account",
                          result.message ?? "Please try again.",
                        );
                        return;
                      }

                      pushToast(
                        "Account reactivated",
                        `${user.displayName} can sign in again.`,
                      );
                    }}
                  >
                    Reactivate Account
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={async () => {
                      const confirmed = window.confirm(
                        "Deactivate this account?\nThe user will no longer be able to sign in. Existing hospital records will be preserved.",
                      );

                      if (!confirmed) {
                        return;
                      }

                      const result = await updateUserAccountStatus(user.id, "Deactivated");
                      if (!result.ok) {
                        pushToast(
                          "Unable to deactivate account",
                          result.message ?? "Please try again.",
                        );
                        return;
                      }

                      pushToast(
                        "Account deactivated",
                        `${user.displayName} can no longer sign in.`,
                      );
                    }}
                  >
                    Deactivate Account
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No staff records available"
          description="Hospital staff accounts will appear here as administrators add them."
        />
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setFieldErrors({});
        }}
        title="Add staff"
        description="Create a hospital staff account with the appropriate role and department."
      >
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setFieldErrors({});
            const formData = new FormData(event.currentTarget);
            const payload = {
              displayName: String(formData.get("displayName") ?? ""),
              email: String(formData.get("email") ?? ""),
              role: String(formData.get("role") ?? "") as (typeof supportedRoles)[number],
              departmentId: String(formData.get("departmentId") ?? "") || undefined,
              specialization: String(formData.get("specialization") ?? "") || undefined,
              status: String(formData.get("status") ?? ""),
            };

            const result = await createStaffMember(payload);
            if (!result.ok) {
              setFieldErrors(result.fieldErrors ?? {});
              pushToast("Unable to add staff", result.message ?? "Please review the staff details.");
              return;
            }

            pushToast("Staff member added", `${payload.displayName} is now available in Staff Management.`);
            setModalOpen(false);
          }}
        >
          <div>
            <label className="mb-2 block text-sm font-medium">Full Name</label>
            <Input name="displayName" />
            {fieldErrors.displayName ? <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.displayName}</p> : null}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Email</label>
            <Input name="email" type="email" />
            {fieldErrors.email ? <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.email}</p> : null}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Role</label>
            <Select name="role" defaultValue="doctor">
              <option value="doctor">Doctor</option>
              <option value="receptionist">Receptionist</option>
              <option value="laboratory">Laboratory Staff</option>
              <option value="pharmacist">Pharmacist</option>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Department</label>
            <Select name="departmentId" defaultValue="">
              <option value="">Select department where applicable</option>
              {state.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
            {fieldErrors.departmentId ? <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.departmentId}</p> : null}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Specialization</label>
            <Input name="specialization" placeholder="Required for doctors" />
            {fieldErrors.specialization ? <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.specialization}</p> : null}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Status</label>
            <Select name="status" defaultValue="Active">
              <option value="Active">Active</option>
              <option value="On break">On break</option>
              <option value="Off duty">Off duty</option>
            </Select>
            {fieldErrors.status ? <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.status}</p> : null}
          </div>
          <div className="flex justify-end">
            <Button type="submit">Add Staff</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
