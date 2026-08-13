alter table queue_entries
  add column if not exists priority text not null default 'Normal';

create index if not exists idx_queue_entries_priority_status
  on queue_entries (organization_id, priority, status, created_at asc);

create table if not exists emergency_visits (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  appointment_id text references appointments(id) on delete set null,
  queue_entry_id text references queue_entries(id) on delete set null,
  patient_id text references users(id) on delete set null,
  family_member_id text references family_members(id) on delete set null,
  patient_name text not null,
  contact_name text,
  contact_phone text,
  emergency_reason text not null,
  severity text not null,
  allergies text,
  medical_conditions text,
  blood_group text,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_emergency_visits_scope
  on emergency_visits (organization_id, status, severity, created_at desc);

create table if not exists patient_journeys (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  token text not null unique,
  appointment_id text references appointments(id) on delete cascade,
  queue_entry_id text references queue_entries(id) on delete set null,
  patient_id text references users(id) on delete set null,
  family_member_id text references family_members(id) on delete set null,
  patient_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_patient_journeys_scope
  on patient_journeys (organization_id, patient_id, appointment_id, created_at desc);
