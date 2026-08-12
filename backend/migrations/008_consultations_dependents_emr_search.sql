alter table appointments
  add column if not exists consultation_mode text not null default 'In Person';

alter table appointments
  add column if not exists family_member_id text;

alter table lab_requests
  add column if not exists family_member_id text;

alter table lab_reports
  add column if not exists family_member_id text;

alter table medical_records
  add column if not exists family_member_id text;

alter table prescriptions
  add column if not exists family_member_id text;

alter table prescriptions
  add column if not exists follow_up_date text;

alter table invoices
  add column if not exists family_member_id text;

create table if not exists family_members (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  primary_patient_user_id text not null references users(id) on delete cascade,
  full_name text not null,
  relationship text not null,
  date_of_birth text,
  gender text,
  blood_group text,
  phone_number text,
  emergency_contact_name text,
  emergency_contact_phone text,
  allergies text,
  medical_conditions text,
  preferred_language text,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_family_members_patient
  on family_members (primary_patient_user_id, organization_id);

create table if not exists medical_history_entries (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  patient_user_id text not null references users(id) on delete cascade,
  family_member_id text references family_members(id) on delete cascade,
  category text not null,
  title text not null,
  details text,
  recorded_date text not null,
  created_by_user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_medical_history_entries_scope
  on medical_history_entries (organization_id, patient_user_id, family_member_id, category);

create table if not exists clinical_attachments (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  patient_user_id text not null references users(id) on delete cascade,
  family_member_id text references family_members(id) on delete cascade,
  medical_record_id text references medical_records(id) on delete set null,
  label text not null,
  file_name text not null,
  content_type text not null,
  file_size integer not null,
  content_base64 text not null,
  uploaded_by_user_id text not null references users(id) on delete cascade,
  uploaded_by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_clinical_attachments_scope
  on clinical_attachments (organization_id, patient_user_id, family_member_id, created_at desc);

create table if not exists telemedicine_sessions (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  appointment_id text not null unique references appointments(id) on delete cascade,
  patient_user_id text not null references users(id) on delete cascade,
  doctor_user_id text not null references users(id) on delete cascade,
  family_member_id text references family_members(id) on delete set null,
  status text not null default 'Scheduled',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists telemedicine_messages (
  id text primary key,
  session_id text not null references telemedicine_sessions(id) on delete cascade,
  organization_id text not null references organizations(id) on delete cascade,
  sender_user_id text not null references users(id) on delete cascade,
  sender_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_telemedicine_messages_session
  on telemedicine_messages (session_id, created_at asc);

create table if not exists telemedicine_signals (
  id text primary key,
  session_id text not null references telemedicine_sessions(id) on delete cascade,
  organization_id text not null references organizations(id) on delete cascade,
  sender_user_id text not null references users(id) on delete cascade,
  recipient_user_id text not null references users(id) on delete cascade,
  signal_type text not null,
  payload_json text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_telemedicine_signals_session_recipient
  on telemedicine_signals (session_id, recipient_user_id, created_at asc);
