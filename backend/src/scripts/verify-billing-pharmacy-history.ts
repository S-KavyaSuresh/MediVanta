import assert from "node:assert/strict";
import { createServer } from "node:http";

import { app } from "../app.js";
import { query } from "../db/client.js";
import { initializeDataStore } from "../services/seed-service.js";

const origin = "http://localhost:3000";
const port = 4113;
const baseUrl = `http://127.0.0.1:${port}`;
const password = "Medi2026!Care";
const patientId = "user-patient";
const appointmentId = "APT-2004";
const gelusilBatchNumber = "GSL-2020-A";

type InvoiceSummary = {
  id: string;
  invoiceNumber: string;
  totalCents: number;
  amountDueCents: number;
  paymentStatus: string;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unitAmountCents: number;
    totalAmountCents: number;
  }>;
};

type HttpResult<T> = {
  status: number;
  durationMs: number;
  payload: T;
  cookie: string;
};

type AuthSessionPayload = {
  session: {
    user: {
      id: string;
    };
  };
};

type HospitalStatePayload = {
  state: {
    medicineCatalog: Array<{
      id: string;
      name: string;
      strength?: string;
      unit: string;
    }>;
    inventoryItems: Array<{
      id: string;
      batchNumber: string;
      quantityInStock: number;
      unitPriceCents: number;
      medicineId?: string;
      medicineName: string;
      unit: string;
    }>;
  };
};

function combineCookies(existingCookie: string, response: Response) {
  const header = response.headers.get("set-cookie");
  if (!header) {
    return existingCookie;
  }

  const nextPairs = header
    .split(/,(?=\s*medivanta_)/)
    .map((value) => value.split(";")[0]?.trim())
    .filter(Boolean);
  const merged = new Map<string, string>();

  for (const pair of existingCookie.split(";").map((value) => value.trim()).filter(Boolean)) {
    const [key, rawValue] = pair.split("=");
    if (key && rawValue) {
      merged.set(key, rawValue);
    }
  }

  for (const pair of nextPairs) {
    const [key, rawValue] = pair.split("=");
    if (key && rawValue) {
      merged.set(key, rawValue);
    }
  }

  return [...merged.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  cookie = "",
): Promise<HttpResult<T>> {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      origin,
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  const durationMs = Number((performance.now() - startedAt).toFixed(2));
  const payload = (await response.json()) as T;

  return {
    status: response.status,
    durationMs,
    payload,
    cookie: combineCookies(cookie, response),
  };
}

async function login(email: string) {
  const result = await requestJson<AuthSessionPayload>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, remember: true }),
  });

  assert.equal(result.status, 200, `Login failed for ${email}`);
  return result;
}

function getFutureDateIso(daysAhead = 1) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function cleanup(input: {
  createdLabRequestIds: string[];
  createdPrescriptionIds: string[];
  createdInvoiceIds: string[];
  initialGelusilStock?: number;
}) {
  if (input.initialGelusilStock !== undefined) {
    await query(
      "update inventory_items set quantity_in_stock = $2, updated_at = now() where batch_number = $1",
      [gelusilBatchNumber, input.initialGelusilStock],
    );
  }

  if (input.createdInvoiceIds.length > 0) {
    await query(
      "delete from notifications where related_entity_id = any($1::text[])",
      [input.createdInvoiceIds],
    );
    await query("delete from payments where invoice_id = any($1::text[])", [input.createdInvoiceIds]);
    await query("delete from invoice_items where invoice_id = any($1::text[])", [input.createdInvoiceIds]);
    await query("delete from invoices where id = any($1::text[])", [input.createdInvoiceIds]);
  }

  if (input.createdPrescriptionIds.length > 0) {
    await query(
      "delete from notifications where related_entity_id = any($1::text[])",
      [input.createdPrescriptionIds],
    );
    await query("delete from prescription_medicines where prescription_id = any($1::text[])", [
      input.createdPrescriptionIds,
    ]);
    await query("delete from prescriptions where id = any($1::text[])", [input.createdPrescriptionIds]);
  }

  if (input.createdLabRequestIds.length > 0) {
    await query(
      "delete from notifications where related_entity_id = any($1::text[])",
      [input.createdLabRequestIds],
    );
    await query("delete from lab_requests where id = any($1::text[])", [input.createdLabRequestIds]);
  }
}

