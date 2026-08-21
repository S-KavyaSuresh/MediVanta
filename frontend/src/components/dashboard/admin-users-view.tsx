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

const supportedRoles = ["doctor", "receptionist", "laboratory", "pharmacist", "administrator"] as const;

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
  const [selectedRole, setSelectedRole] =
    useState<(typeof supportedRoles)[number]>("doctor");
  const users = (meta?.users ?? []).filter((user) => user.role !== "patient");
  const departmentOptions = state.departments.filter((department) => {
    if (selectedRole === "administrator") {
      return false;
    }

    if (selectedRole === "doctor") {
      return department.id !== "dept-laboratory";
    }

    if (selectedRole === "laboratory") {
      return department.id === "dept-laboratory";
    }

    return true;
  });
  const departmentLabel =
    selectedRole === "doctor"
      ? "Department"
      : selectedRole === "receptionist"
        ? "Department / Desk"
        : selectedRole === "laboratory"
          ? "Laboratory / Department"
          : selectedRole === "pharmacist"
            ? "Pharmacy / Department"
            : "Administrative Unit";
  const activeBranches = (state.branches ?? []).filter((branch) => branch.active);

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
          setSelectedRole("doctor");
        }}
        title="Add staff"
        description="Create a hospital account with the appropriate role."
      >
        <form
          className="space-y-4"
          autoComplete="off"
          onSubmit={async (event) => {
            event.preventDefault();
            setFieldErrors({});
            const formData = new FormData(event.currentTarget);
            const payload = {
              displayName: String(formData.get("displayName") ?? ""),
              email: String(formData.get("staffEmail") ?? ""),
              temporaryPassword: String(formData.get("temporaryPassword") ?? ""),
              role: String(formData.get("role") ?? "") as (typeof supportedRoles)[number],
              departmentId:
                selectedRole === "administrator"
                  ? undefined
                  : String(formData.get("departmentId") ?? "") || undefined,
              branchId:
                selectedRole === "doctor"
                  ? String(formData.get("branchId") ?? "") || undefined
                  : undefined,
              specialization: String(formData.get("specialization") ?? "") || undefined,
              consultationFee:
                selectedRole === "doctor"
                  ? String(formData.get("consultationFee") ?? "") || undefined
                  : undefined,
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
            <Input name="displayName" autoComplete="off" />
            {fieldErrors.displayName ? <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.displayName}</p> : null}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Email</label>
            <Input name="staffEmail" type="email" autoComplete="off" defaultValue="" />
            {fieldErrors.email ? <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.email}</p> : null}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Temporary Password</label>
            <Input name="temporaryPassword" type="password" autoComplete="new-password" />
            <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
              The staff member should change this password after first sign in.
            </p>
            {fieldErrors.temporaryPassword ? <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.temporaryPassword}</p> : null}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Role</label>
            <Select
              name="role"
              value={selectedRole}
              onChange={(event) =>
                setSelectedRole(event.target.value as (typeof supportedRoles)[number])
              }
            >
              <option value="doctor">Doctor</option>
              <option value="receptionist">Receptionist</option>
              <option value="laboratory">Laboratory Staff</option>
              <option value="pharmacist">Pharmacist</option>
              <option value="administrator">Administrator</option>
            </Select>
          </div>
          {selectedRole === "administrator" ? (
            <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-sm text-[color:var(--muted-foreground)]">
              Department / Unit: Administration
            </div>
          ) : (
          <div>
            <label className="mb-2 block text-sm font-medium">{departmentLabel}</label>
            <Select name="departmentId" defaultValue="">
              <option value="">
                {selectedRole === "receptionist"
                  ? "Select reception or operational unit"
                  : selectedRole === "pharmacist"
                    ? "Select pharmacy unit where applicable"
                    : "Select department where applicable"}
              </option>
              {departmentOptions.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
            {fieldErrors.departmentId ? <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.departmentId}</p> : null}
          </div>
          )}
          {selectedRole === "doctor" ? (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium">Hospital Branch</label>
                <Select name="branchId" defaultValue="">
                  <option value="">Select branch where applicable</option>
                  {activeBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </Select>
                {fieldErrors.branchId ? <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.branchId}</p> : null}
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Specialization / Clinical Focus</label>
                <Input name="specialization" placeholder="Leave blank to use the selected department" />
                {fieldErrors.specialization ? <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.specialization}</p> : null}
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Consultation Fee</label>
                <Input name="consultationFee" placeholder="INR 900" />
                {fieldErrors.consultationFee ? <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.consultationFee}</p> : null}
              </div>
            </>
          ) : null}
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
