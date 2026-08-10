create table if not exists organizations (
  id text primary key,
  name text not null,
  slug text not null unique,
  address text,
  city text,
  state text,
  contact_phone text,
  contact_email text,
  emergency_contact text,
  operating_hours text,
  timezone text,
  default_language text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists hospital_settings (
  organization_id text primary key references organizations(id) on delete cascade,
  doctor_slot_capacity integer not null,
  default_max_appointments_per_session integer not null,
  lab_slot_capacity integer not null,
  configured_support_lines integer not null default 0,
  emergency_services_enabled boolean not null default true,
  default_consultation_slot_duration_minutes integer not null default 30,
  updated_at timestamptz not null default now()
);

create table if not exists booking_session_capacities (
  organization_id text not null references organizations(id) on delete cascade,
  id text not null,
  label text not null,
  start_time text not null,
  end_time text not null,
  max_appointments integer not null,
  primary key (organization_id, id)
);

create table if not exists departments (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text not null,
  status text not null,
  location text not null
);

create table if not exists doctors (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  specialization text not null,
  department_id text not null references departments(id) on delete restrict,
  status text not null,
  availability text not null,
  shift_label text not null
);

create table if not exists users (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role text not null,
  password_hash text not null,
  doctor_id text,
  assigned_doctor_id text,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists patient_profiles (
  user_id text primary key references users(id) on delete cascade,
  patient_name text not null,
  phone_number text,
  gender text,
  date_of_birth text,
  blood_group text,
  address text,
  emergency_contact text,
  emergency_contact_name text,
  emergency_contact_phone text,
  allergies text,
  medical_conditions text,
  preferred_language text
);

create table if not exists doctor_profiles (
  user_id text primary key references users(id) on delete cascade,
  department_id text references departments(id) on delete set null,
  phone_number text,
  gender text,
  designation text,
  specialization text,
  qualifications text,
  experience text,
  languages text,
  consultation_fee text,
  consultation_mode text,
  available_timings text,
  shift text,
  professional_registration_number text,
  profile_verification_status text
);

create table if not exists staff_profiles (
  user_id text primary key references users(id) on delete cascade,
  department_id text references departments(id) on delete set null,
  phone_number text,
  gender text,
  designation text,
  shift text,
  desk_label text,
  qualifications text,
  professional_registration_number text,
  administrative_unit text
);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  remember boolean not null default false
);

create table if not exists appointments (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  patient_id text,
  patient_name text not null,
  doctor_id text not null references doctors(id) on delete restrict,
  department_id text not null references departments(id) on delete restrict,
  appointment_date text not null,
  appointment_time text not null,
  status text not null
);

create table if not exists queue_entries (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  patient_name text not null,
  department_id text not null references departments(id) on delete restrict,
  doctor_id text references doctors(id) on delete set null,
  appointment_id text references appointments(id) on delete set null,
  status text not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists lab_tests (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null
);

create table if not exists lab_requests (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  patient_id text not null,
  hospital_id text not null references organizations(id) on delete cascade,
  patient_name text not null,
  test_id text not null references lab_tests(id) on delete restrict,
  test_name text not null,
  department_id text not null references departments(id) on delete restrict,
  requested_date text not null,
  requested_time text not null,
  status text not null,
  created_at timestamptz not null
);

create table if not exists lab_reports (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  lab_request_id text not null references lab_requests(id) on delete cascade,
  patient_id text not null,
  hospital_id text not null references organizations(id) on delete cascade,
  test_name text not null,
  report_title text not null,
  result_summary text not null,
  uploaded_at timestamptz not null,
  uploaded_by_id text not null,
  uploaded_by_name text not null,
  attachment_file_name text,
  attachment_file_size integer,
  attachment_content_base64 text
);

create table if not exists medical_records (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  patient_id text not null,
  patient_name text not null,
  doctor_id text not null references doctors(id) on delete restrict,
  doctor_name text not null,
  appointment_id text references appointments(id) on delete set null,
  hospital_id text not null references organizations(id) on delete cascade,
  visit_date text not null,
  diagnosis text not null,
  clinical_notes text not null,
  treatment_advice text not null,
  created_at timestamptz not null,
  updated_at timestamptz
);

create table if not exists prescriptions (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  patient_id text not null,
  patient_name text not null,
  doctor_id text not null references doctors(id) on delete restrict,
  doctor_name text not null,
  hospital_id text not null references organizations(id) on delete cascade,
  appointment_id text references appointments(id) on delete set null,
  instructions text not null,
  status text not null,
  created_at timestamptz not null,
  dispensed_at timestamptz,
  dispensed_by_id text,
  dispensed_by_name text
);

create table if not exists prescription_medicines (
  prescription_id text not null references prescriptions(id) on delete cascade,
  display_order integer not null,
  medicine_name text not null,
  dosage text not null,
  frequency text not null,
  duration text not null,
  primary key (prescription_id, display_order)
);

create index if not exists idx_users_organization_id on users(organization_id);
create index if not exists idx_appointments_organization_id on appointments(organization_id);
create index if not exists idx_lab_requests_organization_id on lab_requests(organization_id);
create index if not exists idx_lab_reports_organization_id on lab_reports(organization_id);
create index if not exists idx_medical_records_organization_id on medical_records(organization_id);
create index if not exists idx_prescriptions_organization_id on prescriptions(organization_id);
