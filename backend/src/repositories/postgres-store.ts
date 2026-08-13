import type {
  AppointmentRecord,
  AppointmentStatus,
  BookingCapacityRecord,
  BookingSessionCapacityRecord,
  ClinicalAttachmentRecord,
  DepartmentRecord,
  DoctorRecord,
  EmergencyVisitRecord,
  FamilyMemberRecord,
  HospitalState,
  InventoryItemRecord,
  InvoiceItemRecord,
  InvoiceRecord,
  InvoiceStatus,
  LabReportRecord,
  LabRequestStatus,
  LabRequestRecord,
  LabTestRecord,
  MedicineCatalogRecord,
  MedicalRecordRecord,
  MedicalHistoryEntryRecord,
  NotificationRecord,
  OrganizationRecord,
  PaymentMethod,
  PaymentRecord,
  PatientJourneyRecord,
  PrescriptionMedicineRecord,
  PrescriptionRecord,
  QueuePriority,
  QueueEntryRecord,
  QueueStatus,
  SessionRecord,
  TelemedicineSessionRecord,
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

function asTimestampString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === "string" ? value : undefined;
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
    "email_verified",
    "password_reset_required",
    "reset_token_hash",
    "reset_otp_hash",
    "reset_expires_at",
    "verification_token_hash",
    "verification_otp_hash",
    "verification_expires_at",
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
        user.emailVerified ?? true,
        user.passwordResetRequired ?? false,
        user.resetTokenHash ?? null,
        user.resetOtpHash ?? null,
        user.resetExpiresAt ?? null,
        user.verificationTokenHash ?? null,
        user.verificationOtpHash ?? null,
        user.verificationExpiresAt ?? null,
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
         email_verified = excluded.email_verified,
         password_reset_required = excluded.password_reset_required,
         reset_token_hash = excluded.reset_token_hash,
         reset_otp_hash = excluded.reset_otp_hash,
         reset_expires_at = excluded.reset_expires_at,
         verification_token_hash = excluded.verification_token_hash,
         verification_otp_hash = excluded.verification_otp_hash,
         verification_expires_at = excluded.verification_expires_at,
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
    addressLine1: asString(row.address_line_1),
    addressLine2: asString(row.address_line_2),
    city: asString(row.city),
    state: asString(row.state),
    postalCode: asString(row.postal_code),
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
    emailVerified: typeof row.email_verified === "boolean" ? row.email_verified : true,
    passwordResetRequired:
      typeof row.password_reset_required === "boolean" ? row.password_reset_required : false,
    resetTokenHash: asString(row.reset_token_hash),
    resetOtpHash: asString(row.reset_otp_hash),
    resetExpiresAt: asTimestampString(row.reset_expires_at),
    verificationTokenHash: asString(row.verification_token_hash),
    verificationOtpHash: asString(row.verification_otp_hash),
    verificationExpiresAt: asTimestampString(row.verification_expires_at),
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
      pp.address_line_1,
      pp.address_line_2,
      pp.city,
      pp.state,
      pp.postal_code,
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
      u.email_verified,
      u.password_reset_required,
      u.reset_token_hash,
      u.reset_otp_hash,
      u.reset_expires_at,
      u.verification_token_hash,
      u.verification_otp_hash,
      u.verification_expires_at
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
      pp.address_line_1,
      pp.address_line_2,
      pp.city,
      pp.state,
      pp.postal_code,
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
      u.email_verified,
      u.password_reset_required,
      u.reset_token_hash,
      u.reset_otp_hash,
      u.reset_expires_at,
      u.verification_token_hash,
      u.verification_otp_hash,
      u.verification_expires_at
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

export async function loadUserById(userId: string) {
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
      pp.address_line_1,
      pp.address_line_2,
      pp.city,
      pp.state,
      pp.postal_code,
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
      u.email_verified,
      u.password_reset_required,
      u.reset_token_hash,
      u.reset_otp_hash,
      u.reset_expires_at,
      u.verification_token_hash,
      u.verification_otp_hash,
      u.verification_expires_at
    from users u
    left join patient_profiles pp on pp.user_id = u.id
    left join doctor_profiles dp on dp.user_id = u.id
    left join staff_profiles sp on sp.user_id = u.id
    where u.id = $1
    limit 1`,
    [userId],
  );

  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
}

export async function updateUserAuthState(
  userId: string,
  updates: {
    passwordHash?: string | null;
    emailVerified?: boolean;
    passwordResetRequired?: boolean;
    resetTokenHash?: string | null;
    resetOtpHash?: string | null;
    resetExpiresAt?: string | null;
    verificationTokenHash?: string | null;
    verificationOtpHash?: string | null;
    verificationExpiresAt?: string | null;
  },
) {
  const assignments: string[] = [];
  const params: unknown[] = [userId];

  const pushAssignment = (column: string, value: unknown) => {
    params.push(value);
    assignments.push(`${column} = $${params.length}`);
  };

  if (updates.passwordHash !== undefined) {
    pushAssignment("password_hash", updates.passwordHash);
  }

  if (updates.emailVerified !== undefined) {
    pushAssignment("email_verified", updates.emailVerified);
  }

  if (updates.passwordResetRequired !== undefined) {
    pushAssignment("password_reset_required", updates.passwordResetRequired);
  }

  if (updates.resetTokenHash !== undefined) {
    pushAssignment("reset_token_hash", updates.resetTokenHash);
  }

  if (updates.resetOtpHash !== undefined) {
    pushAssignment("reset_otp_hash", updates.resetOtpHash);
  }

  if (updates.resetExpiresAt !== undefined) {
    pushAssignment("reset_expires_at", updates.resetExpiresAt);
  }

  if (updates.verificationTokenHash !== undefined) {
    pushAssignment("verification_token_hash", updates.verificationTokenHash);
  }

  if (updates.verificationOtpHash !== undefined) {
    pushAssignment("verification_otp_hash", updates.verificationOtpHash);
  }

  if (updates.verificationExpiresAt !== undefined) {
    pushAssignment("verification_expires_at", updates.verificationExpiresAt);
  }

  assignments.push("updated_at = now()");

  await query(
    `update users
     set ${assignments.join(", ")}
     where id = $1`,
    params,
  );
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
      pp.address_line_1,
      pp.address_line_2,
      pp.city,
      pp.state,
      pp.postal_code,
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
      u.email_verified,
      u.password_reset_required,
      u.reset_token_hash,
      u.reset_otp_hash,
      u.reset_expires_at,
      u.verification_token_hash,
      u.verification_otp_hash,
      u.verification_expires_at,
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
      `insert into sessions (
        id, user_id, expires_at, remember, created_at, last_used_at, revoked_at,
        user_agent, device_label, refresh_token_hash
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        session.id,
        session.userId,
        session.expiresAt,
        session.remember,
        session.createdAt ?? new Date().toISOString(),
        session.lastUsedAt ?? new Date().toISOString(),
        session.revokedAt ?? null,
        session.userAgent ?? null,
        session.deviceLabel ?? null,
        session.refreshTokenHash ?? null,
      ],
    );
  });
}

