import type {
  AppointmentRecord,
  BookingCapacityRecord,
  BookingSessionCapacityRecord,
  DepartmentRecord,
  DoctorRecord,
  HospitalState,
  LabReportRecord,
  LabRequestRecord,
  LabTestRecord,
  MedicalRecordRecord,
  OrganizationRecord,
  PrescriptionMedicineRecord,
  PrescriptionRecord,
  QueueEntryRecord,
  SessionRecord,
  UserRecord,
} from "../domain/types.js";
import { query, withTransaction } from "../db/client.js";

type SqlClient = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : value === "true";
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function insertRows(
  client: SqlClient,
  tableName: string,
  columns: string[],
  rows: Array<Array<unknown>>,
) {
  if (rows.length === 0) {
    return;
  }

  for (const batch of chunk(rows, 100)) {
    const values: unknown[] = [];
    const placeholders = batch.map((row, rowIndex) => {
      const rowPlaceholders = row.map((_value, columnIndex) => {
        values.push(row[columnIndex]);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${rowPlaceholders.join(", ")})`;
    });

    await client.query(
      `insert into ${tableName} (${columns.join(", ")}) values ${placeholders.join(", ")}`,
      values,
    );
  }
}

async function upsertUsers(client: SqlClient, users: UserRecord[]) {
  if (users.length === 0) {
    return;
  }

  const columns = [
    "id",
    "organization_id",
    "email",
    "display_name",
    "role",
    "password_hash",
    "doctor_id",
    "assigned_doctor_id",
    "status",
  ];

  for (const batch of chunk(users, 100)) {
    const values: unknown[] = [];
    const placeholders = batch.map((user, rowIndex) => {
      const row = [
        user.id,
        user.organizationId,
        user.email,
        user.displayName,
        user.role,
        user.passwordHash,
        user.doctorId ?? null,
        user.assignedDoctorId ?? null,
        user.staffStatus ?? null,
      ];

      const rowPlaceholders = row.map((value, columnIndex) => {
        values.push(value);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });

      return `(${rowPlaceholders.join(", ")})`;
    });

    await client.query(
      `insert into users (${columns.join(", ")}) values ${placeholders.join(", ")}
       on conflict (id) do update set
         organization_id = excluded.organization_id,
         email = excluded.email,
         display_name = excluded.display_name,
         role = excluded.role,
         password_hash = excluded.password_hash,
         doctor_id = excluded.doctor_id,
         assigned_doctor_id = excluded.assigned_doctor_id,
         status = excluded.status,
         updated_at = now()`,
      values,
    );
  }
}

function mapOrganization(
  row: Record<string, unknown>,
  settingsRow?: Record<string, unknown>,
): OrganizationRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    address: asString(row.address),
    city: asString(row.city),
    state: asString(row.state),
    contactPhone: asString(row.contact_phone),
    contactEmail: asString(row.contact_email),
    emergencyContact: asString(row.emergency_contact),
    operatingHours: asString(row.operating_hours),
    timezone: asString(row.timezone),
    defaultLanguage: asString(row.default_language),
    emergencyServicesEnabled: settingsRow ? asBoolean(settingsRow.emergency_services_enabled) : undefined,
    defaultConsultationSlotDurationMinutes: settingsRow
      ? asNumber(settingsRow.default_consultation_slot_duration_minutes)
      : undefined,
  };
}

function mapBookingCapacity(
  settingsRow: Record<string, unknown> | undefined,
  sessionRows: Record<string, unknown>[],
): BookingCapacityRecord {
  const sessions: BookingSessionCapacityRecord[] = sessionRows.map((row) => ({
    id: String(row.id),
    label: String(row.label),
    startTime: String(row.start_time),
    endTime: String(row.end_time),
    maxAppointments: asNumber(row.max_appointments),
  }));

  return {
    doctorSlotCapacity: settingsRow ? asNumber(settingsRow.doctor_slot_capacity) : 1,
    defaultMaxAppointmentsPerSession: settingsRow
      ? asNumber(settingsRow.default_max_appointments_per_session)
      : 1,
    labSlotCapacity: settingsRow ? asNumber(settingsRow.lab_slot_capacity) : 1,
    sessions,
  };
}

function mapUserRows(rows: Record<string, unknown>[]) {
  return rows.map((row): UserRecord => ({
    id: String(row.id),
    organizationId: String(row.organization_id),
    email: String(row.email),
    displayName: String(row.display_name),
    role: row.role as UserRecord["role"],
    passwordHash: String(row.password_hash),
    doctorId: asString(row.doctor_id),
    assignedDoctorId: asString(row.assigned_doctor_id),
    patientName: asString(row.patient_name),
    departmentId: asString(row.department_id),
    staffStatus: asString(row.status),
    phoneNumber: asString(row.phone_number),
    gender: asString(row.gender),
    dateOfBirth: asString(row.date_of_birth),
    bloodGroup: asString(row.blood_group),
    address: asString(row.address),
    emergencyContact: asString(row.emergency_contact),
    emergencyContactName: asString(row.emergency_contact_name),
    emergencyContactPhone: asString(row.emergency_contact_phone),
    allergies: asString(row.allergies),
    medicalConditions: asString(row.medical_conditions),
    preferredLanguage: asString(row.preferred_language),
    qualifications: asString(row.qualifications),
    experience: asString(row.experience),
    languages: asString(row.languages),
    consultationFee: asString(row.consultation_fee),
    availableTimings: asString(row.available_timings),
    deskLabel: asString(row.desk_label),
    designation: asString(row.designation),
    shift: asString(row.shift),
    professionalRegistrationNumber: asString(row.professional_registration_number),
    consultationMode: asString(row.consultation_mode),
    profileVerificationStatus: asString(row.profile_verification_status),
    administrativeUnit: asString(row.administrative_unit),
  }));
}

function mapUserRow(row: Record<string, unknown>) {
  return mapUserRows([row])[0] ?? null;
}

export async function loadUsersSnapshot() {
  const result = await query(
    `select
      u.id,
      u.organization_id,
      u.email,
      u.display_name,
      u.role,
      u.password_hash,
      u.doctor_id,
      u.assigned_doctor_id,
      u.status,
      coalesce(pp.patient_name, u.display_name) as patient_name,
      coalesce(dp.department_id, sp.department_id) as department_id,
      coalesce(pp.phone_number, dp.phone_number, sp.phone_number) as phone_number,
      coalesce(pp.gender, dp.gender, sp.gender) as gender,
      pp.date_of_birth,
      pp.blood_group,
      pp.address,
      pp.emergency_contact,
      pp.emergency_contact_name,
      pp.emergency_contact_phone,
      pp.allergies,
      pp.medical_conditions,
      pp.preferred_language,
      coalesce(dp.qualifications, sp.qualifications) as qualifications,
      dp.experience,
      dp.languages,
      dp.consultation_fee,
      dp.available_timings,
      sp.desk_label,
      coalesce(dp.designation, sp.designation) as designation,
      coalesce(dp.shift, sp.shift) as shift,
      coalesce(dp.professional_registration_number, sp.professional_registration_number) as professional_registration_number,
      dp.consultation_mode,
      dp.profile_verification_status,
      sp.administrative_unit
    from users u
    left join patient_profiles pp on pp.user_id = u.id
    left join doctor_profiles dp on dp.user_id = u.id
    left join staff_profiles sp on sp.user_id = u.id
    order by u.created_at asc`,
  );

  return mapUserRows(result.rows);
}

export async function loadUserByEmail(email: string) {
  const result = await query(
    `select
      u.id,
      u.organization_id,
      u.email,
      u.display_name,
      u.role,
      u.password_hash,
      u.doctor_id,
      u.assigned_doctor_id,
      u.status,
      coalesce(pp.patient_name, u.display_name) as patient_name,
      coalesce(dp.department_id, sp.department_id) as department_id,
      coalesce(pp.phone_number, dp.phone_number, sp.phone_number) as phone_number,
      coalesce(pp.gender, dp.gender, sp.gender) as gender,
      pp.date_of_birth,
      pp.blood_group,
      pp.address,
      pp.emergency_contact,
      pp.emergency_contact_name,
      pp.emergency_contact_phone,
      pp.allergies,
      pp.medical_conditions,
      pp.preferred_language,
      coalesce(dp.qualifications, sp.qualifications) as qualifications,
      dp.experience,
      dp.languages,
      dp.consultation_fee,
      dp.available_timings,
      sp.desk_label,
      coalesce(dp.designation, sp.designation) as designation,
      coalesce(dp.shift, sp.shift) as shift,
      coalesce(dp.professional_registration_number, sp.professional_registration_number) as professional_registration_number,
      dp.consultation_mode,
      dp.profile_verification_status,
      sp.administrative_unit
    from users u
    left join patient_profiles pp on pp.user_id = u.id
    left join doctor_profiles dp on dp.user_id = u.id
    left join staff_profiles sp on sp.user_id = u.id
    where lower(u.email) = lower($1)
    limit 1`,
    [email],
  );

  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}

export async function loadUserBySessionId(sessionId: string) {
  const result = await query(
    `select
      u.id,
      u.organization_id,
      u.email,
      u.display_name,
      u.role,
      u.password_hash,
      u.doctor_id,
      u.assigned_doctor_id,
      u.status,
      coalesce(pp.patient_name, u.display_name) as patient_name,
      coalesce(dp.department_id, sp.department_id) as department_id,
      coalesce(pp.phone_number, dp.phone_number, sp.phone_number) as phone_number,
      coalesce(pp.gender, dp.gender, sp.gender) as gender,
      pp.date_of_birth,
      pp.blood_group,
      pp.address,
      pp.emergency_contact,
      pp.emergency_contact_name,
      pp.emergency_contact_phone,
      pp.allergies,
      pp.medical_conditions,
      pp.preferred_language,
      coalesce(dp.qualifications, sp.qualifications) as qualifications,
      dp.experience,
      dp.languages,
      dp.consultation_fee,
      dp.available_timings,
      sp.desk_label,
      coalesce(dp.designation, sp.designation) as designation,
      coalesce(dp.shift, sp.shift) as shift,
      coalesce(dp.professional_registration_number, sp.professional_registration_number) as professional_registration_number,
      dp.consultation_mode,
      dp.profile_verification_status,
      sp.administrative_unit,
      s.expires_at
    from sessions s
    inner join users u on u.id = s.user_id
    left join patient_profiles pp on pp.user_id = u.id
    left join doctor_profiles dp on dp.user_id = u.id
    left join staff_profiles sp on sp.user_id = u.id
    where s.id = $1
    limit 1`,
    [sessionId],
  );

  if (!result.rows[0]) {
    return null;
  }

  return {
    user: mapUserRow(result.rows[0]),
    expiresAt: new Date(String(result.rows[0].expires_at)).toISOString(),
  };
}

export async function replaceSessionForUser(session: SessionRecord) {
  await withTransaction(async (client) => {
    await client.query("delete from sessions where user_id = $1", [session.userId]);
    await client.query(
      "insert into sessions (id, user_id, expires_at, remember) values ($1, $2, $3, $4)",
      [session.id, session.userId, session.expiresAt, session.remember],
    );
  });
}

export async function deleteSessionById(sessionId: string) {
  await query("delete from sessions where id = $1", [sessionId]);
}

export async function deleteExpiredSessions() {
  await query("delete from sessions where expires_at <= now()");
}

export async function loadOrganizationById(organizationId: string) {
  const [organizationResult, settingsResult] = await Promise.all([
    query("select * from organizations where id = $1 limit 1", [organizationId]),
    query("select * from hospital_settings where organization_id = $1 limit 1", [organizationId]),
  ]);

  if (!organizationResult.rows[0]) {
    return null;
  }

  return mapOrganization(organizationResult.rows[0], settingsResult.rows[0]);
}

export async function insertMedicalRecord(record: MedicalRecordRecord) {
  await query(
    `insert into medical_records (
      id, organization_id, patient_id, patient_name, doctor_id, doctor_name,
      appointment_id, hospital_id, visit_date, diagnosis, clinical_notes,
      treatment_advice, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      record.id,
      record.organizationId,
      record.patientId,
      record.patientName,
      record.doctorId,
      record.doctorName,
      record.appointmentId ?? null,
      record.hospitalId,
      record.visitDate,
      record.diagnosis,
      record.clinicalNotes,
      record.treatmentAdvice,
      record.createdAt,
      record.updatedAt ?? null,
    ],
  );
}

export async function updateMedicalRecordDetails(input: {
  recordId: string;
  organizationId: string;
  doctorId: string;
  diagnosis: string;
  clinicalNotes: string;
  treatmentAdvice: string;
  updatedAt: string;
}) {
  await query(
    `update medical_records
     set diagnosis = $4,
         clinical_notes = $5,
         treatment_advice = $6,
         updated_at = $7
     where id = $1 and organization_id = $2 and doctor_id = $3`,
    [
      input.recordId,
      input.organizationId,
      input.doctorId,
      input.diagnosis,
      input.clinicalNotes,
      input.treatmentAdvice,
      input.updatedAt,
    ],
  );
}

export async function insertPrescription(prescription: PrescriptionRecord) {
  await withTransaction(async (client) => {
    await client.query(
      `insert into prescriptions (
        id, organization_id, patient_id, patient_name, doctor_id, doctor_name,
        hospital_id, appointment_id, instructions, status, created_at,
        dispensed_at, dispensed_by_id, dispensed_by_name
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        prescription.id,
        prescription.organizationId,
        prescription.patientId,
        prescription.patientName,
        prescription.doctorId,
        prescription.doctorName,
        prescription.hospitalId,
        prescription.appointmentId ?? null,
        prescription.instructions,
        prescription.status,
        prescription.createdAt,
        prescription.dispensedAt ?? null,
        prescription.dispensedBy?.id ?? null,
        prescription.dispensedBy?.name ?? null,
      ],
    );

    await insertRows(
      client,
      "prescription_medicines",
      ["prescription_id", "display_order", "medicine_name", "dosage", "frequency", "duration"],
      prescription.medicines.map((medicine, index) => [
        prescription.id,
        index,
        medicine.medicineName,
        medicine.dosage,
        medicine.frequency,
        medicine.duration,
      ]),
    );
  });
}

export async function markPrescriptionDispensed(input: {
  prescriptionId: string;
  organizationId: string;
  dispensedAt: string;
  dispensedById: string;
  dispensedByName: string;
}) {
  await query(
    `update prescriptions
     set status = 'Dispensed',
         dispensed_at = $3,
         dispensed_by_id = $4,
         dispensed_by_name = $5
     where id = $1 and organization_id = $2 and status <> 'Dispensed'`,
    [
      input.prescriptionId,
      input.organizationId,
      input.dispensedAt,
      input.dispensedById,
      input.dispensedByName,
    ],
  );
}

async function saveUsersSnapshotWithClient(client: SqlClient, users: UserRecord[]) {
  const userIds = users.map((user) => user.id);

  if (userIds.length > 0) {
    await client.query("delete from patient_profiles where user_id = any($1::text[])", [userIds]);
    await client.query("delete from doctor_profiles where user_id = any($1::text[])", [userIds]);
    await client.query("delete from staff_profiles where user_id = any($1::text[])", [userIds]);
  }

  await upsertUsers(client, users);

  const patientProfiles = users.filter((user) => user.role === "patient");
  await insertRows(
    client,
    "patient_profiles",
    [
      "user_id",
      "patient_name",
      "phone_number",
      "gender",
      "date_of_birth",
      "blood_group",
      "address",
      "emergency_contact",
      "emergency_contact_name",
      "emergency_contact_phone",
      "allergies",
      "medical_conditions",
      "preferred_language",
    ],
    patientProfiles.map((user) => [
      user.id,
      user.patientName ?? user.displayName,
      user.phoneNumber ?? null,
      user.gender ?? null,
      user.dateOfBirth ?? null,
      user.bloodGroup ?? null,
      user.address ?? null,
      user.emergencyContact ?? null,
      user.emergencyContactName ?? null,
      user.emergencyContactPhone ?? null,
      user.allergies ?? null,
      user.medicalConditions ?? null,
      user.preferredLanguage ?? null,
    ]),
  );

  const doctorProfiles = users.filter((user) => user.role === "doctor");
  await insertRows(
    client,
    "doctor_profiles",
    [
      "user_id",
      "department_id",
      "phone_number",
      "gender",
      "designation",
      "specialization",
      "qualifications",
      "experience",
      "languages",
      "consultation_fee",
      "consultation_mode",
      "available_timings",
      "shift",
      "professional_registration_number",
      "profile_verification_status",
    ],
    doctorProfiles.map((user) => [
      user.id,
      user.departmentId ?? null,
      user.phoneNumber ?? null,
      user.gender ?? null,
      user.designation ?? null,
      null,
      user.qualifications ?? null,
      user.experience ?? null,
      user.languages ?? null,
      user.consultationFee ?? null,
      user.consultationMode ?? null,
      user.availableTimings ?? null,
      user.shift ?? null,
      user.professionalRegistrationNumber ?? null,
      user.profileVerificationStatus ?? null,
    ]),
  );

  const staffProfiles = users.filter((user) =>
    ["receptionist", "laboratory", "pharmacist", "administrator"].includes(user.role),
  );
  await insertRows(
    client,
    "staff_profiles",
    [
      "user_id",
      "department_id",
      "phone_number",
      "gender",
      "designation",
      "shift",
      "desk_label",
      "qualifications",
      "professional_registration_number",
      "administrative_unit",
    ],
    staffProfiles.map((user) => [
      user.id,
      user.departmentId ?? null,
      user.phoneNumber ?? null,
      user.gender ?? null,
      user.designation ?? null,
      user.shift ?? null,
      user.deskLabel ?? null,
      user.qualifications ?? null,
      user.professionalRegistrationNumber ?? null,
      user.administrativeUnit ?? null,
    ]),
  );

  await client.query("delete from users where id <> all($1::text[])", [userIds]);
}

export async function saveUsersSnapshot(users: UserRecord[]) {
  await withTransaction(async (client) => {
    await saveUsersSnapshotWithClient(client, users);
  });
}

export async function loadSessionsSnapshot() {
  const result = await query("select id, user_id, expires_at, remember from sessions order by expires_at asc");
  return result.rows.map((row): SessionRecord => ({
    id: String(row.id),
    userId: String(row.user_id),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    remember: Boolean(row.remember),
  }));
}

async function saveSessionsSnapshotWithClient(client: SqlClient, sessions: SessionRecord[]) {
  await client.query("delete from sessions");
  await insertRows(
    client,
    "sessions",
    ["id", "user_id", "expires_at", "remember"],
    sessions.map((session) => [session.id, session.userId, session.expiresAt, session.remember]),
  );
}

export async function saveSessionsSnapshot(sessions: SessionRecord[]) {
  await withTransaction(async (client) => {
    await saveSessionsSnapshotWithClient(client, sessions);
  });
}

export async function loadHospitalStateSnapshot() {
  const organizationResult = await query("select * from organizations order by created_at asc limit 1");
  if (organizationResult.rows.length === 0) {
    return null;
  }

  const organizationRow = organizationResult.rows[0];
  const organizationId = String(organizationRow.id);
  const [settingsResult, sessionsResult, departmentsResult, doctorsResult, appointmentsResult, queueResult, labTestsResult, labRequestsResult, labReportsResult, medicalRecordsResult, prescriptionsResult, prescriptionMedicinesResult] =
    await Promise.all([
      query("select * from hospital_settings where organization_id = $1 limit 1", [organizationId]),
      query("select * from booking_session_capacities where organization_id = $1 order by start_time asc", [organizationId]),
      query("select * from departments where organization_id = $1 order by name asc", [organizationId]),
      query("select * from doctors where organization_id = $1 order by name asc", [organizationId]),
      query("select * from appointments where organization_id = $1 order by appointment_date asc, appointment_time asc", [organizationId]),
      query("select * from queue_entries where organization_id = $1 order by created_at asc", [organizationId]),
      query("select * from lab_tests where organization_id = $1 order by name asc", [organizationId]),
      query("select * from lab_requests where organization_id = $1 order by created_at desc", [organizationId]),
      query("select * from lab_reports where organization_id = $1 order by uploaded_at desc", [organizationId]),
      query("select * from medical_records where organization_id = $1 order by created_at desc", [organizationId]),
      query("select * from prescriptions where organization_id = $1 order by created_at desc", [organizationId]),
      query(
        `select pm.* from prescription_medicines pm
         inner join prescriptions p on p.id = pm.prescription_id
         where p.organization_id = $1
         order by pm.prescription_id asc, pm.display_order asc`,
        [organizationId],
      ),
    ]);

  const settingsRow = settingsResult.rows[0];
  const medicinesByPrescriptionId = new Map<string, PrescriptionMedicineRecord[]>();
  for (const row of prescriptionMedicinesResult.rows) {
    const prescriptionId = String(row.prescription_id);
    const current = medicinesByPrescriptionId.get(prescriptionId) ?? [];
    current.push({
      medicineName: String(row.medicine_name),
      dosage: String(row.dosage),
      frequency: String(row.frequency),
      duration: String(row.duration),
    });
    medicinesByPrescriptionId.set(prescriptionId, current);
  }

  return {
    organization: mapOrganization(organizationRow, settingsRow),
    departments: departmentsResult.rows.map((row): DepartmentRecord => ({
      id: String(row.id),
      organizationId,
      code: String(row.code),
      name: String(row.name),
      description: String(row.description),
      status: row.status as DepartmentRecord["status"],
      location: String(row.location),
    })),
    doctors: doctorsResult.rows.map((row): DoctorRecord => ({
      id: String(row.id),
      organizationId,
      name: String(row.name),
      specialization: String(row.specialization),
      departmentId: String(row.department_id),
      status: row.status as DoctorRecord["status"],
      availability: String(row.availability),
      shiftLabel: String(row.shift_label),
    })),
    appointments: appointmentsResult.rows.map((row): AppointmentRecord => ({
      id: String(row.id),
      organizationId,
      patientId: asString(row.patient_id),
      patientName: String(row.patient_name),
      doctorId: String(row.doctor_id),
      departmentId: String(row.department_id),
      appointmentDate: String(row.appointment_date),
      appointmentTime: String(row.appointment_time),
      status: row.status as AppointmentRecord["status"],
    })),
    queueEntries: queueResult.rows.map((row): QueueEntryRecord => ({
      id: String(row.id),
      organizationId,
      patientName: String(row.patient_name),
      departmentId: String(row.department_id),
      doctorId: asString(row.doctor_id),
      appointmentId: asString(row.appointment_id),
      status: row.status as QueueEntryRecord["status"],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    })),
    medicalRecords: medicalRecordsResult.rows.map((row): MedicalRecordRecord => ({
      id: String(row.id),
      patientId: String(row.patient_id),
      patientName: String(row.patient_name),
      doctorId: String(row.doctor_id),
      doctorName: String(row.doctor_name),
      appointmentId: asString(row.appointment_id),
      hospitalId: String(row.hospital_id),
      organizationId,
      visitDate: String(row.visit_date),
      diagnosis: String(row.diagnosis),
      clinicalNotes: String(row.clinical_notes),
      treatmentAdvice: String(row.treatment_advice),
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: asString(row.updated_at)
        ? new Date(String(row.updated_at)).toISOString()
        : undefined,
    })),
    prescriptions: prescriptionsResult.rows.map((row): PrescriptionRecord => ({
      id: String(row.id),
      patientId: String(row.patient_id),
      patientName: String(row.patient_name),
      doctorId: String(row.doctor_id),
      doctorName: String(row.doctor_name),
      hospitalId: String(row.hospital_id),
      organizationId,
      appointmentId: asString(row.appointment_id),
      medicines: medicinesByPrescriptionId.get(String(row.id)) ?? [],
      instructions: String(row.instructions),
      status: row.status as PrescriptionRecord["status"],
      createdAt: new Date(String(row.created_at)).toISOString(),
      dispensedAt: asString(row.dispensed_at)
        ? new Date(String(row.dispensed_at)).toISOString()
        : undefined,
      dispensedBy: asString(row.dispensed_by_id)
        ? {
            id: String(row.dispensed_by_id),
            name: String(row.dispensed_by_name),
          }
        : undefined,
    })),
    labTests: labTestsResult.rows.map((row): LabTestRecord => ({
      id: String(row.id),
      organizationId,
      name: String(row.name),
    })),
    labRequests: labRequestsResult.rows.map((row): LabRequestRecord => ({
      id: String(row.id),
      patientId: String(row.patient_id),
      hospitalId: String(row.hospital_id),
      organizationId,
      patientName: String(row.patient_name),
      testId: String(row.test_id),
      testName: String(row.test_name),
      departmentId: String(row.department_id),
      requestedDate: String(row.requested_date),
      requestedTime: String(row.requested_time),
      status: row.status as LabRequestRecord["status"],
      createdAt: new Date(String(row.created_at)).toISOString(),
    })),
    labReports: labReportsResult.rows.map((row): LabReportRecord => ({
      id: String(row.id),
      labRequestId: String(row.lab_request_id),
      patientId: String(row.patient_id),
      hospitalId: String(row.hospital_id),
      organizationId,
      testName: String(row.test_name),
      reportTitle: String(row.report_title),
      resultSummary: String(row.result_summary),
      uploadedAt: new Date(String(row.uploaded_at)).toISOString(),
      uploadedBy: {
        id: String(row.uploaded_by_id),
        name: String(row.uploaded_by_name),
      },
      attachment: asString(row.attachment_file_name)
        ? {
            fileName: String(row.attachment_file_name),
            contentType: "application/pdf",
            fileSize: asNumber(row.attachment_file_size),
            contentBase64: String(row.attachment_content_base64),
          }
        : undefined,
    })),
    bookingCapacity: mapBookingCapacity(settingsRow, sessionsResult.rows),
    configuredSupportLines: settingsRow ? asNumber(settingsRow.configured_support_lines) : 0,
  } satisfies HospitalState;
}

async function saveHospitalStateSnapshotWithClient(client: SqlClient, state: HospitalState) {
  await client.query(
      `insert into organizations (
        id, name, slug, address, city, state, contact_phone, contact_email,
        emergency_contact, operating_hours, timezone, default_language, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
      on conflict (id) do update set
        name = excluded.name,
        slug = excluded.slug,
        address = excluded.address,
        city = excluded.city,
        state = excluded.state,
        contact_phone = excluded.contact_phone,
        contact_email = excluded.contact_email,
        emergency_contact = excluded.emergency_contact,
        operating_hours = excluded.operating_hours,
        timezone = excluded.timezone,
        default_language = excluded.default_language,
        updated_at = now()`,
      [
        state.organization.id,
        state.organization.name,
        state.organization.slug,
        state.organization.address ?? null,
        state.organization.city ?? null,
        state.organization.state ?? null,
        state.organization.contactPhone ?? null,
        state.organization.contactEmail ?? null,
        state.organization.emergencyContact ?? null,
        state.organization.operatingHours ?? null,
        state.organization.timezone ?? null,
        state.organization.defaultLanguage ?? null,
      ],
    );

  await client.query(
      `insert into hospital_settings (
        organization_id, doctor_slot_capacity, default_max_appointments_per_session,
        lab_slot_capacity, configured_support_lines, emergency_services_enabled,
        default_consultation_slot_duration_minutes, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, now())
      on conflict (organization_id) do update set
        doctor_slot_capacity = excluded.doctor_slot_capacity,
        default_max_appointments_per_session = excluded.default_max_appointments_per_session,
        lab_slot_capacity = excluded.lab_slot_capacity,
        configured_support_lines = excluded.configured_support_lines,
        emergency_services_enabled = excluded.emergency_services_enabled,
        default_consultation_slot_duration_minutes = excluded.default_consultation_slot_duration_minutes,
        updated_at = now()`,
      [
        state.organization.id,
        state.bookingCapacity.doctorSlotCapacity,
        state.bookingCapacity.defaultMaxAppointmentsPerSession,
        state.bookingCapacity.labSlotCapacity,
        state.configuredSupportLines,
        state.organization.emergencyServicesEnabled ?? true,
        state.organization.defaultConsultationSlotDurationMinutes ?? 30,
      ],
    );

  await client.query("delete from booking_session_capacities where organization_id = $1", [
    state.organization.id,
  ]);
  await insertRows(
      client,
      "booking_session_capacities",
      ["organization_id", "id", "label", "start_time", "end_time", "max_appointments"],
      state.bookingCapacity.sessions.map((session) => [
        state.organization.id,
        session.id,
        session.label,
        session.startTime,
        session.endTime,
        session.maxAppointments,
      ]),
    );

  await client.query(
      "delete from prescription_medicines where prescription_id in (select id from prescriptions where organization_id = $1)",
      [state.organization.id],
    );
  await client.query("delete from prescriptions where organization_id = $1", [state.organization.id]);
  await client.query("delete from lab_reports where organization_id = $1", [state.organization.id]);
  await client.query("delete from medical_records where organization_id = $1", [state.organization.id]);
  await client.query("delete from queue_entries where organization_id = $1", [state.organization.id]);
  await client.query("delete from appointments where organization_id = $1", [state.organization.id]);
  await client.query("delete from lab_requests where organization_id = $1", [state.organization.id]);
  await client.query("delete from lab_tests where organization_id = $1", [state.organization.id]);
  await client.query("delete from doctors where organization_id = $1", [state.organization.id]);
  await client.query("delete from departments where organization_id = $1", [state.organization.id]);

  await insertRows(
      client,
      "departments",
      ["id", "organization_id", "code", "name", "description", "status", "location"],
      state.departments.map((department) => [
        department.id,
        state.organization.id,
        department.code,
        department.name,
        department.description,
        department.status,
        department.location,
      ]),
    );
  await insertRows(
      client,
      "doctors",
      ["id", "organization_id", "name", "specialization", "department_id", "status", "availability", "shift_label"],
      state.doctors.map((doctor) => [
        doctor.id,
        state.organization.id,
        doctor.name,
        doctor.specialization,
        doctor.departmentId,
        doctor.status,
        doctor.availability,
        doctor.shiftLabel,
      ]),
    );
  await insertRows(
      client,
      "lab_tests",
      ["id", "organization_id", "name"],
      state.labTests.map((test) => [test.id, state.organization.id, test.name]),
    );
  await insertRows(
      client,
      "appointments",
      ["id", "organization_id", "patient_id", "patient_name", "doctor_id", "department_id", "appointment_date", "appointment_time", "status"],
      state.appointments.map((appointment) => [
        appointment.id,
        state.organization.id,
        appointment.patientId ?? null,
        appointment.patientName,
        appointment.doctorId,
        appointment.departmentId,
        appointment.appointmentDate,
        appointment.appointmentTime,
        appointment.status,
      ]),
    );
  await insertRows(
      client,
      "queue_entries",
      ["id", "organization_id", "patient_name", "department_id", "doctor_id", "appointment_id", "status", "created_at", "updated_at"],
      state.queueEntries.map((entry) => [
        entry.id,
        state.organization.id,
        entry.patientName,
        entry.departmentId,
        entry.doctorId ?? null,
        entry.appointmentId ?? null,
        entry.status,
        entry.createdAt,
        entry.updatedAt,
      ]),
    );
  await insertRows(
      client,
      "lab_requests",
      ["id", "organization_id", "patient_id", "hospital_id", "patient_name", "test_id", "test_name", "department_id", "requested_date", "requested_time", "status", "created_at"],
      state.labRequests.map((request) => [
        request.id,
        state.organization.id,
        request.patientId,
        request.hospitalId,
        request.patientName,
        request.testId,
        request.testName,
        request.departmentId,
        request.requestedDate,
        request.requestedTime,
        request.status,
        request.createdAt,
      ]),
    );
  await insertRows(
      client,
      "lab_reports",
      [
        "id",
        "organization_id",
        "lab_request_id",
        "patient_id",
        "hospital_id",
        "test_name",
        "report_title",
        "result_summary",
        "uploaded_at",
        "uploaded_by_id",
        "uploaded_by_name",
        "attachment_file_name",
        "attachment_file_size",
        "attachment_content_base64",
      ],
      state.labReports.map((report) => [
        report.id,
        state.organization.id,
        report.labRequestId,
        report.patientId,
        report.hospitalId,
        report.testName,
        report.reportTitle,
        report.resultSummary,
        report.uploadedAt,
        report.uploadedBy.id,
        report.uploadedBy.name,
        report.attachment?.fileName ?? null,
        report.attachment?.fileSize ?? null,
        report.attachment?.contentBase64 ?? null,
      ]),
    );
  await insertRows(
      client,
      "medical_records",
      [
        "id",
        "organization_id",
        "patient_id",
        "patient_name",
        "doctor_id",
        "doctor_name",
        "appointment_id",
        "hospital_id",
        "visit_date",
        "diagnosis",
        "clinical_notes",
        "treatment_advice",
        "created_at",
        "updated_at",
      ],
      state.medicalRecords.map((record) => [
        record.id,
        state.organization.id,
        record.patientId,
        record.patientName,
        record.doctorId,
        record.doctorName,
        record.appointmentId ?? null,
        record.hospitalId,
        record.visitDate,
        record.diagnosis,
        record.clinicalNotes,
        record.treatmentAdvice,
        record.createdAt,
        record.updatedAt ?? null,
      ]),
    );
  await insertRows(
      client,
      "prescriptions",
      [
        "id",
        "organization_id",
        "patient_id",
        "patient_name",
        "doctor_id",
        "doctor_name",
        "hospital_id",
        "appointment_id",
        "instructions",
        "status",
        "created_at",
        "dispensed_at",
        "dispensed_by_id",
        "dispensed_by_name",
      ],
      state.prescriptions.map((prescription) => [
        prescription.id,
        state.organization.id,
        prescription.patientId,
        prescription.patientName,
        prescription.doctorId,
        prescription.doctorName,
        prescription.hospitalId,
        prescription.appointmentId ?? null,
        prescription.instructions,
        prescription.status,
        prescription.createdAt,
        prescription.dispensedAt ?? null,
        prescription.dispensedBy?.id ?? null,
        prescription.dispensedBy?.name ?? null,
      ]),
    );
  await insertRows(
      client,
      "prescription_medicines",
      ["prescription_id", "display_order", "medicine_name", "dosage", "frequency", "duration"],
      state.prescriptions.flatMap((prescription) =>
        prescription.medicines.map((medicine, index) => [
          prescription.id,
          index,
          medicine.medicineName,
          medicine.dosage,
          medicine.frequency,
          medicine.duration,
        ]),
      ),
    );
}

export async function saveHospitalStateSnapshot(state: HospitalState) {
  await withTransaction(async (client) => {
    await saveHospitalStateSnapshotWithClient(client, state);
  });
}

export async function saveSeedSnapshot(input: {
  state: HospitalState;
  users: UserRecord[];
  sessions: SessionRecord[];
}) {
  await withTransaction(async (client) => {
    await saveHospitalStateSnapshotWithClient(client, input.state);
    await saveUsersSnapshotWithClient(client, input.users);
    await saveSessionsSnapshotWithClient(client, input.sessions);
  });
}
