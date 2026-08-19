import createHttpError from "http-errors";
import { randomBytes } from "node:crypto";

import type {
  DoctorRatingRecord,
  InventoryItemRecord,
  InvoiceRecord,
  InvoiceStatus,
  PurchaseOrderItemRecord,
  PurchaseOrderRecord,
  PurchaseOrderStatus,
  SafeUser,
  SupplierRecord,
  SupplierStatus,
} from "../domain/types.js";
import { query, withTransaction } from "../db/client.js";
import { writeAuditLog } from "./audit-service.js";
import { getCurrentLocalDateIso } from "../utils/date.js";

function createSupplierId() {
  return `SUP-${Date.now()}-${randomBytes(3).toString("hex")}`;
}

function createPurchaseOrderId() {
  return `PO-${Date.now()}-${randomBytes(3).toString("hex")}`;
}

function createPurchaseOrderNumber() {
  return `MV-PO-${Date.now().toString().slice(-8)}`;
}

function createPurchaseOrderItemId() {
  return `POITEM-${Date.now()}-${randomBytes(3).toString("hex")}`;
}

function createDoctorRatingId() {
  return `DRATE-${Date.now()}-${randomBytes(3).toString("hex")}`;
}

function createInventoryItemId() {
  return `INVSTOCK-${Date.now()}-${randomBytes(3).toString("hex")}`;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  return Number(value);
}

function buildInvoiceStatus(totalCents: number, amountPaidCents: number): InvoiceStatus {
  if (totalCents <= 0) {
    return "Paid";
  }

  if (amountPaidCents <= 0) {
    return "Pending";
  }

  if (amountPaidCents >= totalCents) {
    return "Paid";
  }

  return "Partially Paid";
}

function assertSupplierManager(user: SafeUser) {
  if (user.role !== "pharmacist" && user.role !== "administrator") {
    throw createHttpError(403, "You do not have access to supplier management.");
  }
}

function assertPurchaseOrderManager(user: SafeUser) {
  if (user.role !== "pharmacist" && user.role !== "administrator") {
    throw createHttpError(403, "You do not have access to purchase orders.");
  }
}

type SupplierRow = {
  id: string;
  organization_id: string;
  supplier_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: SupplierStatus;
  created_at: string | Date;
  updated_at: string | Date;
};

function mapSupplier(row: SupplierRow): SupplierRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    supplierName: String(row.supplier_name),
    contactPerson: asString(row.contact_person),
    phone: asString(row.phone),
    email: asString(row.email),
    address: asString(row.address),
    status: row.status,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

type PurchaseOrderRow = {
  id: string;
  purchase_order_number: string;
  organization_id: string;
  supplier_id: string;
  supplier_name: string;
  order_date: string;
  expected_date: string | null;
  status: PurchaseOrderStatus;
  notes: string | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  received_at: string | Date | null;
  received_by_user_id: string | null;
  received_by_name: string | null;
};

type PurchaseOrderItemRow = {
  id: string;
  purchase_order_id: string;
  organization_id: string;
  medicine_id: string | null;
  medicine_name: string;
  quantity: number;
  unit_cost_cents: number;
  line_total_cents: number;
  received_quantity: number | null;
  received_unit_cost_cents: number | null;
  received_batch_number: string | null;
  received_expiry_date: string | null;
  display_order: number;
};

function mapPurchaseOrderItem(row: PurchaseOrderItemRow): PurchaseOrderItemRecord {
  return {
    id: String(row.id),
    purchaseOrderId: String(row.purchase_order_id),
    organizationId: String(row.organization_id),
    medicineId: asString(row.medicine_id),
    medicineName: String(row.medicine_name),
    quantity: asNumber(row.quantity),
    unitCostCents: asNumber(row.unit_cost_cents),
    lineTotalCents: asNumber(row.line_total_cents),
    receivedQuantity:
      row.received_quantity === null || row.received_quantity === undefined
        ? undefined
        : asNumber(row.received_quantity),
    receivedUnitCostCents:
      row.received_unit_cost_cents === null || row.received_unit_cost_cents === undefined
        ? undefined
        : asNumber(row.received_unit_cost_cents),
    receivedBatchNumber: asString(row.received_batch_number),
    receivedExpiryDate: asString(row.received_expiry_date),
    displayOrder: asNumber(row.display_order),
  };
}

function mapPurchaseOrder(
  row: PurchaseOrderRow,
  items: PurchaseOrderItemRecord[],
): PurchaseOrderRecord {
  return {
    id: String(row.id),
    purchaseOrderNumber: String(row.purchase_order_number),
    organizationId: String(row.organization_id),
    supplierId: String(row.supplier_id),
    supplierName: String(row.supplier_name),
    orderDate: String(row.order_date),
    expectedDate: asString(row.expected_date),
    status: row.status,
    notes: asString(row.notes),
    createdBy:
      row.created_by_user_id || row.created_by_name
        ? {
            id: asString(row.created_by_user_id),
            name: asString(row.created_by_name),
          }
        : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    receivedAt: row.received_at ? new Date(String(row.received_at)).toISOString() : undefined,
    receivedBy:
      row.received_by_user_id || row.received_by_name
        ? {
            id: asString(row.received_by_user_id),
            name: asString(row.received_by_name),
          }
        : undefined,
    items,
  };
}