export async function deleteSessionById(sessionId: string) {
  await query("delete from sessions where id = $1", [sessionId]);
}

export async function insertSession(session: SessionRecord) {
  await query(
    `insert into sessions (
      id, user_id, expires_at, remember, created_at, last_used_at, revoked_at,
      user_agent, device_label, refresh_token_hash
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      session.id,
      session.userId,
      session.expiresAt,
      session.remember,
      session.createdAt ?? new Date().toISOString(),
      session.lastUsedAt ?? new Date().toISOString(),
      session.revokedAt ?? null,
      session.userAgent ?? null,
      session.deviceLabel ?? null,
      session.refreshTokenHash ?? null,
    ],
  );
}

export async function revokeSession(sessionId: string) {
  await query("update sessions set revoked_at = now() where id = $1", [sessionId]);
}

export async function updateSessionActivity(sessionId: string) {
  await query("update sessions set last_used_at = now() where id = $1", [sessionId]);
}

export async function loadSessionById(sessionId: string) {
  const result = await query(
    `select
      id,
      user_id,
      expires_at,
      remember,
      created_at,
      last_used_at,
      revoked_at,
      user_agent,
      device_label,
      refresh_token_hash
    from sessions
    where id = $1
    limit 1`,
    [sessionId],
  );

  if (!result.rows[0]) {
    return null;
  }

  const row = result.rows[0];

  return {
    id: String(row.id),
    userId: String(row.user_id),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    remember: Boolean(row.remember),
    createdAt: new Date(String(row.created_at)).toISOString(),
    lastUsedAt: new Date(String(row.last_used_at)).toISOString(),
    revokedAt: asString(row.revoked_at)
      ? new Date(String(row.revoked_at)).toISOString()
      : undefined,
    userAgent: asString(row.user_agent),
    deviceLabel: asString(row.device_label),
    refreshTokenHash: asString(row.refresh_token_hash),
  } satisfies SessionRecord;
}

export async function loadActiveSessionsForUser(userId: string) {
  const result = await query(
    `select
      id,
      user_id,
      expires_at,
      created_at,
      last_used_at,
      user_agent,
      device_label
    from sessions
    where user_id = $1 and revoked_at is null and expires_at > now()
    order by last_used_at desc`,
    [userId],
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString(),
    lastUsedAt: new Date(String(row.last_used_at)).toISOString(),
    deviceLabel: asString(row.device_label),
    userAgent: asString(row.user_agent),
  }));
}

export async function revokeOtherSession(userId: string, sessionId: string) {
  await query(
    "update sessions set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null",
    [sessionId, userId],
  );
}

export async function revokeSessionsForUser(userId: string) {
  await query(
    "update sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
    [userId],
  );
}

export async function insertAuditLog(input: {
  id: string;
  organizationId?: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadataJson?: string;
}) {
  await query(
    `insert into audit_logs (
      id, organization_id, actor_user_id, action, entity_type, entity_id, metadata_json
    ) values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.id,
      input.organizationId ?? null,
      input.actorUserId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.metadataJson ?? null,
    ],
  );
}

export async function loadAuditLogsByOrganization(organizationId: string, limit = 100) {
  const result = await query(
    `select
      id,
      organization_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      metadata_json,
      created_at
    from audit_logs
    where organization_id = $1
    order by created_at desc
    limit $2`,
    [organizationId, limit],
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    organizationId: asString(row.organization_id),
    actorUserId: asString(row.actor_user_id),
    action: String(row.action),
    entityType: String(row.entity_type),
    entityId: asString(row.entity_id),
    metadata: asString(row.metadata_json)
      ? (JSON.parse(String(row.metadata_json)) as Record<string, string>)
      : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
  }));
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

export async function insertLabRequest(request: LabRequestRecord) {
  await query(
    `insert into lab_requests (
      id, organization_id, patient_id, hospital_id, patient_name, family_member_id, test_id,
      test_name, department_id, requested_date, requested_time, status, created_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      request.id,
      request.organizationId,
      request.patientId,
      request.hospitalId,
      request.patientName,
      request.familyMemberId ?? null,
      request.testId,
      request.testName,
      request.departmentId,
      request.requestedDate,
      request.requestedTime,
      request.status,
      request.createdAt,
    ],
  );
}

export async function updateLabRequestStatusById(input: {
  labRequestId: string;
  organizationId: string;
  status: LabRequestStatus;
}) {
  await query(
    `update lab_requests
     set status = $3
     where id = $1 and organization_id = $2`,
    [input.labRequestId, input.organizationId, input.status],
  );
}

export async function insertLabReport(report: LabReportRecord) {
  await query(
    `insert into lab_reports (
      id, organization_id, lab_request_id, patient_id, hospital_id, family_member_id, test_name,
      report_title, result_summary, uploaded_at, uploaded_by_id, uploaded_by_name,
      attachment_file_name, attachment_file_size, attachment_content_base64
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      report.id,
      report.organizationId,
      report.labRequestId,
      report.patientId,
      report.hospitalId,
      report.familyMemberId ?? null,
      report.testName,
      report.reportTitle,
      report.resultSummary,
      report.uploadedAt,
      report.uploadedBy.id,
      report.uploadedBy.name,
      report.attachment?.fileName ?? null,
      report.attachment?.fileSize ?? null,
      report.attachment?.contentBase64 ?? null,
    ],
  );
}

export async function loadLabReportById(labReportId: string, organizationId: string) {
  const result = await query(
    `select
      id,
      organization_id,
      lab_request_id,
      patient_id,
      hospital_id,
      test_name,
      report_title,
      result_summary,
      uploaded_at,
      uploaded_by_id,
      uploaded_by_name,
      attachment_file_name,
      attachment_file_size,
      attachment_content_base64
    from lab_reports
    where id = $1 and organization_id = $2
    limit 1`,
    [labReportId, organizationId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    labRequestId: String(row.lab_request_id),
    patientId: String(row.patient_id),
    hospitalId: String(row.hospital_id),
    organizationId: String(row.organization_id),
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
          contentType: "application/pdf" as const,
          fileSize: asNumber(row.attachment_file_size),
          contentBase64: String(row.attachment_content_base64),
        }
      : undefined,
  } satisfies LabReportRecord;
}

