alter table lab_tests
  add column if not exists price_cents integer not null default 0;

create table if not exists invoices (
  id text primary key,
  invoice_number text not null unique,
  organization_id text not null references organizations(id) on delete cascade,
  hospital_id text not null references organizations(id) on delete cascade,
  patient_id text not null,
  patient_name text not null,
  source_type text,
  source_id text,
  due_date text,
  subtotal_cents integer not null default 0,
  total_cents integer not null default 0,
  amount_paid_cents integer not null default 0,
  amount_due_cents integer not null default 0,
  payment_status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_invoices_source_unique
  on invoices(organization_id, source_type, source_id)
  where source_type is not null and source_id is not null;

create table if not exists invoice_items (
  id text primary key,
  invoice_id text not null references invoices(id) on delete cascade,
  organization_id text not null references organizations(id) on delete cascade,
  description text not null,
  category text not null,
  quantity integer not null,
  unit_amount_cents integer not null,
  total_amount_cents integer not null,
  source_type text,
  source_id text
);

create table if not exists payments (
  id text primary key,
  invoice_id text not null references invoices(id) on delete cascade,
  organization_id text not null references organizations(id) on delete cascade,
  patient_id text not null,
  amount_cents integer not null,
  method text not null,
  reference_number text,
  paid_at timestamptz not null,
  recorded_by_id text,
  recorded_by_name text
);

create table if not exists inventory_items (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  medicine_name text not null,
  generic_name text,
  batch_number text not null,
  quantity_in_stock integer not null,
  unit text not null,
  unit_price_cents integer not null,
  expiry_date text not null,
  reorder_level integer not null,
  manufacturer text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists notifications (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  organization_id text not null references organizations(id) on delete cascade,
  title text not null,
  message text not null,
  category text not null,
  related_entity_type text,
  related_entity_id text,
  read boolean not null default false,
  created_at timestamptz not null
);

create index if not exists idx_invoices_organization_id on invoices(organization_id);
create index if not exists idx_invoices_patient_id on invoices(patient_id);
create index if not exists idx_payments_invoice_id on payments(invoice_id);
create index if not exists idx_inventory_items_organization_id on inventory_items(organization_id);
create index if not exists idx_inventory_items_medicine_name on inventory_items(organization_id, medicine_name);
create index if not exists idx_notifications_user_id on notifications(user_id, read, created_at desc);
