"use client";

import { useMemo, useState } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/providers/toast-provider";
import { getCurrentLocalDateIso, type InventoryItemDraft, type InventoryItemRecord } from "@/lib/hospital-data";

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function getInventoryStatus(item: InventoryItemRecord, today: string) {
  if (item.expiryDate < today) {
    return "Expired";
  }

  const nearExpiryCutoff = new Date(today);
  nearExpiryCutoff.setDate(nearExpiryCutoff.getDate() + 30);
  const cutoffIso = nearExpiryCutoff.toISOString().slice(0, 10);

  if (item.quantityInStock <= 0) {
    return "Out of Stock";
  }

  if (item.quantityInStock <= item.reorderLevel) {
    return "Low Stock";
  }

  if (item.expiryDate <= cutoffIso) {
    return "Near Expiry";
  }

  return "In Stock";
}

const emptyDraft: InventoryItemDraft = {
  medicineName: "",
  genericName: "",
  batchNumber: "",
  quantityInStock: 0,
  unit: "tablet",
  unitPrice: 0,
  expiryDate: "",
  reorderLevel: 0,
  manufacturer: "",
};

export function PharmacyInventoryView() {
  const { createInventoryItem, state, updateInventoryItem } = useHospitalData();
  const { pushToast } = useToast();
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItemRecord | null>(null);
  const [draft, setDraft] = useState<InventoryItemDraft>(emptyDraft);

  const today = getCurrentLocalDateIso();
  const inventoryItems = useMemo(
    () =>
      [...state.inventoryItems]
        .filter((item) =>
          [item.medicineName, item.genericName, item.batchNumber]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .sort((left, right) => left.medicineName.localeCompare(right.medicineName)),
    [query, state.inventoryItems],
  );

  const lowStockCount = state.inventoryItems.filter(
    (item) => getInventoryStatus(item, today) === "Low Stock",
  ).length;
  const outOfStockCount = state.inventoryItems.filter(
    (item) => getInventoryStatus(item, today) === "Out of Stock",
  ).length;
  const nearExpiryCount = state.inventoryItems.filter(
    (item) => getInventoryStatus(item, today) === "Near Expiry",
  ).length;
  const expiredCount = state.inventoryItems.filter(
    (item) => getInventoryStatus(item, today) === "Expired",
  ).length;

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Pharmacy Workspace"
        title="Inventory"
        description="Track medicine batches, manage stock levels, and keep expiry-sensitive inventory visible."
        action={
          <Button
            onClick={() => {
              setEditingItem(null);
              setDraft(emptyDraft);
              setModalOpen(true);
            }}
          >
            + Add batch
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="space-y-2">
          <p className="text-sm text-[color:var(--muted-foreground)]">Inventory batches</p>
          <p className="text-2xl font-semibold">{state.inventoryItems.length}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-sm text-[color:var(--muted-foreground)]">Out of stock</p>
          <p className="text-2xl font-semibold">{outOfStockCount}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-sm text-[color:var(--muted-foreground)]">Low stock</p>
          <p className="text-2xl font-semibold">{lowStockCount}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-sm text-[color:var(--muted-foreground)]">Near expiry</p>
          <p className="text-2xl font-semibold">{nearExpiryCount}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-sm text-[color:var(--muted-foreground)]">Expired batches</p>
          <p className="text-2xl font-semibold">{expiredCount}</p>
        </Card>
      </div>

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search medicine, generic name, or batch"
      />

      {inventoryItems.length > 0 ? (
        <div className="space-y-4">
          {inventoryItems.map((item) => {
            const status = getInventoryStatus(item, today);

            return (
              <Card key={item.id} className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{item.medicineName}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      {item.genericName || "Generic name not specified"} · Batch {item.batchNumber}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-medium">
                      {status}
                    </span>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingItem(item);
                        setDraft({
                          medicineName: item.medicineName,
                          genericName: item.genericName ?? "",
                          batchNumber: item.batchNumber,
                          quantityInStock: item.quantityInStock,
                          unit: item.unit,
                          unitPrice: item.unitPriceCents / 100,
                          expiryDate: item.expiryDate,
                          reorderLevel: item.reorderLevel,
                          manufacturer: item.manufacturer ?? "",
                        });
                        setModalOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                      Stock
                    </p>
                    <p className="mt-1 font-semibold">
                      {item.quantityInStock} {item.unit}
                      {item.quantityInStock === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                      Unit price
                    </p>
                    <p className="mt-1 font-semibold">{formatMoney(item.unitPriceCents)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                      Expiry
                    </p>
                    <p className="mt-1 font-semibold">{item.expiryDate}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-foreground)]">
                      Reorder level
                    </p>
                    <p className="mt-1 font-semibold">{item.reorderLevel}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No inventory available"
          description="Medicine batches will appear here as soon as the pharmacy inventory is updated."
        />
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingItem(null);
          setDraft(emptyDraft);
        }}
        title={editingItem ? "Update inventory batch" : "Add inventory batch"}
        description="Maintain medicine, batch, stock, pricing, and expiry information for pharmacy operations."
      >
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = editingItem
              ? await updateInventoryItem(editingItem.id, draft)
              : await createInventoryItem(draft);

            if (!result.ok) {
              pushToast("Unable to save inventory", result.message ?? "Please review the batch details.");
              return;
            }

            pushToast(
              editingItem ? "Inventory updated" : "Inventory batch added",
              `${draft.medicineName} was saved successfully.`,
            );
            setModalOpen(false);
            setEditingItem(null);
            setDraft(emptyDraft);
          }}
        >
          {[
            ["Medicine name", "medicineName"],
            ["Generic name", "genericName"],
            ["Batch number", "batchNumber"],
            ["Unit", "unit"],
            ["Expiry date", "expiryDate"],
            ["Manufacturer", "manufacturer"],
          ].map(([label, key]) => (
            <div key={key}>
              <label className="mb-2 block text-sm font-medium">{label}</label>
              <Input
                type={key === "expiryDate" ? "date" : "text"}
                value={String(draft[key as keyof InventoryItemDraft] ?? "")}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
            </div>
          ))}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium">Quantity</label>
              <Input
                type="number"
                value={draft.quantityInStock}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    quantityInStock: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Unit price</label>
              <Input
                type="number"
                step="0.01"
                value={draft.unitPrice}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    unitPrice: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Reorder level</label>
              <Input
                type="number"
                value={draft.reorderLevel}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    reorderLevel: Number(event.target.value),
                  }))
                }
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit">{editingItem ? "Save changes" : "Add batch"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
