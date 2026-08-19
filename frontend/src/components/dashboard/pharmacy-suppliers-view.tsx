"use client";

import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "@/lib/api";
import type { SupplierRecord, SupplierStatus } from "@/lib/hospital-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/providers/toast-provider";

type SupplierResponse = {
  suppliers: SupplierRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

const emptyDraft = {
  supplierName: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  status: "Active" as SupplierStatus,
};

export function PharmacySuppliersView() {
  const { pushToast } = useToast();
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"All" | SupplierStatus>("All");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null);
  const [draft, setDraft] = useState(emptyDraft);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<SupplierResponse>(
        `/api/hospital/suppliers?query=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}&page=${page}&pageSize=8`,
      );
      setSuppliers(response.suppliers);
      setTotalPages(response.pagination.totalPages);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load suppliers.");
    } finally {
      setLoading(false);
    }
  }, [page, query, status]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadSuppliers();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [loadSuppliers]);

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Pharmacy Workspace"
        title="Suppliers"
        description="Keep supplier contacts, account status, and procurement readiness current for pharmacy operations."
        action={
          <Button
            onClick={() => {
              setEditingSupplier(null);
              setDraft(emptyDraft);
              setModalOpen(true);
            }}
          >
            + Add supplier
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
        <Input
          value={query}
          onChange={(event) => {
            setPage(1);
            setQuery(event.target.value);
          }}
          placeholder="Search supplier, contact person, or email"
        />
        <Select
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value as "All" | SupplierStatus);
          }}
        >
          <option value="All">All statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </Select>
      </div>

      {loading ? (
        <Card className="text-sm text-[color:var(--muted-foreground)]">Loading suppliers...</Card>
      ) : error ? (
        <EmptyState title="Unable to load suppliers" description={error} />
      ) : suppliers.length > 0 ? (
        <div className="space-y-4">
          {suppliers.map((supplier) => (
            <Card key={supplier.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{supplier.supplierName}</h2>
                  <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                    {supplier.contactPerson ?? "Contact not assigned"} · {supplier.phone ?? "Phone not added"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-medium">
                    {supplier.status}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditingSupplier(supplier);
                      setDraft({
                        supplierName: supplier.supplierName,
                        contactPerson: supplier.contactPerson ?? "",
                        phone: supplier.phone ?? "",
                        email: supplier.email ?? "",
                        address: supplier.address ?? "",
                        status: supplier.status,
                      });
                      setModalOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                    Email
                  </p>
                  <p className="mt-1 text-sm">{supplier.email ?? "Not provided"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                    Address
                  </p>
                  <p className="mt-1 text-sm">{supplier.address ?? "Not provided"}</p>
                </div>
              </div>
            </Card>
          ))}

          <div className="flex flex-wrap justify-between gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              Previous
            </Button>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Page {page} of {totalPages}
            </p>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No suppliers found"
          description="Add a supplier to start placing purchase orders and tracking procurement contacts."
        />
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingSupplier(null);
          setDraft(emptyDraft);
        }}
        title={editingSupplier ? "Update supplier" : "Add supplier"}
        description="Save the supplier's contact information and operational status for pharmacy procurement."
      >
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              if (editingSupplier) {
                await apiRequest(`/api/hospital/suppliers/${editingSupplier.id}`, {
                  method: "PATCH",
                  body: JSON.stringify(draft),
                });
              } else {
                await apiRequest("/api/hospital/suppliers", {
                  method: "POST",
                  body: JSON.stringify(draft),
                });
              }
              pushToast(
                editingSupplier ? "Supplier updated" : "Supplier created",
                `${draft.supplierName} has been saved.`,
              );
              setModalOpen(false);
              setEditingSupplier(null);
              setDraft(emptyDraft);
              await loadSuppliers();
            } catch (submitError) {
              pushToast(
                "Unable to save supplier",
                submitError instanceof Error ? submitError.message : "Please review the supplier details.",
              );
            }
          }}
        >
          <div>
            <label className="mb-2 block text-sm font-medium">Supplier name</label>
            <Input
              value={draft.supplierName}
              onChange={(event) => setDraft((current) => ({ ...current, supplierName: event.target.value }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">Contact person</label>
              <Input
                value={draft.contactPerson}
                onChange={(event) => setDraft((current) => ({ ...current, contactPerson: event.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Phone</label>
              <Input
                value={draft.phone}
                onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">Email</label>
              <Input
                type="email"
                value={draft.email}
                onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Status</label>
              <Select
                value={draft.status}
                onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as SupplierStatus }))}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Address</label>
            <Input
              value={draft.address}
              onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit">{editingSupplier ? "Save changes" : "Create supplier"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