async function run() {
  const createdLabRequestIds: string[] = [];
  const createdPrescriptionIds: string[] = [];
  const createdInvoiceIds: string[] = [];
  let initialGelusilStock: number | undefined;
  const server = createServer(app);

  await initializeDataStore();
  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve());
  });

  try {
    const patientLogin = await login("patient@medivanta.demo");
    const doctorLogin = await login("doctor@medivanta.demo");
    const pharmacistLogin = await login("pharmacist@medivanta.demo");
    const receptionistLogin = await login("receptionist@medivanta.demo");

    const patientLabRequest = await requestJson<{
      patch?: { labRequests?: Array<{ id: string }>; invoices?: InvoiceSummary[] };
    }>(
      "/api/hospital/lab-requests",
      {
        method: "POST",
        body: JSON.stringify({
          testId: "lab-glucose",
          requestedDate: getFutureDateIso(1),
          requestedTime: "09:00",
        }),
      },
      patientLogin.cookie,
    );
    console.log(`TEST patient.lab-request.create ${patientLabRequest.durationMs}ms`);
    assert.equal(patientLabRequest.status, 201, "Patient lab request should succeed");
    const patientInvoice = patientLabRequest.payload.patch?.invoices?.[0];
    const patientLabRequestId = patientLabRequest.payload.patch?.labRequests?.[0]?.id;
    assert.ok(patientInvoice, "Patient lab request should create an invoice");
    assert.ok(patientLabRequestId, "Patient lab request id missing");
    createdInvoiceIds.push(patientInvoice.id);
    createdLabRequestIds.push(patientLabRequestId);

    const patientPayment = await requestJson<{ patch?: { invoices?: InvoiceSummary[] } }>(
      `/api/hospital/invoices/${patientInvoice.id}/payments`,
      {
        method: "POST",
        body: JSON.stringify({
          amount: patientInvoice.amountDueCents / 100,
          method: "Demo Payment",
        }),
      },
      patientLogin.cookie,
    );
    console.log(`TEST patient.invoice.pay ${patientPayment.durationMs}ms`);
    assert.equal(patientPayment.status, 201, "Patient should be able to pay own invoice");
    assert.equal(
      patientPayment.payload.patch?.invoices?.[0]?.paymentStatus,
      "Paid",
      "Patient invoice should be marked paid",
    );

    const alreadyPaid = await requestJson<{ message?: string }>(
      `/api/hospital/invoices/${patientInvoice.id}/payments`,
      {
        method: "POST",
        body: JSON.stringify({
          amount: patientInvoice.amountDueCents / 100,
          method: "Demo Payment",
        }),
      },
      patientLogin.cookie,
    );
    assert.equal(alreadyPaid.status, 400, "Already paid invoice should be rejected");
    assert.equal(alreadyPaid.payload.message, "This invoice has already been paid.");

    const doctorState = await requestJson<HospitalStatePayload>(
      "/api/hospital/state",
      {},
      doctorLogin.cookie,
    );
    const gelusilCatalogItem = doctorState.payload.state.medicineCatalog.find(
      (medicine) => medicine.name.toLowerCase() === "gelusil" && medicine.unit === "tablet",
    );
    assert.ok(gelusilCatalogItem, "Gelusil should be available in the hospital catalog");

    const createPrescription = await requestJson<{
      patch?: {
        prescriptions?: Array<{
          id: string;
          medicines: Array<{ totalQuantity?: number }>;
        }>;
      };
    }>(
      "/api/hospital/prescriptions",
      {
        method: "POST",
        body: JSON.stringify({
          patientId,
          appointmentId,
          instructions: "Take after meals for three days.",
          medicines: [
            {
              medicineId: gelusilCatalogItem.id,
              medicineName: gelusilCatalogItem.name,
              strength: gelusilCatalogItem.strength,
              doseQuantity: 1,
              doseUnit: gelusilCatalogItem.unit,
              dosage: `1 ${gelusilCatalogItem.unit}`,
              frequency: "Once daily",
              durationValue: 3,
              durationUnit: "days",
              duration: "3 days",
              totalQuantity: 3,
            },
          ],
        }),
      },
      doctorLogin.cookie,
    );
    console.log(`TEST doctor.prescription.create ${createPrescription.durationMs}ms`);
    assert.equal(createPrescription.status, 201, "Doctor prescription should succeed");
    const prescriptionId = createPrescription.payload.patch?.prescriptions?.[0]?.id;
    const totalQuantity =
      createPrescription.payload.patch?.prescriptions?.[0]?.medicines?.[0]?.totalQuantity;
    assert.ok(prescriptionId, "Prescription id missing");
    assert.equal(totalQuantity, 3, "Gelusil total quantity should resolve to 3");
    createdPrescriptionIds.push(prescriptionId);

    const pharmacistState = await requestJson<HospitalStatePayload>(
      "/api/hospital/state",
      {},
      pharmacistLogin.cookie,
    );
    const gelusilBatch = pharmacistState.payload.state.inventoryItems.find(
      (item) => item.batchNumber === gelusilBatchNumber,
    );
    assert.ok(gelusilBatch, "Gelusil inventory batch should exist");
    initialGelusilStock = gelusilBatch.quantityInStock;

    const dispensePrescription = await requestJson<{
      patch?: {
        inventoryItems?: Array<{ batchNumber: string; quantityInStock: number }>;
        invoices?: InvoiceSummary[];
      };
    }>(
      `/api/hospital/prescriptions/${prescriptionId}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "Dispensed" }),
      },
      pharmacistLogin.cookie,
    );
    console.log(`TEST pharmacist.prescription.dispense ${dispensePrescription.durationMs}ms`);
    assert.equal(dispensePrescription.status, 200, "Dispensing should succeed");
    const updatedBatch = dispensePrescription.payload.patch?.inventoryItems?.find(
      (item) => item.batchNumber === gelusilBatchNumber,
    );
    assert.equal(
      updatedBatch?.quantityInStock,
      initialGelusilStock - 3,
      "Gelusil stock should reduce by 3",
    );
    const prescriptionInvoice = dispensePrescription.payload.patch?.invoices?.[0];
    assert.ok(prescriptionInvoice, "Dispensing should create an invoice");
    createdInvoiceIds.push(prescriptionInvoice.id);
    assert.equal(prescriptionInvoice.items[0]?.quantity, 3, "Invoice quantity should be 3");
    assert.equal(
      prescriptionInvoice.items[0]?.totalAmountCents,
      1500,
      "Invoice total should be 1500 cents",
    );

    const doubleDispense = await requestJson<{ message?: string }>(
      `/api/hospital/prescriptions/${prescriptionId}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "Dispensed" }),
      },
      pharmacistLogin.cookie,
    );
    assert.equal(doubleDispense.status, 400, "Double dispense should be rejected");
    assert.equal(
      doubleDispense.payload.message,
      "This prescription has already been dispensed.",
    );

    const overpayment = await requestJson<{ message?: string }>(
      `/api/hospital/invoices/${prescriptionInvoice.id}/payments`,
      {
        method: "POST",
        body: JSON.stringify({
          amount: prescriptionInvoice.amountDueCents / 100 + 10,
          method: "Cash",
        }),
      },
      receptionistLogin.cookie,
    );
    assert.equal(overpayment.status, 400, "Overpayment should be rejected");
    assert.equal(
      overpayment.payload.message,
      "Payment cannot exceed the outstanding balance.",
    );

    const receptionistPayment = await requestJson<{ patch?: { invoices?: InvoiceSummary[] } }>(
      `/api/hospital/invoices/${prescriptionInvoice.id}/payments`,
      {
        method: "POST",
        body: JSON.stringify({
          amount: prescriptionInvoice.amountDueCents / 100,
          method: "Cash",
        }),
      },
      receptionistLogin.cookie,
    );
    console.log(`TEST reception.invoice.pay ${receptionistPayment.durationMs}ms`);
    assert.equal(receptionistPayment.status, 201, "Reception payment should succeed");
    assert.equal(
      receptionistPayment.payload.patch?.invoices?.[0]?.paymentStatus,
      "Paid",
      "Reception invoice should be marked paid",
    );

    const largePrescription = await requestJson<{
      patch?: { prescriptions?: Array<{ id: string }> };
    }>(
      "/api/hospital/prescriptions",
      {
        method: "POST",
        body: JSON.stringify({
          patientId,
          appointmentId,
          instructions: "Monitor response and review stock before dispensing.",
          medicines: [
            {
              medicineId: gelusilCatalogItem.id,
              medicineName: gelusilCatalogItem.name,
              strength: gelusilCatalogItem.strength,
              doseQuantity: 100,
              doseUnit: gelusilCatalogItem.unit,
              dosage: `100 ${gelusilCatalogItem.unit}`,
              frequency: "Four times daily",
              durationValue: 1,
              durationUnit: "days",
              duration: "1 days",
              totalQuantity: 400,
            },
          ],
        }),
      },
      doctorLogin.cookie,
    );
    assert.equal(largePrescription.status, 201, "Large prescription should be created");
    const largePrescriptionId = largePrescription.payload.patch?.prescriptions?.[0]?.id;
    assert.ok(largePrescriptionId, "Large prescription id missing");
    createdPrescriptionIds.push(largePrescriptionId);

    const insufficientDispense = await requestJson<{ message?: string }>(
      `/api/hospital/prescriptions/${largePrescriptionId}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "Dispensed" }),
      },
      pharmacistLogin.cookie,
    );
    assert.equal(insufficientDispense.status, 400, "Insufficient stock should be rejected");
    assert.ok(
      insufficientDispense.payload.message?.includes("Insufficient stock for Gelusil"),
      "Insufficient stock message should mention Gelusil",
    );

    const postFailureState = await requestJson<HospitalStatePayload>(
      "/api/hospital/state",
      {},
      pharmacistLogin.cookie,
    );
    const batchAfterFailure = postFailureState.payload.state.inventoryItems.find(
      (item) => item.batchNumber === gelusilBatchNumber,
    );
    assert.equal(
      batchAfterFailure?.quantityInStock,
      initialGelusilStock - 3,
      "Failed dispense must not deduct additional stock",
    );

    const historyNewest = await requestJson<{
      items: Array<{ id: string; createdAt: string }>;
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    }>(
      "/api/hospital/doctor-history?kind=prescriptions&page=1&pageSize=1&sort=newest&datePreset=all",
      {},
      doctorLogin.cookie,
    );
    assert.equal(historyNewest.status, 200, "History endpoint should succeed");
    assert.equal(historyNewest.payload.pageSize, 1, "History should respect page size");
    assert.ok(historyNewest.payload.totalItems >= 1, "History should report total items");

    const historyOldest = await requestJson<{
      items: Array<{ id: string; createdAt: string }>;
    }>(
      "/api/hospital/doctor-history?kind=prescriptions&page=1&pageSize=1&sort=oldest&datePreset=all",
      {},
      doctorLogin.cookie,
    );
    assert.equal(historyOldest.status, 200, "Oldest history query should succeed");
    assert.notEqual(
      historyNewest.payload.items[0]?.id,
      historyOldest.payload.items[0]?.id,
      "Newest and oldest history views should not return the same first record",
    );

    console.log("ASSERT patient payment passed");
    console.log("ASSERT reception payment passed");
    console.log("ASSERT Gelusil quantity 1x1x3 = 3 passed");
    console.log(
      `ASSERT Gelusil inventory ${initialGelusilStock} -> ${initialGelusilStock - 3} passed`,
    );
    console.log("ASSERT medicine invoice 3 x 500 = 1500 cents passed");
    console.log("ASSERT double dispense rejection passed");
    console.log("ASSERT insufficient stock rollback passed");
    console.log("ASSERT history pagination and sorting passed");
  } finally {
    await cleanup({
      createdLabRequestIds,
      createdPrescriptionIds,
      createdInvoiceIds,
      initialGelusilStock,
    });
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

void run();
