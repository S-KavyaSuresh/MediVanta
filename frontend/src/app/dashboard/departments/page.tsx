"use client";

import { Building2, MapPin, Users } from "lucide-react";
import { useState } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";

export default function DepartmentsPage() {
  const { createDepartment, departmentSummaries } = useHospitalData();
  const { session } = useAuth();
  const { pushToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const canManageDepartments = session.user.role === "administrator";

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Departments"
        title="Clinical departments and current operational load"
        description="Track department locations, current operating status, available clinicians, and active queue totals across the hospital."
        action={
          canManageDepartments ? (
            <Button onClick={() => setModalOpen(true)}>+ Create Department</Button>
          ) : null
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {departmentSummaries.map((department) => (
          <Card key={department.id} className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-[color:var(--accent)]" />
                  <p className="text-lg font-semibold">{department.name}</p>
                </div>
                <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                  {department.code}
                </p>
              </div>
              <StatusBadge status={department.status} />
            </div>

            <p className="text-sm leading-7 text-[color:var(--muted-foreground)]">
              {department.description}
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
                  Doctors
                </p>
                <p className="mt-2 text-2xl font-semibold">{department.availableDoctorCount}</p>
                <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                  of {department.totalDoctorCount} assigned
                </p>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
                  Active queue
                </p>
                <p className="mt-2 text-2xl font-semibold">{department.activeQueueCount}</p>
                <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                  patients in progress
                </p>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[color:var(--muted-foreground)]">
                  <MapPin className="h-3.5 w-3.5" />
                  Location
                </div>
                <p className="mt-2 text-sm font-semibold">{department.location}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setFieldErrors({});
        }}
        title="Create department"
        description="Add a department for the current hospital organization."
      >
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setFieldErrors({});
            const formData = new FormData(event.currentTarget);
            const result = await createDepartment({
              code: String(formData.get("code") ?? ""),
              name: String(formData.get("name") ?? ""),
              description: String(formData.get("description") ?? ""),
              status: String(formData.get("status") ?? "Operational") as
                | "Operational"
                | "Busy"
                | "Limited"
                | "Emergency priority",
              location: String(formData.get("location") ?? ""),
            });

            if (!result.ok) {
              setFieldErrors(result.fieldErrors ?? {});
              pushToast("Unable to create department", result.message ?? "Please review the department details.");
              return;
            }

            pushToast("Department created", "The new department is now available in the hospital directory.");
            setModalOpen(false);
          }}
        >
          <div>
            <label className="mb-2 block text-sm font-medium">Code</label>
            <Input name="code" />
            {fieldErrors.code ? <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.code}</p> : null}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Name</label>
            <Input name="name" />
            {fieldErrors.name ? <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.name}</p> : null}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Description</label>
            <Input name="description" />
            {fieldErrors.description ? <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.description}</p> : null}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Status</label>
            <Select name="status" defaultValue="Operational">
              <option value="Operational">Operational</option>
              <option value="Busy">Busy</option>
              <option value="Limited">Limited</option>
              <option value="Emergency priority">Emergency priority</option>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Location</label>
            <Input name="location" />
            {fieldErrors.location ? <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors.location}</p> : null}
          </div>
          <div className="flex justify-end">
            <Button type="submit">Create Department</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