export async function upsertHospitalSettings(input: {
  organization: OrganizationRecord;
  doctorSlotCapacity: number;
  defaultMaxAppointmentsPerSession: number;
  labSlotCapacity: number;
  configuredSupportLines: number;
  sessions: BookingSessionCapacityRecord[];
}) {
  await withTransaction(async (client) => {
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
        input.organization.id,
        input.organization.name,
        input.organization.slug,
        input.organization.address ?? null,
        input.organization.city ?? null,
        input.organization.state ?? null,
        input.organization.contactPhone ?? null,
        input.organization.contactEmail ?? null,
        input.organization.emergencyContact ?? null,
        input.organization.operatingHours ?? null,
        input.organization.timezone ?? null,
        input.organization.defaultLanguage ?? null,
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
        input.organization.id,
        input.doctorSlotCapacity,
        input.defaultMaxAppointmentsPerSession,
        input.labSlotCapacity,
        input.configuredSupportLines,
        input.organization.emergencyServicesEnabled ?? true,
        input.organization.defaultConsultationSlotDurationMinutes ?? 30,
      ],
    );

    await client.query("delete from booking_session_capacities where organization_id = $1", [
      input.organization.id,
    ]);

    await insertRows(
      client,
      "booking_session_capacities",
      ["organization_id", "id", "label", "start_time", "end_time", "max_appointments"],
      input.sessions.map((session) => [
        input.organization.id,
        session.id,
        session.label,
        session.startTime,
        session.endTime,
        session.maxAppointments,
      ]),
    );
  });
}

export async function insertMedicalRecord(record: MedicalRecordRecord) {
  await query(
    `insert into medical_records (
      id, organization_id, patient_id, patient_name, family_member_id, doctor_id, doctor_name,
      appointment_id, hospital_id, visit_date, diagnosis, clinical_notes,
      treatment_advice, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      record.id,
      record.organizationId,
      record.patientId,
      record.patientName,
      record.familyMemberId ?? null,
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

export async function insertAppointment(appointment: AppointmentRecord) {
  await query(
    `insert into appointments (
      id, organization_id, patient_id, patient_name, family_member_id, doctor_id, department_id,
      appointment_date, appointment_time, reason_for_appointment, consultation_mode, status
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      appointment.id,
      appointment.organizationId,
      appointment.patientId ?? null,
      appointment.patientName,
      appointment.familyMemberId ?? null,
      appointment.doctorId,
      appointment.departmentId,
      appointment.appointmentDate,
      appointment.appointmentTime,
      appointment.reasonForAppointment,
      appointment.consultationMode,
      appointment.status,
    ],
  );
}

export async function updateAppointmentRecord(input: {
  appointmentId: string;
  organizationId: string;
  patientName: string;
  familyMemberId?: string;
  doctorId: string;
  departmentId: string;
  appointmentDate: string;
  appointmentTime: string;
  reasonForAppointment: string;
  consultationMode?: "In Person" | "Online";
}) {
  await query(
    `update appointments
     set patient_name = $3,
         family_member_id = $4,
         doctor_id = $5,
         department_id = $6,
         appointment_date = $7,
         appointment_time = $8,
         reason_for_appointment = $9,
         consultation_mode = $10
     where id = $1 and organization_id = $2`,
    [
      input.appointmentId,
      input.organizationId,
      input.patientName,
      input.familyMemberId ?? null,
      input.doctorId,
      input.departmentId,
      input.appointmentDate,
      input.appointmentTime,
      input.reasonForAppointment,
      input.consultationMode ?? "In Person",
    ],
  );
}

export async function insertQueueEntry(entry: QueueEntryRecord) {
  await query(
    `insert into queue_entries (
      id, organization_id, patient_name, department_id, doctor_id,
      appointment_id, priority, status, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entry.id,
      entry.organizationId,
      entry.patientName,
      entry.departmentId,
      entry.doctorId ?? null,
      entry.appointmentId ?? null,
      entry.priority,
      entry.status,
      entry.createdAt,
      entry.updatedAt,
    ],
  );
}

export async function updateQueueEntriesForAppointment(input: {
  organizationId: string;
  appointmentId: string;
  patientName: string;
  doctorId: string;
  departmentId: string;
  createdAt: string;
  updatedAt: string;
  priority?: QueuePriority;
}) {
  await query(
    `update queue_entries
     set patient_name = $3,
         doctor_id = $4,
         department_id = $5,
         created_at = $6,
         updated_at = $7,
         priority = coalesce($8, priority)
     where organization_id = $1 and appointment_id = $2`,
    [
      input.organizationId,
      input.appointmentId,
      input.patientName,
      input.doctorId,
      input.departmentId,
      input.createdAt,
      input.updatedAt,
      input.priority ?? null,
    ],
  );
}

export async function updateAppointmentStatusById(input: {
  appointmentId: string;
  organizationId: string;
  status: AppointmentStatus;
}) {
  await query(
    `update appointments
     set status = $3
     where id = $1 and organization_id = $2`,
    [input.appointmentId, input.organizationId, input.status],
  );
}

export async function updateQueueStatusesByAppointment(input: {
  organizationId: string;
  appointmentId: string;
  status: QueueStatus;
  updatedAt: string;
  excludeCompleted?: boolean;
}) {
  await query(
    `update queue_entries
     set status = $3,
         updated_at = $4
     where organization_id = $1
       and appointment_id = $2
       ${input.excludeCompleted ? "and status <> 'Completed'" : ""}`,
    [
      input.organizationId,
      input.appointmentId,
      input.status,
      input.updatedAt,
    ],
  );
}

export async function loadQueueEntriesByAppointment(
  organizationId: string,
  appointmentId: string,
) {
  const result = await query(
    `select
      id,
      organization_id,
      patient_name,
      department_id,
      doctor_id,
      appointment_id,
      priority,
      status,
      created_at,
      updated_at
    from queue_entries
    where organization_id = $1 and appointment_id = $2
    order by created_at asc`,
    [organizationId, appointmentId],
  );

  return result.rows.map((row): QueueEntryRecord => ({
    id: String(row.id),
    organizationId: String(row.organization_id),
      patientName: String(row.patient_name),
      departmentId: String(row.department_id),
      doctorId: asString(row.doctor_id),
      appointmentId: asString(row.appointment_id),
      priority: (asString(row.priority) as QueuePriority) ?? "Normal",
      status: row.status as QueueStatus,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
}

export async function updateQueueEntryById(input: {
  queueEntryId: string;
  organizationId: string;
  status: QueueStatus;
  updatedAt: string;
  priority?: QueuePriority;
}) {
  await query(
    `update queue_entries
     set status = $3,
         updated_at = $4,
         priority = coalesce($5, priority)
     where id = $1 and organization_id = $2`,
    [input.queueEntryId, input.organizationId, input.status, input.updatedAt, input.priority ?? null],
  );
}

export async function insertEmergencyVisit(visit: EmergencyVisitRecord) {
  await query(
    `insert into emergency_visits (
      id, organization_id, appointment_id, queue_entry_id, patient_id, family_member_id,
      patient_name, contact_name, contact_phone, emergency_reason, severity, allergies,
      medical_conditions, blood_group, status, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      visit.id,
      visit.organizationId,
      visit.appointmentId ?? null,
      visit.queueEntryId ?? null,
      visit.patientId ?? null,
      visit.familyMemberId ?? null,
      visit.patientName,
      visit.contactName ?? null,
      visit.contactPhone ?? null,
      visit.emergencyReason,
      visit.severity,
      visit.allergies ?? null,
      visit.medicalConditions ?? null,
      visit.bloodGroup ?? null,
      visit.status,
      visit.createdAt,
      visit.updatedAt,
    ],
  );
}

