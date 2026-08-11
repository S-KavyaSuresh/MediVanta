import assert from "node:assert/strict";
import { createServer } from "node:http";

import { app } from "../app.js";
import { query } from "../db/client.js";

const origin = "http://localhost:3000";
const port = 4111;
const baseUrl = `http://127.0.0.1:${port}`;
const password = "Medi2026!Care";
const targetAppointmentId = "APT-2004";
const targetPatientId = "user-patient";

type HttpResult<T> = {
  status: number;
  durationMs: number;
  payload: T;
  cookie: string;
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
  const result = await requestJson<{ success: boolean }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, remember: true }),
  });

  assert.equal(result.status, 200, `Login failed for ${email}`);
  return result;
}

async function cleanup(ids: {
  medicalRecordId?: string;
  prescriptionId?: string;
}) {
  await query("delete from prescription_medicines where prescription_id = $1", [
    ids.prescriptionId ?? null,
  ]);
  await query("delete from prescriptions where id = $1", [ids.prescriptionId ?? null]);
  await query("delete from medical_records where id = $1", [ids.medicalRecordId ?? null]);
  await query("delete from queue_entries where appointment_id = $1 and id <> 'Q-3103'", [
    targetAppointmentId,
  ]);
  await query("update appointments set status = 'Scheduled' where id = $1", [targetAppointmentId]);
}

async function run() {
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve());
  });

  const createdIds: { medicalRecordId?: string; prescriptionId?: string } = {};

  try {
    await cleanup(createdIds);

    const receptionistLogin = await login("receptionist@medivanta.demo");
    console.log(`MEASURE login.reception ${receptionistLogin.durationMs}ms`);

    const sessionResult = await requestJson("/api/auth/me", {}, receptionistLogin.cookie);
    console.log(`MEASURE auth.me ${sessionResult.durationMs}ms`);

    const stateResult = await requestJson("/api/hospital/state", {}, receptionistLogin.cookie);
    console.log(`MEASURE dashboard.initial-state ${stateResult.durationMs}ms`);

    const checkInResult = await requestJson<{
      state: { appointments: Array<{ id: string; status: string }> };
    }>(
      `/api/hospital/appointments/${targetAppointmentId}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "Checked in" }),
      },
      receptionistLogin.cookie,
    );
    console.log(`MEASURE appointment.check-in ${checkInResult.durationMs}ms`);
    assert.equal(checkInResult.status, 200, "Check-in failed");

    const logoutResult = await requestJson("/api/auth/logout", { method: "POST" }, receptionistLogin.cookie);
    console.log(`MEASURE logout.reception ${logoutResult.durationMs}ms`);

    const doctorLogin = await login("doctor@medivanta.demo");
    console.log(`MEASURE login.doctor ${doctorLogin.durationMs}ms`);

    const navigationStateResult = await requestJson("/api/hospital/state", {}, doctorLogin.cookie);
    console.log(`MEASURE dashboard.navigation-state ${navigationStateResult.durationMs}ms`);

    const startConsultationResult = await requestJson(
      `/api/hospital/appointments/${targetAppointmentId}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "In consultation" }),
      },
      doctorLogin.cookie,
    );
    console.log(`MEASURE appointment.start-consultation ${startConsultationResult.durationMs}ms`);
    assert.equal(startConsultationResult.status, 200, "Start consultation failed");

    const prescriptionResult = await requestJson<{
      patch?: { prescriptions?: Array<{ id: string }> };
    }>(
      "/api/hospital/prescriptions",
      {
        method: "POST",
        body: JSON.stringify({
          patientId: targetPatientId,
          appointmentId: targetAppointmentId,
          instructions: "Take after meals for three days.",
          medicines: [
            {
              medicineName: "Paracetamol",
              dosage: "1 tablet",
              frequency: "Twice daily",
              duration: "3 days",
            },
          ],
        }),
      },
      doctorLogin.cookie,
    );
    console.log(`MEASURE prescription.create ${prescriptionResult.durationMs}ms`);
    assert.equal(prescriptionResult.status, 201, "Prescription create failed");
    createdIds.prescriptionId = prescriptionResult.payload.patch?.prescriptions?.[0]?.id;

    const medicalRecordResult = await requestJson<{
      patch?: { medicalRecords?: Array<{ id: string }> };
    }>(
      "/api/hospital/medical-records",
      {
        method: "POST",
        body: JSON.stringify({
          patientId: targetPatientId,
          appointmentId: targetAppointmentId,
          visitDate: "2026-08-11",
          diagnosis: "Follow-up review",
          clinicalNotes: "Patient stable during consultation.",
          treatmentAdvice: "Continue hydration and rest.",
        }),
      },
      doctorLogin.cookie,
    );
    console.log(`MEASURE medical-record.create ${medicalRecordResult.durationMs}ms`);
    assert.equal(medicalRecordResult.status, 201, "Medical record create failed");
    createdIds.medicalRecordId = medicalRecordResult.payload.patch?.medicalRecords?.[0]?.id;

    const doctorLogoutResult = await requestJson("/api/auth/logout", { method: "POST" }, doctorLogin.cookie);
    console.log(`MEASURE logout.doctor ${doctorLogoutResult.durationMs}ms`);
  } finally {
    await cleanup(createdIds);
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
