"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useHospitalData } from "@/components/dashboard/hospital-data-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/providers/toast-provider";
import { apiRequest } from "@/lib/api";
import {
  getCurrentLocalDateIso,
  type PurchaseOrderRecord,
  type PurchaseOrderStatus,
  type SupplierRecord,
} from "@/lib/hospital-data";

type PurchaseOrdersResponse = {
  purchaseOrders: PurchaseOrderRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type SupplierResponse = {
  suppliers: SupplierRecord[];
};

type DraftItem = {
  medicineId: string;
  medicineName: string;
  quantity: number;
  unitCost: number;
};

const emptyDraft = {
  supplierId: "",
  orderDate: getCurrentLocalDateIso(),
  expectedDate: "",
  status: "Draft" as "Draft" | "Ordered" | "Cancelled",
  notes: "",
  items: [] as DraftItem[],
};

export function PharmacyPurchaseOrdersView() {
  const { pushToast } = useToast();
  const { state } = useHospitalData();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"All" | PurchaseOrderStatus>("All");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrderRecord | null>(null);
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrderRecord | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [receiveDraft, setReceiveDraft] = useState<
    Record<string, { receivedQuantity: number; receivedUnitCost: number; batchNumber: string; expiryDate: string }>
  >({});

  const activeSuppliers = useMemo(
    () => suppliers.filter((supplier) => supplier.status === "Active"),
    [suppliers],
  );

  const loadSuppliers = useCallback(async () => {
    const response = await apiRequest<SupplierResponse>("/api/hospital/suppliers?status=Active&page=1&pageSize=100");
    setSuppliers(response.suppliers);
  }, []);

  const loadPurchaseOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<PurchaseOrdersResponse>(
        `/api/hospital/purchase-orders?query=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}&page=${page}&pageSize=8`,
      );
      setPurchaseOrders(response.purchaseOrders);
      setTotalPages(response.pagination.totalPages);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load purchase orders.");
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

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadPurchaseOrders();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [loadPurchaseOrders]);

  const addItem = () => {
    const firstMedicine = state.medicineCatalog[0];
    if (!firstMedicine) {
      pushToast("Medicine catalog unavailable", "Add medicine catalog items before creating a purchase order.");
      return;
    }
    setDraft((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          medicineId: firstMedicine.id,
          medicineName: firstMedicine.name,
          quantity: 1,
          unitCost: 0,
        },
      ],
    }));
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        eyebrow="Pharmacy Workspace"
        title="Purchase Orders"
        description="Create procurement orders, place them with approved suppliers, and receive stock into the existing inventory workflow."
        action={
          <Button
            onClick={() => {
              setEditingOrder(null);
              setDraft(emptyDraft);
              setModalOpen(true);
            }}
          >
            + New purchase order
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
          placeholder="Search PO number, supplier, or medicine"
        />
        <Select
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value as "All" | PurchaseOrderStatus);
          }}
        >
          <option value="All">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="Ordered">Ordered</option>
          <option value="Received">Received</option>
          <option value="Cancelled">Cancelled</option>
        </Select>
      </div>

      {loading ? (
        <Card className="text-sm text-[color:var(--muted-foreground)]">Loading purchase orders...</Card>
      ) : error ? (
        <EmptyState title="Unable to load purchase orders" description={error} />
      ) : purchaseOrders.length > 0 ? (
        <div className="space-y-4">
          {purchaseOrders.map((order) => (
            <Card key={order.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{order.purchaseOrderNumber}</h2>
                  <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                    {order.supplierName ?? "Supplier pending"} · Ordered {order.orderDate}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-[color:var(--border)] px-3 py-1 text-xs font-medium">
                    {order.status}
                  </span>
                  {order.status !== "Received" ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingOrder(order);
                        setDraft({
                          supplierId: order.supplierId,
                          orderDate: order.orderDate,
                          expectedDate: order.expectedDate ?? "",
                          status: order.status === "Cancelled" ? "Cancelled" : (order.status as "Draft" | "Ordered"),
                          notes: order.notes ?? "",
                          items: order.items.map((item) => ({
                            medicineId: item.medicineId ?? "",
                            medicineName: item.medicineName,
                            quantity: item.quantity,
                            unitCost: item.unitCostCents / 100,
                          })),
                        });
                        setModalOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                  ) : null}
                  {order.status === "Ordered" ? (
                    <Button
                      onClick={() => {
                        setReceiveOrder(order);
                        setReceiveDraft(
                          Object.fromEntries(
                            order.items.map((item) => [
                              item.id,
                              {
                                receivedQuantity: item.quantity,
                                receivedUnitCost: item.unitCostCents / 100,
                                batchNumber: "",
                                expiryDate: "",
                              },
                            ]),
                          ),
                        );
                      }}
                    >
                      Receive order
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{item.medicineName}</p>
                        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                          Qty {item.quantity} · Unit cost INR {(item.unitCostCents / 100).toFixed(2)}
                        </p>
                      </div>
                      <p className="font-semibold">INR {(item.lineTotalCents / 100).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
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
          title="No purchase orders yet"
          description="Create a purchase order to track supplier procurement and receive stock into pharmacy inventory."
        />
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingOrder(null);
          setDraft(emptyDraft);
        }}
        title={editingOrder ? "Update purchase order" : "New purchase order"}
        description="Select a supplier, add medicine items from the existing catalog, and save as a draft or active order."
      >
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              const endpoint = editingOrder
                ? `/api/hospital/purchase-orders/${editingOrder.id}`
                : "/api/hospital/purchase-orders";
              const method = editingOrder ? "PATCH" : "POST";
              await apiRequest(endpoint, {
                method,
                body: JSON.stringify(draft),
              });
              pushToast(
                editingOrder ? "Purchase order updated" : "Purchase order created",
                editingOrder ? editingOrder.purchaseOrderNumber : "The new purchase order has been saved.",
              );
              setModalOpen(false);
              setEditingOrder(null);
              setDraft(emptyDraft);
              await loadPurchaseOrders();
            } catch (submitError) {
              pushToast(
                "Unable to save purchase order",
                submitError instanceof Error ? submitError.message : "Please review the purchase order details.",
              );
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">Supplier</label>
              <Select
                value={draft.supplierId}
                onChange={(event) => setDraft((current) => ({ ...current, supplierId: event.target.value }))}
              >
                <option value="">Select supplier</option>
                {activeSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.supplierName}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Status</label>
              <Select
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, status: event.target.value as "Draft" | "Ordered" | "Cancelled" }))
                }
              >
                <option value="Draft">Draft</option>
                <option value="Ordered">Ordered</option>
                {editingOrder ? <option value="Cancelled">Cancelled</option> : null}
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">Order date</label>
              <Input
                type="date"
                value={draft.orderDate}
                onChange={(event) => setDraft((current) => ({ ...current, orderDate: event.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Expected date</label>
              <Input
                type="date"
                value={draft.expectedDate}
                onChange={(event) => setDraft((current) => ({ ...current, expectedDate: event.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Notes</label>
            <Input
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Medicine items</p>
              <Button type="button" variant="secondary" onClick={addItem}>
                Add medicine
              </Button>
            </div>
            {draft.items.map((item, index) => (
              <div
                key={`${item.medicineId}-${index}`}
                className="grid gap-3 rounded-2xl border border-[color:var(--border)] p-4 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto]"
              >
                <Select
                  value={item.medicineId}
                  onChange={(event) => {
                    const medicine = state.medicineCatalog.find((entry) => entry.id === event.target.value);
                    setDraft((current) => ({
                      ...current,
                      items: current.items.map((currentItem, currentIndex) =>
                        currentIndex === index
                          ? {
                              ...currentItem,
                              medicineId: event.target.value,
                              medicineName: medicine?.name ?? currentItem.medicineName,
                            }
                          : currentItem,
                      ),
                    }));
                  }}
                >
                  <option value="">Select medicine</option>
                  {state.medicineCatalog.map((medicine) => (
                    <option key={medicine.id} value={medicine.id}>
                      {medicine.name}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      items: current.items.map((currentItem, currentIndex) =>
                        currentIndex === index
                          ? { ...currentItem, quantity: Number(event.target.value) }
                          : currentItem,
                      ),
                    }))
                  }
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unitCost}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      items: current.items.map((currentItem, currentIndex) =>
                        currentIndex === index
                          ? { ...currentItem, unitCost: Number(event.target.value) }
                          : currentItem,
                      ),
                    }))
                  }
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      items: current.items.filter((_, currentIndex) => currentIndex !== index),
                    }))
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button type="submit">{editingOrder ? "Save changes" : "Create purchase order"}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(receiveOrder)}
        onClose={() => {
          setReceiveOrder(null);
          setReceiveDraft({});
        }}
        title={receiveOrder ? `Receive ${receiveOrder.purchaseOrderNumber}` : "Receive order"}
        description="Capture the received quantity, batch number, expiry date, and unit cost before stock is added to inventory."
      >
        {receiveOrder ? (
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await apiRequest(`/api/hospital/purchase-orders/${receiveOrder.id}/receive`, {
                  method: "POST",
                  body: JSON.stringify({
                    items: receiveOrder.items.map((item) => ({
                      purchaseOrderItemId: item.id,
                      ...receiveDraft[item.id],
                    })),
                  }),
                });
                pushToast("Purchase order received", `${receiveOrder.purchaseOrderNumber} has been added to inventory.`);
                setReceiveOrder(null);
                setReceiveDraft({});
                await loadPurchaseOrders();
              } catch (submitError) {
                pushToast(
                  "Unable to receive purchase order",
                  submitError instanceof Error ? submitError.message : "Please review the received stock details.",
                );
              }
            }}
          >
            {receiveOrder.items.map((item) => (
              <div key={item.id} className="space-y-3 rounded-2xl border border-[color:var(--border)] p-4">
                <div>
                  <p className="font-medium">{item.medicineName}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                    Ordered quantity {item.quantity}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    type="number"
                    min="1"
                    max={item.quantity}
                    value={receiveDraft[item.id]?.receivedQuantity ?? item.quantity}
                    onChange={(event) =>
                      setReceiveDraft((current) => ({
                        ...current,
                        [item.id]: {
                          ...current[item.id],
                          receivedQuantity: Number(event.target.value),
                        },
                      }))
                    }
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={receiveDraft[item.id]?.receivedUnitCost ?? item.unitCostCents / 100}
                    onChange={(event) =>
                      setReceiveDraft((current) => ({
                        ...current,
                        [item.id]: {
                          ...current[item.id],
                          receivedUnitCost: Number(event.target.value),
                        },
                      }))
                    }
                  />
                  <Input
                    value={receiveDraft[item.id]?.batchNumber ?? ""}
                    placeholder="Batch number"
                    onChange={(event) =>
                      setReceiveDraft((current) => ({
                        ...current,
                        [item.id]: {
                          ...current[item.id],
                          batchNumber: event.target.value,
                        },
                      }))
                    }
                  />
                  <Input
                    type="date"
                    value={receiveDraft[item.id]?.expiryDate ?? ""}
                    onChange={(event) =>
                      setReceiveDraft((current) => ({
                        ...current,
                        [item.id]: {
                          ...current[item.id],
                          expiryDate: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
              </div>
            ))}
            <div className="flex justify-end">
              <Button type="submit">Receive into inventory</Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