export async function updateEmergencyVisitRecord(input: {
  emergencyVisitId: string;
  organizationId: string;
  status?: EmergencyVisitRecord["status"];
  queueEntryId?: string | null;
  appointmentId?: string | null;
  updatedAt: string;
}) {
  await query(
    `update emergency_visits
     set status = coalesce($3, status),
         queue_entry_id = coalesce($4, queue_entry_id),
         appointment_id = coalesce($5, appointment_id),
         updated_at = $6
     where id = $1 and organization_id = $2`,
    [
      input.emergencyVisitId,
      input.organizationId,
      input.status ?? null,
      input.queueEntryId ?? null,
      input.appointmentId ?? null,
      input.updatedAt,
    ],
  );
}

export async function insertPatientJourney(journey: PatientJourneyRecord) {
  await query(
    `insert into patient_journeys (
      id, organization_id, token, appointment_id, queue_entry_id, patient_id,
      family_member_id, patient_name, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      journey.id,
      journey.organizationId,
      journey.token,
      journey.appointmentId ?? null,
      journey.queueEntryId ?? null,
      journey.patientId ?? null,
      journey.familyMemberId ?? null,
      journey.patientName,
      journey.createdAt,
      journey.updatedAt,
    ],
  );
}

export async function updatePatientJourneyRecord(input: {
  journeyId: string;
  organizationId: string;
  queueEntryId?: string | null;
  appointmentId?: string | null;
  updatedAt: string;
}) {
  await query(
    `update patient_journeys
     set queue_entry_id = coalesce($3, queue_entry_id),
         appointment_id = coalesce($4, appointment_id),
         updated_at = $5
     where id = $1 and organization_id = $2`,
    [
      input.journeyId,
      input.organizationId,
      input.queueEntryId ?? null,
      input.appointmentId ?? null,
      input.updatedAt,
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
        id, organization_id, patient_id, patient_name, family_member_id, doctor_id, doctor_name,
        hospital_id, appointment_id, instructions, follow_up_date, status, created_at,
        dispensed_at, dispensed_by_id, dispensed_by_name
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        prescription.id,
        prescription.organizationId,
        prescription.patientId,
        prescription.patientName,
        prescription.familyMemberId ?? null,
        prescription.doctorId,
        prescription.doctorName,
        prescription.hospitalId,
        prescription.appointmentId ?? null,
        prescription.instructions,
        prescription.followUpDate ?? null,
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
      [
        "prescription_id",
        "display_order",
        "medicine_id",
        "medicine_name",
        "strength",
        "dose_quantity",
        "dose_unit",
        "dosage",
        "frequency",
        "duration_value",
        "duration_unit",
        "duration",
        "total_quantity",
        "instructions_notes",
      ],
      prescription.medicines.map((medicine, index) => [
        prescription.id,
        index,
        medicine.medicineId ?? null,
        medicine.medicineName,
        medicine.strength ?? null,
        medicine.doseQuantity ?? null,
        medicine.doseUnit ?? null,
        medicine.dosage,
        medicine.frequency,
        medicine.durationValue ?? null,
        medicine.durationUnit ?? null,
        medicine.duration,
        medicine.totalQuantity ?? null,
        medicine.instructions ?? null,
      ]),
    );
  });
}

export async function updatePrescriptionRecord(input: {
  prescriptionId: string;
  organizationId: string;
  instructions: string;
  followUpDate?: string;
  medicines: PrescriptionRecord["medicines"];
}) {
  await withTransaction(async (client) => {
    await client.query(
      `update prescriptions
       set instructions = $3,
           follow_up_date = $4
       where id = $1 and organization_id = $2`,
      [
        input.prescriptionId,
        input.organizationId,
        input.instructions,
        input.followUpDate ?? null,
      ],
    );

    await client.query(
      `delete from prescription_medicines where prescription_id = $1`,
      [input.prescriptionId],
    );

    await insertRows(
      client,
      "prescription_medicines",
      [
        "prescription_id",
        "display_order",
        "medicine_id",
        "medicine_name",
        "strength",
        "dose_quantity",
        "dose_unit",
        "dosage",
        "frequency",
        "duration_value",
        "duration_unit",
        "duration",
        "total_quantity",
        "instructions_notes",
      ],
      input.medicines.map((medicine, index) => [
        input.prescriptionId,
        index,
        medicine.medicineId ?? null,
        medicine.medicineName,
        medicine.strength ?? null,
        medicine.doseQuantity ?? null,
        medicine.doseUnit ?? null,
        medicine.dosage,
        medicine.frequency,
        medicine.durationValue ?? null,
        medicine.durationUnit ?? null,
        medicine.duration,
        medicine.totalQuantity ?? null,
        medicine.instructions ?? null,
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

export async function insertInvoice(invoice: InvoiceRecord) {
  await query(
    `insert into invoices (
      id, invoice_number, organization_id, hospital_id, patient_id, patient_name, family_member_id, source_type,
      source_id, due_date, subtotal_cents, total_cents, amount_paid_cents, amount_due_cents,
      payment_status, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    on conflict do nothing`,
    [
      invoice.id,
      invoice.invoiceNumber,
      invoice.organizationId,
      invoice.hospitalId,
      invoice.patientId,
      invoice.patientName,
      invoice.familyMemberId ?? null,
      invoice.sourceType ?? null,
      invoice.sourceId ?? null,
      invoice.dueDate ?? null,
      invoice.subtotalCents,
      invoice.totalCents,
      invoice.amountPaidCents,
      invoice.amountDueCents,
      invoice.paymentStatus,
      invoice.createdAt,
      invoice.createdAt,
    ],
  );
}

export async function insertInvoiceItems(items: InvoiceItemRecord[]) {
  await insertRows(
    { query },
    "invoice_items",
    [
      "id",
      "invoice_id",
      "organization_id",
      "description",
      "category",
      "quantity",
      "unit_amount_cents",
      "total_amount_cents",
      "source_type",
      "source_id",
    ],
    items.map((item) => [
      item.id,
      item.invoiceId,
      item.organizationId,
      item.description,
      item.category,
      item.quantity,
      item.unitAmountCents,
      item.totalAmountCents,
      item.sourceType ?? null,
      item.sourceId ?? null,
    ]),
  );
}

export async function insertPayment(payment: PaymentRecord) {
  await query(
    `insert into payments (
      id, invoice_id, organization_id, patient_id, amount_cents, method, reference_number,
      paid_at, recorded_by_id, recorded_by_name
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      payment.id,
      payment.invoiceId,
      payment.organizationId,
      payment.patientId,
      payment.amountCents,
      payment.method,
      payment.referenceNumber ?? null,
      payment.paidAt,
      payment.recordedBy?.id ?? null,
      payment.recordedBy?.name ?? null,
    ],
  );
}

export async function updateInvoicePaymentState(input: {
  invoiceId: string;
  organizationId: string;
  amountPaidCents: number;
  amountDueCents: number;
  paymentStatus: InvoiceStatus;
}) {
  await query(
    `update invoices
     set amount_paid_cents = $3,
         amount_due_cents = $4,
         payment_status = $5,
         updated_at = now()
     where id = $1 and organization_id = $2`,
    [
      input.invoiceId,
      input.organizationId,
      input.amountPaidCents,
      input.amountDueCents,
      input.paymentStatus,
    ],
  );
}

export async function insertInventoryItem(item: InventoryItemRecord) {
  await query(
    `insert into inventory_items (
      id, organization_id, medicine_id, medicine_name, generic_name, batch_number, quantity_in_stock, unit,
      unit_price_cents, expiry_date, reorder_level, manufacturer, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      item.id,
      item.organizationId,
      item.medicineId ?? null,
      item.medicineName,
      item.genericName ?? null,
      item.batchNumber,
      item.quantityInStock,
      item.unit,
      item.unitPriceCents,
      item.expiryDate,
      item.reorderLevel,
      item.manufacturer ?? null,
      item.createdAt,
      item.updatedAt,
    ],
  );
}

export async function updateInventoryItemRecord(item: InventoryItemRecord) {
  await query(
    `update inventory_items
     set medicine_id = $3,
         medicine_name = $4,
         generic_name = $5,
         batch_number = $6,
         quantity_in_stock = $7,
         unit = $8,
         unit_price_cents = $9,
         expiry_date = $10,
         reorder_level = $11,
         manufacturer = $12,
         updated_at = $13
     where id = $1 and organization_id = $2`,
    [
      item.id,
      item.organizationId,
      item.medicineId ?? null,
      item.medicineName,
      item.genericName ?? null,
      item.batchNumber,
      item.quantityInStock,
      item.unit,
      item.unitPriceCents,
      item.expiryDate,
      item.reorderLevel,
      item.manufacturer ?? null,
      item.updatedAt,
    ],
  );
}

export async function insertNotifications(notifications: NotificationRecord[]) {
  await insertRows(
    { query },
    "notifications",
    [
      "id",
      "user_id",
      "organization_id",
      "title",
      "message",
      "category",
      "related_entity_type",
      "related_entity_id",
      "read",
      "created_at",
    ],
    notifications.map((notification) => [
      notification.id,
      notification.userId,
      notification.organizationId,
      notification.title,
      notification.message,
      notification.category,
      notification.relatedEntityType ?? null,
      notification.relatedEntityId ?? null,
      notification.read,
      notification.createdAt,
    ]),
  );
}

export async function markNotificationReadById(input: {
  notificationId: string;
  organizationId: string;
  userId: string;
}) {
  await query(
    `update notifications
     set read = true
     where id = $1 and organization_id = $2 and user_id = $3`,
    [input.notificationId, input.organizationId, input.userId],
  );
}

export async function markAllNotificationsRead(input: {
  organizationId: string;
  userId: string;
}) {
  await query(
    `update notifications
     set read = true
     where organization_id = $1 and user_id = $2 and read = false`,
    [input.organizationId, input.userId],
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
      "address_line_1",
      "address_line_2",
      "city",
      "state",
      "postal_code",
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
      user.addressLine1 ?? null,
      user.addressLine2 ?? null,
      user.city ?? null,
      user.state ?? null,
      user.postalCode ?? null,
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
  const result = await query(
    `select
      id,
      user_id,
      expires_at,
      remember,
      created_at,
      last_used_at,
      revoked_at,
      user_agent,
      device_label,
      refresh_token_hash
    from sessions
    order by expires_at asc`,
  );
  return result.rows.map((row): SessionRecord => ({
    id: String(row.id),
    userId: String(row.user_id),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    remember: Boolean(row.remember),
    createdAt: new Date(String(row.created_at)).toISOString(),
    lastUsedAt: new Date(String(row.last_used_at)).toISOString(),
    revokedAt: asString(row.revoked_at)
      ? new Date(String(row.revoked_at)).toISOString()
      : undefined,
    userAgent: asString(row.user_agent),
    deviceLabel: asString(row.device_label),
    refreshTokenHash: asString(row.refresh_token_hash),
  }));
}

async function saveSessionsSnapshotWithClient(client: SqlClient, sessions: SessionRecord[]) {
  await client.query("delete from sessions");
  await insertRows(
    client,
    "sessions",
    [
      "id",
      "user_id",
      "expires_at",
      "remember",
      "created_at",
      "last_used_at",
      "revoked_at",
      "user_agent",
      "device_label",
      "refresh_token_hash",
    ],
    sessions.map((session) => [
      session.id,
      session.userId,
      session.expiresAt,
      session.remember,
      session.createdAt ?? new Date().toISOString(),
      session.lastUsedAt ?? new Date().toISOString(),
      session.revokedAt ?? null,
      session.userAgent ?? null,
      session.deviceLabel ?? null,
      session.refreshTokenHash ?? null,
    ]),
  );
}

export async function saveSessionsSnapshot(sessions: SessionRecord[]) {
  await withTransaction(async (client) => {
    await saveSessionsSnapshotWithClient(client, sessions);
  });
}

export async function loadHospitalStateSnapshot(options?: { includeLabReportAttachmentContent?: boolean }) {
  const organizationResult = await query("select * from organizations order by created_at asc limit 1");
  if (organizationResult.rows.length === 0) {
    return null;
  }

  const organizationRow = organizationResult.rows[0];
  const organizationId = String(organizationRow.id);
  const [
    settingsResult,
    sessionsResult,
    departmentsResult,
    doctorsResult,
    medicineCatalogResult,
    appointmentsResult,
    queueResult,
    labTestsResult,
    labRequestsResult,
    labReportsResult,
    medicalRecordsResult,
    prescriptionsResult,
    prescriptionMedicinesResult,
    invoicesResult,
    invoiceItemsResult,
    paymentsResult,
    inventoryItemsResult,
    notificationsResult,
    familyMembersResult,
    medicalHistoryEntriesResult,
    clinicalAttachmentsResult,
    telemedicineSessionsResult,
    emergencyVisitsResult,
    patientJourneysResult,
  ] =
    await Promise.all([
      query("select * from hospital_settings where organization_id = $1 limit 1", [organizationId]),
      query("select * from booking_session_capacities where organization_id = $1 order by start_time asc", [organizationId]),
      query("select * from departments where organization_id = $1 order by name asc", [organizationId]),
      query("select * from doctors where organization_id = $1 order by name asc", [organizationId]),
      query("select * from medicine_catalog where organization_id = $1 order by name asc, unit asc", [organizationId]),
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
      query("select * from invoices where organization_id = $1 order by created_at desc", [organizationId]),
      query(
        `select ii.* from invoice_items ii
         inner join invoices i on i.id = ii.invoice_id
         where i.organization_id = $1
         order by ii.invoice_id asc, ii.id asc`,
        [organizationId],
      ),
      query(
        `select p.* from payments p
         inner join invoices i on i.id = p.invoice_id
         where i.organization_id = $1
         order by p.paid_at desc`,
        [organizationId],
      ),
      query("select * from inventory_items where organization_id = $1 order by medicine_name asc, expiry_date asc", [organizationId]),
      query("select * from notifications where organization_id = $1 order by created_at desc", [organizationId]),
      query("select * from family_members where organization_id = $1 order by full_name asc", [organizationId]),
      query("select * from medical_history_entries where organization_id = $1 order by recorded_date desc, created_at desc", [organizationId]),
      query("select * from clinical_attachments where organization_id = $1 order by created_at desc", [organizationId]),
      query("select * from telemedicine_sessions where organization_id = $1 order by created_at desc", [organizationId]),
      query("select * from emergency_visits where organization_id = $1 order by created_at desc", [organizationId]),
      query("select * from patient_journeys where organization_id = $1 order by created_at desc", [organizationId]),
    ]);

  const settingsRow = settingsResult.rows[0];
  const medicinesByPrescriptionId = new Map<string, PrescriptionMedicineRecord[]>();
  for (const row of prescriptionMedicinesResult.rows) {
    const prescriptionId = String(row.prescription_id);
    const current = medicinesByPrescriptionId.get(prescriptionId) ?? [];
    current.push({
      medicineId: asString(row.medicine_id),
      medicineName: String(row.medicine_name),
      strength: asString(row.strength),
      doseQuantity:
        row.dose_quantity === null || row.dose_quantity === undefined
          ? undefined
          : asNumber(row.dose_quantity),
      doseUnit: asString(row.dose_unit),
      dosage: String(row.dosage),
      frequency: String(row.frequency),
      durationValue:
        row.duration_value === null || row.duration_value === undefined
          ? undefined
          : asNumber(row.duration_value),
      durationUnit: asString(row.duration_unit),
      duration: String(row.duration),
      totalQuantity:
        row.total_quantity === null || row.total_quantity === undefined
          ? undefined
          : asNumber(row.total_quantity),
      instructions: asString(row.instructions_notes),
    });
    medicinesByPrescriptionId.set(prescriptionId, current);
  }

  const invoiceItemsByInvoiceId = new Map<string, InvoiceItemRecord[]>();
  for (const row of invoiceItemsResult.rows) {
    const invoiceId = String(row.invoice_id);
    const current = invoiceItemsByInvoiceId.get(invoiceId) ?? [];
    current.push({
      id: String(row.id),
      invoiceId,
      organizationId: String(row.organization_id),
      description: String(row.description),
      category: row.category as InvoiceItemRecord["category"],
      quantity: asNumber(row.quantity),
      unitAmountCents: asNumber(row.unit_amount_cents),
      totalAmountCents: asNumber(row.total_amount_cents),
      sourceType: asString(row.source_type) as InvoiceItemRecord["sourceType"],
      sourceId: asString(row.source_id),
    });
    invoiceItemsByInvoiceId.set(invoiceId, current);
  }

  const paymentsByInvoiceId = new Map<string, PaymentRecord[]>();
  for (const row of paymentsResult.rows) {
    const invoiceId = String(row.invoice_id);
    const current = paymentsByInvoiceId.get(invoiceId) ?? [];
    current.push({
      id: String(row.id),
      invoiceId,
      patientId: String(row.patient_id),
      organizationId: String(row.organization_id),
      amountCents: asNumber(row.amount_cents),
      method: row.method as PaymentMethod,
      referenceNumber: asString(row.reference_number),
      paidAt: new Date(String(row.paid_at)).toISOString(),
      recordedBy: asString(row.recorded_by_id)
        ? {
            id: String(row.recorded_by_id),
            name: String(row.recorded_by_name),
          }
        : undefined,
    });
    paymentsByInvoiceId.set(invoiceId, current);
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
    medicineCatalog: medicineCatalogResult.rows.map((row): MedicineCatalogRecord => ({
      id: String(row.id),
      organizationId,
      name: String(row.name),
      strength: asString(row.strength),
      unit: String(row.unit),
      genericName: asString(row.generic_name),
      active: asBoolean(row.active),
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    })),
    appointments: appointmentsResult.rows.map((row): AppointmentRecord => ({
      id: String(row.id),
      organizationId,
      patientId: asString(row.patient_id),
      patientName: String(row.patient_name),
      familyMemberId: asString(row.family_member_id),
      doctorId: String(row.doctor_id),
      departmentId: String(row.department_id),
      appointmentDate: String(row.appointment_date),
      appointmentTime: String(row.appointment_time),
      reasonForAppointment: asString(row.reason_for_appointment) ?? "",
      consultationMode:
        (asString(row.consultation_mode) as AppointmentRecord["consultationMode"]) ?? "In Person",
      status: row.status as AppointmentRecord["status"],
    })),
    queueEntries: queueResult.rows.map((row): QueueEntryRecord => ({
      id: String(row.id),
      organizationId,
      patientName: String(row.patient_name),
      departmentId: String(row.department_id),
      doctorId: asString(row.doctor_id),
      appointmentId: asString(row.appointment_id),
      priority: (asString(row.priority) as QueuePriority) ?? "Normal",
      status: row.status as QueueEntryRecord["status"],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    })),
    emergencyVisits: emergencyVisitsResult.rows.map((row): EmergencyVisitRecord => ({
      id: String(row.id),
      organizationId: String(row.organization_id),
      appointmentId: asString(row.appointment_id),
      queueEntryId: asString(row.queue_entry_id),
      patientId: asString(row.patient_id),
      familyMemberId: asString(row.family_member_id),
      patientName: String(row.patient_name),
      contactName: asString(row.contact_name),
      contactPhone: asString(row.contact_phone),
      emergencyReason: String(row.emergency_reason),
      severity: String(row.severity) as EmergencyVisitRecord["severity"],
      allergies: asString(row.allergies),
      medicalConditions: asString(row.medical_conditions),
      bloodGroup: asString(row.blood_group),
      status: String(row.status) as EmergencyVisitRecord["status"],
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    })),
    patientJourneys: patientJourneysResult.rows.map((row): PatientJourneyRecord => ({
      id: String(row.id),
      organizationId: String(row.organization_id),
      token: String(row.token),
      appointmentId: asString(row.appointment_id),
      queueEntryId: asString(row.queue_entry_id),
      patientId: asString(row.patient_id),
      familyMemberId: asString(row.family_member_id),
      patientName: String(row.patient_name),
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    })),
    medicalRecords: medicalRecordsResult.rows.map((row): MedicalRecordRecord => ({
      id: String(row.id),
      patientId: String(row.patient_id),
      patientName: String(row.patient_name),
      familyMemberId: asString(row.family_member_id),
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
      familyMemberId: asString(row.family_member_id),
      doctorId: String(row.doctor_id),
      doctorName: String(row.doctor_name),
      hospitalId: String(row.hospital_id),
      organizationId,
      appointmentId: asString(row.appointment_id),
      medicines: medicinesByPrescriptionId.get(String(row.id)) ?? [],
      instructions: String(row.instructions),
      followUpDate: asString(row.follow_up_date),
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
      priceCents: asNumber(row.price_cents),
    })),
    labRequests: labRequestsResult.rows.map((row): LabRequestRecord => ({
      id: String(row.id),
      patientId: String(row.patient_id),
      hospitalId: String(row.hospital_id),
      organizationId,
      patientName: String(row.patient_name),
      familyMemberId: asString(row.family_member_id),
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
      familyMemberId: asString(row.family_member_id),
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
            contentBase64: options?.includeLabReportAttachmentContent === false
              ? undefined
              : String(row.attachment_content_base64),
          }
        : undefined,
    })),
    invoices: invoicesResult.rows.map((row): InvoiceRecord => ({
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
      totalCents: asNumber(row.total_cents),
      amountPaidCents: asNumber(row.amount_paid_cents),
      amountDueCents: asNumber(row.amount_due_cents),
      paymentStatus: row.payment_status as InvoiceStatus,
      items: invoiceItemsByInvoiceId.get(String(row.id)) ?? [],
      payments: paymentsByInvoiceId.get(String(row.id)) ?? [],
    })),
    inventoryItems: inventoryItemsResult.rows.map((row): InventoryItemRecord => ({
      id: String(row.id),
      organizationId: String(row.organization_id),
      medicineId: asString(row.medicine_id),
      medicineName: String(row.medicine_name),
      genericName: asString(row.generic_name),
      batchNumber: String(row.batch_number),
      quantityInStock: asNumber(row.quantity_in_stock),
      unit: String(row.unit),
      unitPriceCents: asNumber(row.unit_price_cents),
      expiryDate: String(row.expiry_date),
      reorderLevel: asNumber(row.reorder_level),
      manufacturer: asString(row.manufacturer),
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    })),
    notifications: notificationsResult.rows.map((row): NotificationRecord => ({
      id: String(row.id),
      userId: String(row.user_id),
      organizationId: String(row.organization_id),
      title: String(row.title),
      message: String(row.message),
      category: row.category as NotificationRecord["category"],
      relatedEntityType: asString(row.related_entity_type),
      relatedEntityId: asString(row.related_entity_id),
      read: asBoolean(row.read),
      createdAt: new Date(String(row.created_at)).toISOString(),
    })),
    familyMembers: familyMembersResult.rows.map((row): FamilyMemberRecord => ({
      id: String(row.id),
      organizationId: String(row.organization_id),
      primaryPatientUserId: String(row.primary_patient_user_id),
      fullName: String(row.full_name),
      relationship: String(row.relationship),
      dateOfBirth: asString(row.date_of_birth),
      gender: asString(row.gender),
      bloodGroup: asString(row.blood_group),
      phoneNumber: asString(row.phone_number),
      emergencyContactName: asString(row.emergency_contact_name),
      emergencyContactPhone: asString(row.emergency_contact_phone),
      allergies: asString(row.allergies),
      medicalConditions: asString(row.medical_conditions),
      preferredLanguage: asString(row.preferred_language),
      status: (asString(row.status) as FamilyMemberRecord["status"]) ?? "Active",
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    })),
    medicalHistoryEntries: medicalHistoryEntriesResult.rows.map((row): MedicalHistoryEntryRecord => ({
      id: String(row.id),
      organizationId: String(row.organization_id),
      patientUserId: String(row.patient_user_id),
      familyMemberId: asString(row.family_member_id),
      category: String(row.category) as MedicalHistoryEntryRecord["category"],
      title: String(row.title),
      details: asString(row.details),
      recordedDate: String(row.recorded_date),
      createdByUserId: String(row.created_by_user_id),
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: asString(row.updated_at) ? new Date(String(row.updated_at)).toISOString() : undefined,
    })),
    clinicalAttachments: clinicalAttachmentsResult.rows.map((row): ClinicalAttachmentRecord => ({
      id: String(row.id),
      organizationId: String(row.organization_id),
      patientUserId: String(row.patient_user_id),
      familyMemberId: asString(row.family_member_id),
      medicalRecordId: asString(row.medical_record_id),
      label: String(row.label),
      fileName: String(row.file_name),
      contentType: String(row.content_type) as ClinicalAttachmentRecord["contentType"],
      fileSize: asNumber(row.file_size),
      contentBase64: String(row.content_base64),
      uploadedByUserId: String(row.uploaded_by_user_id),
      uploadedByName: String(row.uploaded_by_name),
      createdAt: new Date(String(row.created_at)).toISOString(),
    })),
    telemedicineSessions: telemedicineSessionsResult.rows.map((row): TelemedicineSessionRecord => ({
      id: String(row.id),
      organizationId: String(row.organization_id),
      appointmentId: String(row.appointment_id),
      patientUserId: String(row.patient_user_id),
      doctorUserId: String(row.doctor_user_id),
      familyMemberId: asString(row.family_member_id),
      status: String(row.status) as TelemedicineSessionRecord["status"],
      startedAt: asString(row.started_at) ? new Date(String(row.started_at)).toISOString() : undefined,
      endedAt: asString(row.ended_at) ? new Date(String(row.ended_at)).toISOString() : undefined,
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
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
  await client.query(
      "delete from payments where invoice_id in (select id from invoices where organization_id = $1)",
      [state.organization.id],
    );
  await client.query(
      "delete from invoice_items where invoice_id in (select id from invoices where organization_id = $1)",
      [state.organization.id],
    );
  await client.query("delete from invoices where organization_id = $1", [state.organization.id]);
  await client.query("delete from notifications where organization_id = $1", [state.organization.id]);
  await client.query("delete from inventory_items where organization_id = $1", [state.organization.id]);
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
      ["id", "organization_id", "name", "price_cents"],
      state.labTests.map((test) => [test.id, state.organization.id, test.name, test.priceCents ?? 0]),
    );
  await insertRows(
      client,
      "appointments",
      ["id", "organization_id", "patient_id", "patient_name", "doctor_id", "department_id", "appointment_date", "appointment_time", "reason_for_appointment", "status"],
      state.appointments.map((appointment) => [
        appointment.id,
        state.organization.id,
        appointment.patientId ?? null,
        appointment.patientName,
        appointment.doctorId,
        appointment.departmentId,
        appointment.appointmentDate,
        appointment.appointmentTime,
        appointment.reasonForAppointment ?? null,
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
      "medicine_catalog",
      [
        "id",
        "organization_id",
        "name",
        "strength",
        "unit",
        "generic_name",
        "active",
        "normalized_name",
        "normalized_strength",
        "normalized_unit",
        "created_at",
        "updated_at",
      ],
      state.medicineCatalog.map((medicine) => [
        medicine.id,
        state.organization.id,
        medicine.name,
        medicine.strength ?? null,
        medicine.unit,
        medicine.genericName ?? null,
        medicine.active,
        medicine.name.trim().toLowerCase(),
        medicine.strength?.trim().toLowerCase() ?? "",
        medicine.unit.trim().toLowerCase(),
        medicine.createdAt,
        medicine.updatedAt,
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
      [
        "prescription_id",
        "display_order",
        "medicine_id",
        "medicine_name",
        "strength",
        "dose_quantity",
        "dose_unit",
        "dosage",
        "frequency",
        "duration_value",
        "duration_unit",
        "duration",
        "total_quantity",
        "instructions_notes",
      ],
      state.prescriptions.flatMap((prescription) =>
        prescription.medicines.map((medicine, index) => [
          prescription.id,
          index,
          medicine.medicineId ?? null,
          medicine.medicineName,
          medicine.strength ?? null,
          medicine.doseQuantity ?? null,
          medicine.doseUnit ?? null,
          medicine.dosage,
          medicine.frequency,
          medicine.durationValue ?? null,
          medicine.durationUnit ?? null,
          medicine.duration,
          medicine.totalQuantity ?? null,
          medicine.instructions ?? null,
        ]),
      ),
    );
  await insertRows(
      client,
      "invoices",
      [
        "id",
        "invoice_number",
        "organization_id",
        "hospital_id",
        "patient_id",
        "patient_name",
        "source_type",
        "source_id",
        "due_date",
        "subtotal_cents",
        "total_cents",
        "amount_paid_cents",
        "amount_due_cents",
        "payment_status",
        "created_at",
        "updated_at",
      ],
      state.invoices.map((invoice) => [
        invoice.id,
        invoice.invoiceNumber,
        state.organization.id,
        invoice.hospitalId,
        invoice.patientId,
        invoice.patientName,
        invoice.sourceType ?? null,
        invoice.sourceId ?? null,
        invoice.dueDate ?? null,
        invoice.subtotalCents,
        invoice.totalCents,
        invoice.amountPaidCents,
        invoice.amountDueCents,
        invoice.paymentStatus,
        invoice.createdAt,
        invoice.createdAt,
      ]),
    );
  await insertRows(
      client,
      "invoice_items",
      [
        "id",
        "invoice_id",
        "organization_id",
        "description",
        "category",
        "quantity",
        "unit_amount_cents",
        "total_amount_cents",
        "source_type",
        "source_id",
      ],
      state.invoices.flatMap((invoice) =>
        invoice.items.map((item) => [
          item.id,
          invoice.id,
          state.organization.id,
          item.description,
          item.category,
          item.quantity,
          item.unitAmountCents,
          item.totalAmountCents,
          item.sourceType ?? null,
          item.sourceId ?? null,
        ]),
      ),
    );
  await insertRows(
      client,
      "payments",
      [
        "id",
        "invoice_id",
        "organization_id",
        "patient_id",
        "amount_cents",
        "method",
        "reference_number",
        "paid_at",
        "recorded_by_id",
        "recorded_by_name",
      ],
      state.invoices.flatMap((invoice) =>
        invoice.payments.map((payment) => [
          payment.id,
          invoice.id,
          state.organization.id,
          payment.patientId,
          payment.amountCents,
          payment.method,
          payment.referenceNumber ?? null,
          payment.paidAt,
          payment.recordedBy?.id ?? null,
          payment.recordedBy?.name ?? null,
        ]),
      ),
    );
  await insertRows(
      client,
      "inventory_items",
      [
        "id",
        "organization_id",
        "medicine_id",
        "medicine_name",
        "generic_name",
        "batch_number",
        "quantity_in_stock",
        "unit",
        "unit_price_cents",
        "expiry_date",
        "reorder_level",
        "manufacturer",
        "created_at",
        "updated_at",
      ],
      state.inventoryItems.map((item) => [
        item.id,
        state.organization.id,
        item.medicineId ?? null,
        item.medicineName,
        item.genericName ?? null,
        item.batchNumber,
        item.quantityInStock,
        item.unit,
        item.unitPriceCents,
        item.expiryDate,
        item.reorderLevel,
        item.manufacturer ?? null,
        item.createdAt,
        item.updatedAt,
      ]),
    );
  await insertRows(
      client,
      "notifications",
      [
        "id",
        "user_id",
        "organization_id",
        "title",
        "message",
        "category",
        "related_entity_type",
        "related_entity_id",
        "read",
        "created_at",
      ],
      state.notifications.map((notification) => [
        notification.id,
        notification.userId,
        state.organization.id,
        notification.title,
        notification.message,
        notification.category,
        notification.relatedEntityType ?? null,
        notification.relatedEntityId ?? null,
        notification.read,
        notification.createdAt,
      ]),
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