type DoctorRatingRow = {
  id: string;
  organization_id: string;
  appointment_id: string;
  patient_id: string;
  family_member_id: string | null;
  doctor_id: string;
  rating: number;
  review_comment: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function mapDoctorRating(row: DoctorRatingRow): DoctorRatingRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    appointmentId: String(row.appointment_id),
    patientId: String(row.patient_id),
    familyMemberId: asString(row.family_member_id),
    doctorId: String(row.doctor_id),
    rating: asNumber(row.rating),
    reviewComment: asString(row.review_comment),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function normalizePagination(page?: number, pageSize?: number) {
  const safePage = Number.isFinite(page) && page && page > 0 ? Math.floor(page) : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize && pageSize > 0
    ? Math.min(50, Math.floor(pageSize))
    : 10;
  return {
    page: safePage,
    pageSize: safePageSize,
    offset: (safePage - 1) * safePageSize,
  };
}

function buildSupplierValidationErrors(draft: {
  supplierName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  status?: SupplierStatus;
}) {
  const errors: Record<string, string> = {};
  if (!draft.supplierName.trim()) {
    errors.supplierName = "Enter the supplier name.";
  }
  if (draft.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  return errors;
}

export async function listSuppliers(
  user: SafeUser,
  input: { query?: string; status?: "All" | SupplierStatus; page?: number; pageSize?: number },
) {
  assertSupplierManager(user);
  const { page, pageSize, offset } = normalizePagination(input.page, input.pageSize);
  const search = input.query?.trim().toLowerCase() ?? "";
  const filters: unknown[] = [user.organizationId];
  const conditions = ["organization_id = $1"];

  if (input.status && input.status !== "All") {
    filters.push(input.status);
    conditions.push(`status = $${filters.length}`);
  }

  if (search) {
    filters.push(`%${search}%`);
    conditions.push(
      `(lower(supplier_name) like $${filters.length} or lower(coalesce(contact_person, '')) like $${filters.length} or lower(coalesce(email, '')) like $${filters.length})`,
    );
  }

  const whereClause = conditions.join(" and ");
  const countResult = await query<{ count: string }>(
    `select count(*)::text as count from suppliers where ${whereClause}`,
    filters,
  );
  const total = Number(countResult.rows[0]?.count ?? "0");

  filters.push(pageSize, offset);
  const result = await query<SupplierRow>(
    `select *
     from suppliers
     where ${whereClause}
     order by status asc, supplier_name asc
     limit $${filters.length - 1}
     offset $${filters.length}`,
    filters,
  );

  return {
    suppliers: result.rows.map(mapSupplier),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export async function createSupplier(
  user: SafeUser,
  draft: {
    supplierName: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    address?: string;
    status?: SupplierStatus;
  },
) {
  assertSupplierManager(user);
  const errors = buildSupplierValidationErrors(draft);
  if (Object.keys(errors).length > 0) {
    throw createHttpError(400, "Please review the supplier details provided.", { errors });
  }

  const now = new Date().toISOString();
  const supplier: SupplierRecord = {
    id: createSupplierId(),
    organizationId: user.organizationId,
    supplierName: draft.supplierName.trim(),
    contactPerson: draft.contactPerson?.trim() || undefined,
    phone: draft.phone?.trim() || undefined,
    email: draft.email?.trim().toLowerCase() || undefined,
    address: draft.address?.trim() || undefined,
    status: draft.status ?? "Active",
    createdAt: now,
    updatedAt: now,
  };

  await query(
    `insert into suppliers (
      id, organization_id, supplier_name, contact_person, phone, email, address, status, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      supplier.id,
      supplier.organizationId,
      supplier.supplierName,
      supplier.contactPerson ?? null,
      supplier.phone ?? null,
      supplier.email ?? null,
      supplier.address ?? null,
      supplier.status,
      supplier.createdAt,
      supplier.updatedAt,
    ],
  );

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "supplier.created",
    entityType: "supplier",
    entityId: supplier.id,
  });

  return { supplier };
}

export async function updateSupplier(
  user: SafeUser,
  supplierId: string,
  draft: {
    supplierName: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    address?: string;
    status: SupplierStatus;
  },
) {
  assertSupplierManager(user);
  const errors = buildSupplierValidationErrors(draft);
  if (Object.keys(errors).length > 0) {
    throw createHttpError(400, "Please review the supplier details provided.", { errors });
  }

  const existing = await query<SupplierRow>(
    "select * from suppliers where id = $1 and organization_id = $2 limit 1",
    [supplierId, user.organizationId],
  );
  if (!existing.rows[0]) {
    throw createHttpError(404, "Supplier not found.");
  }

  const supplier: SupplierRecord = {
    ...mapSupplier(existing.rows[0]),
    supplierName: draft.supplierName.trim(),
    contactPerson: draft.contactPerson?.trim() || undefined,
    phone: draft.phone?.trim() || undefined,
    email: draft.email?.trim().toLowerCase() || undefined,
    address: draft.address?.trim() || undefined,
    status: draft.status,
    updatedAt: new Date().toISOString(),
  };

  await query(
    `update suppliers
     set supplier_name = $3,
         contact_person = $4,
         phone = $5,
         email = $6,
         address = $7,
         status = $8,
         updated_at = $9
     where id = $1 and organization_id = $2`,
    [
      supplier.id,
      supplier.organizationId,
      supplier.supplierName,
      supplier.contactPerson ?? null,
      supplier.phone ?? null,
      supplier.email ?? null,
      supplier.address ?? null,
      supplier.status,
      supplier.updatedAt,
    ],
  );

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: supplier.status === "Inactive" ? "supplier.deactivated" : "supplier.updated",
    entityType: "supplier",
    entityId: supplier.id,
  });

  return { supplier };
}

function buildPurchaseOrderValidationErrors(draft: {
  supplierId: string;
  orderDate: string;
  expectedDate?: string;
  status: "Draft" | "Ordered";
  items: Array<{
    medicineId: string;
    medicineName: string;
    quantity: number;
    unitCost: number;
  }>;
}) {
  const errors: Record<string, string> = {};
  if (!draft.supplierId.trim()) {
    errors.supplierId = "Select a supplier.";
  }
  if (!draft.orderDate) {
    errors.orderDate = "Select the order date.";
  }
  if (draft.expectedDate && draft.orderDate && draft.expectedDate < draft.orderDate) {
    errors.expectedDate = "Expected date cannot be earlier than the order date.";
  }
  if (draft.items.length === 0) {
    errors.items = "Add at least one medicine item.";
  } else {
    const invalidItemIndex = draft.items.findIndex(
      (item) => !item.medicineId.trim() || item.quantity <= 0 || item.unitCost < 0,
    );
    if (invalidItemIndex >= 0) {
      errors.items = "Each order item requires a medicine, quantity, and unit cost.";
    }
  }
  return errors;
}

export async function listPurchaseOrders(
  user: SafeUser,
  input: { query?: string; status?: "All" | PurchaseOrderStatus; page?: number; pageSize?: number },
) {
  assertPurchaseOrderManager(user);
  const { page, pageSize, offset } = normalizePagination(input.page, input.pageSize);
  const search = input.query?.trim().toLowerCase() ?? "";
  const filters: unknown[] = [user.organizationId];
  const conditions = ["po.organization_id = $1"];

  if (input.status && input.status !== "All") {
    filters.push(input.status);
    conditions.push(`po.status = $${filters.length}`);
  }

  if (search) {
    filters.push(`%${search}%`);
    conditions.push(
      `(lower(po.purchase_order_number) like $${filters.length} or lower(s.supplier_name) like $${filters.length} or exists (
        select 1 from purchase_order_items poi
        where poi.purchase_order_id = po.id and lower(poi.medicine_name) like $${filters.length}
      ))`,
    );
  }

  const whereClause = conditions.join(" and ");
  const countResult = await query<{ count: string }>(
    `select count(*)::text as count
     from purchase_orders po
     inner join suppliers s on s.id = po.supplier_id
     where ${whereClause}`,
    filters,
  );
  const total = Number(countResult.rows[0]?.count ?? "0");

  filters.push(pageSize, offset);
  const orderResult = await query<PurchaseOrderRow>(
    `select
       po.*,
       s.supplier_name
     from purchase_orders po
     inner join suppliers s on s.id = po.supplier_id
     where ${whereClause}
     order by po.created_at desc
     limit $${filters.length - 1}
     offset $${filters.length}`,
    filters,
  );

  const orderIds = orderResult.rows.map((row) => String(row.id));
  const itemsResult = orderIds.length
    ? await query<PurchaseOrderItemRow>(
        `select *
         from purchase_order_items
         where purchase_order_id = any($1::text[])
         order by purchase_order_id asc, display_order asc`,
        [orderIds],
      )
    : { rows: [] as PurchaseOrderItemRow[] };
  const itemsByOrderId = new Map<string, PurchaseOrderItemRecord[]>();
  for (const row of itemsResult.rows) {
    const purchaseOrderId = String(row.purchase_order_id);
    const current = itemsByOrderId.get(purchaseOrderId) ?? [];
    current.push(mapPurchaseOrderItem(row));
    itemsByOrderId.set(purchaseOrderId, current);
  }

  return {
    purchaseOrders: orderResult.rows.map((row) =>
      mapPurchaseOrder(row, itemsByOrderId.get(String(row.id)) ?? []),
    ),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

async function assertSupplierAvailableForOrganization(organizationId: string, supplierId: string) {
  const result = await query<{ id: string; status: SupplierStatus }>(
    "select id, status from suppliers where id = $1 and organization_id = $2 limit 1",
    [supplierId, organizationId],
  );
  if (!result.rows[0]) {
    throw createHttpError(404, "Supplier not found.");
  }
  if (result.rows[0].status !== "Active") {
    throw createHttpError(400, "Only active suppliers can be used for a purchase order.", {
      errors: { supplierId: "Select an active supplier." },
    });
  }
}

async function loadMedicineCatalogMap(
  organizationId: string,
  medicineIds: string[],
) {
  const result = medicineIds.length
    ? await query<{
        id: string;
        organization_id: string;
        name: string;
        generic_name: string | null;
        unit: string;
      }>(
        `select id, organization_id, name, generic_name, unit
         from medicine_catalog
         where organization_id = $1 and id = any($2::text[])`,
        [organizationId, medicineIds],
      )
    : { rows: [] };
  return new Map(result.rows.map((row) => [String(row.id), row]));
}

export async function createPurchaseOrder(
  user: SafeUser,
  draft: {
    supplierId: string;
    orderDate: string;
    expectedDate?: string;
    status: "Draft" | "Ordered";
    notes?: string;
    items: Array<{
      medicineId: string;
      medicineName: string;
      quantity: number;
      unitCost: number;
    }>;
  },
) {
  assertPurchaseOrderManager(user);
  const errors = buildPurchaseOrderValidationErrors(draft);
  if (Object.keys(errors).length > 0) {
    throw createHttpError(400, "Please review the purchase order details provided.", { errors });
  }

  await assertSupplierAvailableForOrganization(user.organizationId, draft.supplierId.trim());
  const medicineMap = await loadMedicineCatalogMap(
    user.organizationId,
    draft.items.map((item) => item.medicineId.trim()),
  );
  if (medicineMap.size !== draft.items.length) {
    throw createHttpError(400, "One or more selected medicines are unavailable.", {
      errors: { items: "Select medicines from the current medicine catalog." },
    });
  }

  const now = new Date().toISOString();
  const purchaseOrderId = createPurchaseOrderId();
  const purchaseOrderNumber = createPurchaseOrderNumber();
  const items: PurchaseOrderItemRecord[] = draft.items.map((item, index) => ({
    id: createPurchaseOrderItemId(),
    purchaseOrderId,
    organizationId: user.organizationId,
    medicineId: item.medicineId.trim(),
    medicineName: medicineMap.get(item.medicineId.trim())?.name ?? item.medicineName.trim(),
    quantity: Math.max(1, Math.round(item.quantity)),
    unitCostCents: Math.round(item.unitCost * 100),
    lineTotalCents: Math.max(1, Math.round(item.quantity)) * Math.round(item.unitCost * 100),
    displayOrder: index,
  }));

  const order: PurchaseOrderRecord = {
    id: purchaseOrderId,
    purchaseOrderNumber,
    organizationId: user.organizationId,
    supplierId: draft.supplierId.trim(),
    orderDate: draft.orderDate,
    expectedDate: draft.expectedDate || undefined,
    status: draft.status,
    notes: draft.notes?.trim() || undefined,
    createdBy: { id: user.id, name: user.displayName },
    createdAt: now,
    updatedAt: now,
    items,
  };

  await withTransaction(async (client) => {
    await client.query(
      `insert into purchase_orders (
        id, purchase_order_number, organization_id, supplier_id, order_date, expected_date,
        status, notes, created_by_user_id, created_by_name, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        order.id,
        order.purchaseOrderNumber,
        order.organizationId,
        order.supplierId,
        order.orderDate,
        order.expectedDate ?? null,
        order.status,
        order.notes ?? null,
        order.createdBy?.id ?? null,
        order.createdBy?.name ?? null,
        order.createdAt,
        order.updatedAt,
      ],
    );

    for (const item of items) {
      await client.query(
        `insert into purchase_order_items (
          id, purchase_order_id, organization_id, medicine_id, medicine_name, quantity,
          unit_cost_cents, line_total_cents, display_order
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          item.id,
          item.purchaseOrderId,
          item.organizationId,
          item.medicineId ?? null,
          item.medicineName,
          item.quantity,
          item.unitCostCents,
          item.lineTotalCents,
          item.displayOrder,
        ],
      );
    }
  });

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: order.status === "Ordered" ? "purchase-order.placed" : "purchase-order.created",
    entityType: "purchase-order",
    entityId: order.id,
  });

  const supplierResult = await query<{ supplier_name: string }>(
    "select supplier_name from suppliers where id = $1 and organization_id = $2 limit 1",
    [order.supplierId, order.organizationId],
  );
  return {
    purchaseOrder: {
      ...order,
      supplierName: supplierResult.rows[0] ? String(supplierResult.rows[0].supplier_name) : undefined,
    },
  };
}

export async function updatePurchaseOrder(
  user: SafeUser,
  purchaseOrderId: string,
  draft: {
    supplierId: string;
    orderDate: string;
    expectedDate?: string;
    status: "Draft" | "Ordered" | "Cancelled";
    notes?: string;
    items: Array<{
      medicineId: string;
      medicineName: string;
      quantity: number;
      unitCost: number;
    }>;
  },
) {
  assertPurchaseOrderManager(user);
  const validationStatus = draft.status === "Cancelled" ? "Draft" : draft.status;
  const errors = buildPurchaseOrderValidationErrors({
    ...draft,
    status: validationStatus,
  });
  if (Object.keys(errors).length > 0) {
    throw createHttpError(400, "Please review the purchase order details provided.", { errors });
  }

  const existingResult = await query<PurchaseOrderRow>(
    `select po.*, s.supplier_name
     from purchase_orders po
     inner join suppliers s on s.id = po.supplier_id
     where po.id = $1 and po.organization_id = $2
     limit 1`,
    [purchaseOrderId, user.organizationId],
  );
  const existing = existingResult.rows[0];
  if (!existing) {
    throw createHttpError(404, "Purchase order not found.");
  }
  if (existing.status === "Received") {
    throw createHttpError(400, "Received purchase orders cannot be edited.");
  }

  await assertSupplierAvailableForOrganization(user.organizationId, draft.supplierId.trim());
  const medicineMap = await loadMedicineCatalogMap(
    user.organizationId,
    draft.items.map((item) => item.medicineId.trim()),
  );
  if (medicineMap.size !== draft.items.length) {
    throw createHttpError(400, "One or more selected medicines are unavailable.", {
      errors: { items: "Select medicines from the current medicine catalog." },
    });
  }

  const updatedAt = new Date().toISOString();
  const items: PurchaseOrderItemRecord[] = draft.items.map((item, index) => ({
    id: createPurchaseOrderItemId(),
    purchaseOrderId,
    organizationId: user.organizationId,
    medicineId: item.medicineId.trim(),
    medicineName: medicineMap.get(item.medicineId.trim())?.name ?? item.medicineName.trim(),
    quantity: Math.max(1, Math.round(item.quantity)),
    unitCostCents: Math.round(item.unitCost * 100),
    lineTotalCents: Math.max(1, Math.round(item.quantity)) * Math.round(item.unitCost * 100),
    displayOrder: index,
  }));

  await withTransaction(async (client) => {
    await client.query(
      `update purchase_orders
       set supplier_id = $3,
           order_date = $4,
           expected_date = $5,
           status = $6,
           notes = $7,
           updated_at = $8
       where id = $1 and organization_id = $2`,
      [
        purchaseOrderId,
        user.organizationId,
        draft.supplierId.trim(),
        draft.orderDate,
        draft.expectedDate ?? null,
        draft.status,
        draft.notes?.trim() || null,
        updatedAt,
      ],
    );
    await client.query(
      "delete from purchase_order_items where purchase_order_id = $1 and organization_id = $2",
      [purchaseOrderId, user.organizationId],
    );
    for (const item of items) {
      await client.query(
        `insert into purchase_order_items (
          id, purchase_order_id, organization_id, medicine_id, medicine_name, quantity,
          unit_cost_cents, line_total_cents, display_order
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          item.id,
          item.purchaseOrderId,
          item.organizationId,
          item.medicineId ?? null,
          item.medicineName,
          item.quantity,
          item.unitCostCents,
          item.lineTotalCents,
          item.displayOrder,
        ],
      );
    }
  });

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: draft.status === "Cancelled" ? "purchase-order.cancelled" : "purchase-order.updated",
    entityType: "purchase-order",
    entityId: purchaseOrderId,
  });

  return listPurchaseOrders(user, { page: 1, pageSize: 1, query: existing.purchase_order_number });
}

