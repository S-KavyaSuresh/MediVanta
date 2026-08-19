alter table invoices
  add column if not exists discount_cents integer not null default 0,
  add column if not exists tax_cents integer not null default 0;

update invoices
set discount_cents = greatest(discount_cents, 0),
    tax_cents = greatest(tax_cents, 0),
    total_cents = greatest(subtotal_cents - greatest(discount_cents, 0) + greatest(tax_cents, 0), 0),
    amount_paid_cents = greatest(amount_paid_cents, 0),
    amount_due_cents = greatest(
      greatest(subtotal_cents - greatest(discount_cents, 0) + greatest(tax_cents, 0), 0) - greatest(amount_paid_cents, 0),
      0
    );

create table if not exists suppliers (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  supplier_name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  status text not null default 'Active',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint suppliers_status_check check (status in ('Active', 'Inactive'))
);

create index if not exists idx_suppliers_organization_name
  on suppliers (organization_id, supplier_name);

create table if not exists purchase_orders (
  id text primary key,
  purchase_order_number text not null unique,
  organization_id text not null references organizations(id) on delete cascade,
  supplier_id text not null references suppliers(id) on delete restrict,
  order_date text not null,
  expected_date text,
  status text not null,
  notes text,
  created_by_user_id text references users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  received_at timestamptz,
  received_by_user_id text references users(id) on delete set null,
  received_by_name text,
  constraint purchase_orders_status_check check (status in ('Draft', 'Ordered', 'Received', 'Cancelled'))
);

create index if not exists idx_purchase_orders_organization_date
  on purchase_orders (organization_id, order_date desc, created_at desc);

create table if not exists purchase_order_items (
  id text primary key,
  purchase_order_id text not null references purchase_orders(id) on delete cascade,
  organization_id text not null references organizations(id) on delete cascade,
  medicine_id text references medicine_catalog(id) on delete set null,
  medicine_name text not null,
  quantity integer not null,
  unit_cost_cents integer not null,
  line_total_cents integer not null,
  received_quantity integer,
  received_unit_cost_cents integer,
  received_batch_number text,
  received_expiry_date text,
  display_order integer not null default 0
);

create index if not exists idx_purchase_order_items_purchase_order
  on purchase_order_items (purchase_order_id, display_order asc);

create table if not exists doctor_ratings (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  appointment_id text not null unique references appointments(id) on delete cascade,
  patient_id text not null references users(id) on delete cascade,
  family_member_id text references family_members(id) on delete set null,
  doctor_id text not null references doctors(id) on delete cascade,
  rating integer not null,
  review_comment text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint doctor_ratings_rating_check check (rating between 1 and 5)
);

create index if not exists idx_doctor_ratings_doctor
  on doctor_ratings (organization_id, doctor_id, created_at desc);
