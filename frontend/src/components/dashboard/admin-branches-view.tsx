"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { apiRequest } from "@/lib/api";
import type { HospitalBranchRecord } from "@/lib/hospital-data";

type BranchResponse = {
  branches: HospitalBranchRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};

type BranchDraft = {
  code: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
  active: boolean;
};

const emptyDraft: BranchDraft = {
  code: "",
  name: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
  phone: "",
  email: "",
  active: true,
};

function toDraft(branch: HospitalBranchRecord): BranchDraft {
  return {
    code: branch.code,
    name: branch.name,
    address: branch.address,
    city: branch.city,
    state: branch.state ?? "",
    postalCode: branch.postalCode ?? "",
    phone: branch.phone ?? "",
    email: branch.email ?? "",
    active: branch.active,
  };
}

export function AdminBranchesView() {
  const [branches, setBranches] = useState<HospitalBranchRecord[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"All" | "Active" | "Inactive">("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingBranch, setEditingBranch] = useState<HospitalBranchRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<BranchDraft>(emptyDraft);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const loadBranches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<BranchResponse>(
        `/api/hospital/branches?q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}&page=1&pageSize=100`,
      );
      setBranches(response.branches);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Branches could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => {
    let active = true;

    apiRequest<BranchResponse>(
      `/api/hospital/branches?q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}&page=1&pageSize=100`,
    )
      .then((response) => {
        if (active) {
          setBranches(response.branches);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Branches could not be loaded.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [query, status]);

  function openCreate() {
    setEditingBranch(null);
    setDraft(emptyDraft);
    setFieldErrors({});
    setModalOpen(true);
  }

  function openEdit(branch: HospitalBranchRecord) {
    setEditingBranch(branch);
    setDraft(toDraft(branch));
    setFieldErrors({});
    setModalOpen(true);
  }

  async function saveBranch() {
    setFieldErrors({});
    try {
      await apiRequest(
        editingBranch ? `/api/hospital/branches/${editingBranch.id}` : "/api/hospital/branches",
        {
          method: editingBranch ? "PATCH" : "POST",
          body: JSON.stringify(draft),
        },
      );
      setModalOpen(false);
      await loadBranches();
    } catch (saveError) {
      const apiError = saveError as Error & { fieldErrors?: Record<string, string> };
      setFieldErrors(apiError.fieldErrors ?? {});
      setError(apiError.message);
    }
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Hospital Branches"
        title="Manage hospital branches"
        description="Keep branch locations and contact details current for this hospital network."
        action={<Button onClick={openCreate}>Add Branch</Button>}
      />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
        <Input
          aria-label="Search branches"
          placeholder="Search by name, code, city, or address"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Select value={status} onChange={(event) => setStatus(event.target.value as "All" | "Active" | "Inactive")}>
          <option value="All">All statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </Select>
      </div>

      {error ? <p className="text-sm text-[color:var(--danger)]">{error}</p> : null}
      {loading ? <Card>Loading branches...</Card> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {branches.map((branch) => (
          <Card key={branch.id} className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">{branch.name}</h2>
                <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">{branch.code}</p>
              </div>
              <Badge variant={branch.active ? "success" : "neutral"}>{branch.active ? "Active" : "Inactive"}</Badge>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                <p className="text-sm font-semibold">Location</p>
                <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                  {branch.address}, {branch.city}
                </p>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-4">
                <p className="text-sm font-semibold">Contact</p>
                <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                  {branch.phone || branch.email || "Not assigned"}
                </p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => openEdit(branch)}>
              Edit Branch
            </Button>
          </Card>
        ))}
      </div>

      <Modal
        open={modalOpen}
        title={editingBranch ? "Edit branch" : "Add branch"}
        description="Update branch location, contact, and service status details."
        onClose={() => setModalOpen(false)}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void saveBranch();
          }}
        >
          {[
            ["name", "Branch Name"],
            ["code", "Branch Code"],
            ["address", "Address"],
            ["city", "City"],
            ["state", "State"],
            ["postalCode", "Postal Code"],
            ["phone", "Phone"],
            ["email", "Email"],
          ].map(([field, label]) => (
            <div key={field}>
              <label className="mb-2 block text-sm font-medium" htmlFor={`branch-${field}`}>
                {label}
              </label>
              <Input
                id={`branch-${field}`}
                value={String(draft[field as keyof BranchDraft])}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
              />
              {fieldErrors[field] ? (
                <p className="mt-2 text-sm text-[color:var(--danger)]">{fieldErrors[field]}</p>
              ) : null}
            </div>
          ))}
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="branch-active">
              Status
            </label>
            <Select
              id="branch-active"
              value={draft.active ? "Active" : "Inactive"}
              onChange={(event) =>
                setDraft((current) => ({ ...current, active: event.target.value === "Active" }))
              }
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </Select>
          </div>
          <Button type="submit">{editingBranch ? "Save Changes" : "Create Branch"}</Button>
        </form>
      </Modal>
    </div>
  );
}