export async function receivePurchaseOrder(
  user: SafeUser,
  purchaseOrderId: string,
  draft: {
    items: Array<{
      purchaseOrderItemId: string;
      receivedQuantity: number;
      receivedUnitCost: number;
      batchNumber: string;
      expiryDate: string;
    }>;
  },
) {
  if (user.role !== "pharmacist") {
    throw createHttpError(403, "You do not have access to receive inventory stock.");
  }

  const orderResult = await query<PurchaseOrderRow>(
    `select po.*, s.supplier_name
     from purchase_orders po
     inner join suppliers s on s.id = po.supplier_id
     where po.id = $1 and po.organization_id = $2
     limit 1`,
    [purchaseOrderId, user.organizationId],
  );
  const order = orderResult.rows[0];
  if (!order) {
    throw createHttpError(404, "Purchase order not found.");
  }
  if (order.status === "Received") {
    throw createHttpError(400, "This purchase order has already been received.");
  }
  if (order.status === "Cancelled") {
    throw createHttpError(400, "Cancelled purchase orders cannot be received.");
  }

  const orderItemsResult = await query<PurchaseOrderItemRow>(
    `select *
     from purchase_order_items
     where purchase_order_id = $1 and organization_id = $2
     order by display_order asc`,
    [purchaseOrderId, user.organizationId],
  );
  const orderItems = orderItemsResult.rows.map(mapPurchaseOrderItem);
  const receiveItems = new Map(draft.items.map((item) => [item.purchaseOrderItemId, item]));
  const currentDate = getCurrentLocalDateIso();

  for (const item of orderItems) {
    const received = receiveItems.get(item.id);
    if (!received) {
      throw createHttpError(400, "Provide received details for each purchase order item.", {
        errors: { items: "Complete the received quantity, batch number, and expiry date for every item." },
      });
    }
    if (received.receivedQuantity <= 0 || received.receivedQuantity > item.quantity) {
      throw createHttpError(400, "Received quantity must be within the ordered quantity.", {
        errors: { items: `Received quantity for ${item.medicineName} is invalid.` },
      });
    }
    if (received.receivedUnitCost < 0) {
      throw createHttpError(400, "Received unit cost cannot be negative.", {
        errors: { items: `Received unit cost for ${item.medicineName} is invalid.` },
      });
    }
    if (!received.batchNumber.trim()) {
      throw createHttpError(400, "Batch number is required while receiving stock.", {
        errors: { items: `Enter a batch number for ${item.medicineName}.` },
      });
    }
    if (!received.expiryDate || received.expiryDate <= currentDate) {
      throw createHttpError(400, "Expiry date must be in the future while receiving stock.", {
        errors: { items: `Enter a future expiry date for ${item.medicineName}.` },
      });
    }
  }

  const medicineIds = orderItems.map((item) => item.medicineId).filter(Boolean) as string[];
  const medicineRows = await loadMedicineCatalogMap(user.organizationId, medicineIds);
  const latestInventoryRows = await query<{
    medicine_id: string | null;
    generic_name: string | null;
    unit: string;
    reorder_level: number;
    manufacturer: string | null;
  }>(
    `select distinct on (medicine_id)
       medicine_id, generic_name, unit, reorder_level, manufacturer
     from inventory_items
     where organization_id = $1 and medicine_id = any($2::text[])
     order by medicine_id asc, updated_at desc`,
    [user.organizationId, medicineIds.length > 0 ? medicineIds : [""]],
  );
  const inventoryDefaults = new Map(latestInventoryRows.rows.map((row) => [String(row.medicine_id), row]));
  const receivedAt = new Date().toISOString();
  const createdItems: InventoryItemRecord[] = [];

  await withTransaction(async (client) => {
    for (const item of orderItems) {
      const received = receiveItems.get(item.id)!;
      const medicineRow = item.medicineId ? medicineRows.get(item.medicineId) : undefined;
      const inventoryDefault = item.medicineId ? inventoryDefaults.get(item.medicineId) : undefined;
      const unit = medicineRow?.unit ?? inventoryDefault?.unit ?? "unit";
      const genericName = medicineRow?.generic_name ? String(medicineRow.generic_name) : asString(inventoryDefault?.generic_name);
      const reorderLevel =
        inventoryDefault?.reorder_level === undefined || inventoryDefault?.reorder_level === null
          ? 10
          : asNumber(inventoryDefault.reorder_level);
      const inventoryItem: InventoryItemRecord = {
        id: createInventoryItemId(),
        organizationId: user.organizationId,
        medicineId: item.medicineId,
        medicineName: item.medicineName,
        genericName,
        batchNumber: received.batchNumber.trim(),
        quantityInStock: Math.round(received.receivedQuantity),
        unit,
        unitPriceCents: Math.round(received.receivedUnitCost * 100),
        expiryDate: received.expiryDate,
        reorderLevel,
        manufacturer: asString(inventoryDefault?.manufacturer),
        createdAt: receivedAt,
        updatedAt: receivedAt,
      };
      createdItems.push(inventoryItem);

      await client.query(
        `insert into inventory_items (
          id, organization_id, medicine_id, medicine_name, generic_name, batch_number, quantity_in_stock,
          unit, unit_price_cents, expiry_date, reorder_level, manufacturer, created_at, updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          inventoryItem.id,
          inventoryItem.organizationId,
          inventoryItem.medicineId ?? null,
          inventoryItem.medicineName,
          inventoryItem.genericName ?? null,
          inventoryItem.batchNumber,
          inventoryItem.quantityInStock,
          inventoryItem.unit,
          inventoryItem.unitPriceCents,
          inventoryItem.expiryDate,
          inventoryItem.reorderLevel,
          inventoryItem.manufacturer ?? null,
          inventoryItem.createdAt,
          inventoryItem.updatedAt,
        ],
      );

      await client.query(
        `update purchase_order_items
         set received_quantity = $3,
             received_unit_cost_cents = $4,
             received_batch_number = $5,
             received_expiry_date = $6
         where id = $1 and organization_id = $2`,
        [
          item.id,
          user.organizationId,
          Math.round(received.receivedQuantity),
          Math.round(received.receivedUnitCost * 100),
          received.batchNumber.trim(),
          received.expiryDate,
        ],
      );
    }

    await client.query(
      `update purchase_orders
       set status = 'Received',
           received_at = $3,
           received_by_user_id = $4,
           received_by_name = $5,
           updated_at = $3
       where id = $1 and organization_id = $2`,
      [purchaseOrderId, user.organizationId, receivedAt, user.id, user.displayName],
    );
  });

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "purchase-order.received",
    entityType: "purchase-order",
    entityId: purchaseOrderId,
    metadata: {
      inventoryItemCount: String(createdItems.length),
    },
  });

  return {
    inventoryItems: createdItems,
  };
}

async function loadInvoice(invoiceId: string, organizationId: string) {
  const invoiceResult = await query<{
    id: string;
    invoice_number: string;
    patient_id: string;
    patient_name: string;
    family_member_id: string | null;
    organization_id: string;
    hospital_id: string;
    source_type: string | null;
    source_id: string | null;
    created_at: string | Date;
    due_date: string | null;
    subtotal_cents: number;
    discount_cents: number;
    tax_cents: number;
    total_cents: number;
    amount_paid_cents: number;
    amount_due_cents: number;
    payment_status: InvoiceStatus;
  }>(
    `select *
     from invoices
     where id = $1 and organization_id = $2
     limit 1`,
    [invoiceId, organizationId],
  );
  const row = invoiceResult.rows[0];
  if (!row) {
    throw createHttpError(404, "Invoice not found.");
  }
  return {
    id: String(row.id),
    invoiceNumber: String(row.invoice_number),
    patientId: String(row.patient_id),
    patientName: String(row.patient_name),
    familyMemberId: asString(row.family_member_id),
    organizationId: String(row.organization_id),
    hospitalId: String(row.hospital_id),
    sourceType: asString(row.source_type) as InvoiceRecord["sourceType"],
    sourceId: asString(row.source_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    dueDate: asString(row.due_date),
    subtotalCents: asNumber(row.subtotal_cents),
    discountCents: asNumber(row.discount_cents),
    taxCents: asNumber(row.tax_cents),
    totalCents: asNumber(row.total_cents),
    amountPaidCents: asNumber(row.amount_paid_cents),
    amountDueCents: asNumber(row.amount_due_cents),
    paymentStatus: row.payment_status,
    items: [],
    payments: [],
  } satisfies InvoiceRecord;
}

export async function updateInvoiceAdjustments(
  user: SafeUser,
  invoiceId: string,
  draft: {
    discount: number;
    discountType?: "Amount" | "Percentage";
    tax: number;
    taxType?: "Amount" | "Percentage";
  },
) {
  if (user.role !== "receptionist" && user.role !== "administrator") {
    throw createHttpError(403, "You do not have access to update invoice adjustments.");
  }
  if (draft.discount < 0 || draft.tax < 0) {
    throw createHttpError(400, "Discount and tax must be zero or greater.", {
      errors: {
        ...(draft.discount < 0 ? { discount: "Discount cannot be negative." } : {}),
        ...(draft.tax < 0 ? { tax: "Tax cannot be negative." } : {}),
      },
    });
  }

  const invoice = await loadInvoice(invoiceId, user.organizationId);
  if (
    (draft.discountType === "Percentage" && draft.discount > 100) ||
    (draft.taxType === "Percentage" && draft.tax > 100)
  ) {
    throw createHttpError(400, "Percentage adjustments must be between 0 and 100.", {
      errors: {
        ...(draft.discountType === "Percentage" && draft.discount > 100
          ? { discount: "Discount percentage cannot exceed 100." }
          : {}),
        ...(draft.taxType === "Percentage" && draft.tax > 100
          ? { tax: "Tax percentage cannot exceed 100." }
          : {}),
      },
    });
  }

  const discountCents =
    draft.discountType === "Percentage"
      ? Math.round((invoice.subtotalCents * draft.discount) / 100)
      : Math.round(draft.discount * 100);

  if (discountCents > invoice.subtotalCents) {
    throw createHttpError(400, "Discount cannot exceed the invoice subtotal.", {
      errors: { discount: "Discount cannot exceed subtotal." },
    });
  }

  const taxableBaseCents = invoice.subtotalCents - discountCents;
  const taxCents =
    draft.taxType === "Percentage"
      ? Math.round((taxableBaseCents * draft.tax) / 100)
      : Math.round(draft.tax * 100);
  const totalCents = Math.max(taxableBaseCents + taxCents, 0);
  if (invoice.amountPaidCents > totalCents) {
    throw createHttpError(400, "The adjusted total cannot be less than the amount already paid.", {
      errors: { discount: "Review the discount or tax amount." },
    });
  }
  const amountDueCents = Math.max(totalCents - invoice.amountPaidCents, 0);
  const paymentStatus = buildInvoiceStatus(totalCents, invoice.amountPaidCents);

  await query(
    `update invoices
     set discount_cents = $3,
         tax_cents = $4,
         total_cents = $5,
         amount_due_cents = $6,
         payment_status = $7,
         updated_at = now()
     where id = $1 and organization_id = $2`,
    [
      invoiceId,
      user.organizationId,
      discountCents,
      taxCents,
      totalCents,
      amountDueCents,
      paymentStatus,
    ],
  );

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: "billing.adjustments-updated",
    entityType: "invoice",
    entityId: invoiceId,
  });

  return {
    invoice: {
      ...invoice,
      discountCents,
      taxCents,
      totalCents,
      amountDueCents,
      paymentStatus,
    },
  };
}

export async function getDoctorRatingSummary(user: SafeUser, doctorId: string) {
  const doctorResult = await query<{ id: string }>(
    "select id from doctors where id = $1 and organization_id = $2 limit 1",
    [doctorId, user.organizationId],
  );
  if (!doctorResult.rows[0]) {
    throw createHttpError(404, "Doctor not found.");
  }

  const summaryResult = await query<{ average_rating: string | null; rating_count: string }>(
    `select avg(rating)::text as average_rating, count(*)::text as rating_count
     from doctor_ratings
     where organization_id = $1 and doctor_id = $2`,
    [user.organizationId, doctorId],
  );
  return {
    doctorId,
    averageRating: summaryResult.rows[0]?.average_rating
      ? Number(summaryResult.rows[0].average_rating)
      : null,
    ratingCount: Number(summaryResult.rows[0]?.rating_count ?? "0"),
  };
}

export async function listPatientDoctorRatings(user: SafeUser) {
  if (user.role !== "patient") {
    throw createHttpError(403, "You do not have access to doctor ratings.");
  }

  const result = await query<DoctorRatingRow>(
    `select *
     from doctor_ratings
     where organization_id = $1 and patient_id = $2
     order by updated_at desc`,
    [user.organizationId, user.id],
  );
  return {
    ratings: result.rows.map(mapDoctorRating),
  };
}

export async function upsertDoctorRating(
  user: SafeUser,
  draft: {
    appointmentId: string;
    rating: number;
    reviewComment?: string;
  },
) {
  if (user.role !== "patient") {
    throw createHttpError(403, "Only patients can submit doctor ratings.");
  }
  if (!Number.isInteger(draft.rating) || draft.rating < 1 || draft.rating > 5) {
    throw createHttpError(400, "Select a rating from 1 to 5.", {
      errors: { rating: "Select a rating from 1 to 5." },
    });
  }

  const appointmentResult = await query<{
    id: string;
    organization_id: string;
    patient_id: string | null;
    family_member_id: string | null;
    doctor_id: string;
    status: string;
  }>(
    `select id, organization_id, patient_id, family_member_id, doctor_id, status
     from appointments
     where id = $1 and organization_id = $2
     limit 1`,
    [draft.appointmentId, user.organizationId],
  );
  const appointment = appointmentResult.rows[0];
  if (!appointment) {
    throw createHttpError(404, "Appointment not found.");
  }
  if (String(appointment.patient_id) !== user.id) {
    throw createHttpError(403, "You can only rate doctors for your own completed appointments.");
  }
  if (String(appointment.status) !== "Completed") {
    throw createHttpError(400, "Doctor ratings are available after the appointment is completed.", {
      errors: { appointmentId: "Only completed appointments can be rated." },
    });
  }

  const existingResult = await query<DoctorRatingRow>(
    `select *
     from doctor_ratings
     where organization_id = $1 and appointment_id = $2
     limit 1`,
    [user.organizationId, draft.appointmentId],
  );
  const existing = existingResult.rows[0];
  const now = new Date().toISOString();
  const reviewComment = draft.reviewComment?.trim() || undefined;
  const ratingRecord: DoctorRatingRecord = existing
    ? {
        ...mapDoctorRating(existing),
        rating: draft.rating,
        reviewComment,
        updatedAt: now,
      }
    : {
        id: createDoctorRatingId(),
        organizationId: user.organizationId,
        appointmentId: draft.appointmentId,
        patientId: user.id,
        familyMemberId: asString(appointment.family_member_id),
        doctorId: String(appointment.doctor_id),
        rating: draft.rating,
        reviewComment,
        createdAt: now,
        updatedAt: now,
      };

  if (existing) {
    if (existing.patient_id !== user.id) {
      throw createHttpError(403, "You can only update your own doctor rating.");
    }
    await query(
      `update doctor_ratings
       set rating = $3,
           review_comment = $4,
           updated_at = $5
       where id = $1 and organization_id = $2`,
      [ratingRecord.id, user.organizationId, ratingRecord.rating, ratingRecord.reviewComment ?? null, now],
    );
  } else {
    await query(
      `insert into doctor_ratings (
        id, organization_id, appointment_id, patient_id, family_member_id, doctor_id,
        rating, review_comment, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        ratingRecord.id,
        ratingRecord.organizationId,
        ratingRecord.appointmentId,
        ratingRecord.patientId,
        ratingRecord.familyMemberId ?? null,
        ratingRecord.doctorId,
        ratingRecord.rating,
        ratingRecord.reviewComment ?? null,
        ratingRecord.createdAt,
        ratingRecord.updatedAt,
      ],
    );
  }

  await writeAuditLog({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: existing ? "doctor-rating.updated" : "doctor-rating.created",
    entityType: "doctor-rating",
    entityId: ratingRecord.id,
    metadata: {
      appointmentId: ratingRecord.appointmentId,
      doctorId: ratingRecord.doctorId,
    },
  });

  return {
    rating: ratingRecord,
    summary: await getDoctorRatingSummary(user, ratingRecord.doctorId),
  };
}
