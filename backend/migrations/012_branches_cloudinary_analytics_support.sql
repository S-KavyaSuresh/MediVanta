create table if not exists hospital_branches (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  address text not null,
  city text not null,
  state text,
  postal_code text,
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index if not exists idx_hospital_branches_organization_active
  on hospital_branches (organization_id, active, name);

insert into hospital_branches (
  id, organization_id, code, name, address, city, state, phone, email, active, created_at, updated_at
)
select
  'branch-' || regexp_replace(lower(o.slug), '[^a-z0-9]+', '-', 'g') || '-main',
  o.id,
  'MAIN',
  o.name,
  coalesce(o.address, 'Main hospital campus'),
  coalesce(o.city, 'Not specified'),
  o.state,
  o.contact_phone,
  o.contact_email,
  true,
  now(),
  now()
from organizations o
where not exists (
  select 1 from hospital_branches hb where hb.organization_id = o.id
);

alter table doctors
  add column if not exists branch_id text references hospital_branches(id) on delete set null;

update doctors d
set branch_id = hb.id
from hospital_branches hb
where d.organization_id = hb.organization_id
  and hb.code = 'MAIN'
  and d.branch_id is null;

create index if not exists idx_doctors_branch_id
  on doctors (organization_id, branch_id);

alter table clinical_attachments
  alter column content_base64 drop not null,
  add column if not exists storage_provider text,
  add column if not exists storage_url text,
  add column if not exists storage_public_id text,
  add column if not exists original_filename text,
  add column if not exists mime_type text,
  add column if not exists storage_size integer;

alter table lab_reports
  add column if not exists attachment_storage_provider text,
  add column if not exists attachment_storage_url text,
  add column if not exists attachment_storage_public_id text,
  add column if not exists attachment_original_filename text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_storage_size integer;

create index if not exists idx_appointments_org_date_status
  on appointments (organization_id, appointment_date, status);

create index if not exists idx_lab_requests_org_date_status
  on lab_requests (organization_id, requested_date, status);

create index if not exists idx_prescriptions_org_created_status
  on prescriptions (organization_id, created_at, status);

create index if not exists idx_invoices_org_created_status
  on invoices (organization_id, created_at, payment_status);

create index if not exists idx_payments_org_paid_at
  on payments (organization_id, paid_at);
