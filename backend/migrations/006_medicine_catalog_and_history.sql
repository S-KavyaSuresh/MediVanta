create table if not exists medicine_catalog (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  strength text,
  unit text not null,
  generic_name text,
  active boolean not null default true,
  normalized_name text not null,
  normalized_strength text not null default '',
  normalized_unit text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_medicine_catalog_unique
  on medicine_catalog (organization_id, normalized_name, normalized_strength, normalized_unit);

alter table inventory_items
  add column if not exists medicine_id text references medicine_catalog(id) on delete set null;

alter table prescription_medicines
  add column if not exists medicine_id text references medicine_catalog(id) on delete set null;

update prescription_medicines
set strength = null
where trim(coalesce(strength, '')) in ('-', '--');

insert into medicine_catalog (
  id,
  organization_id,
  name,
  strength,
  unit,
  generic_name,
  active,
  normalized_name,
  normalized_strength,
  normalized_unit,
  created_at,
  updated_at
)
select
  'MEDCAT-' || substr(md5(concat_ws('|', ii.organization_id, lower(trim(ii.medicine_name)), lower(trim(coalesce(ii.unit, ''))))), 1, 16),
  ii.organization_id,
  trim(ii.medicine_name),
  null,
  trim(ii.unit),
  trim(ii.generic_name),
  true,
  lower(trim(ii.medicine_name)),
  '',
  lower(trim(ii.unit)),
  now(),
  now()
from inventory_items ii
where trim(coalesce(ii.medicine_name, '')) <> ''
  and trim(coalesce(ii.unit, '')) <> ''
on conflict (organization_id, normalized_name, normalized_strength, normalized_unit) do nothing;

update inventory_items ii
set medicine_id = mc.id
from medicine_catalog mc
where ii.organization_id = mc.organization_id
  and lower(trim(ii.medicine_name)) = mc.normalized_name
  and lower(trim(ii.unit)) = mc.normalized_unit
  and ii.medicine_id is null;

update prescription_medicines pm
set medicine_id = mc.id
from prescriptions p, medicine_catalog mc
where p.id = pm.prescription_id
  and mc.organization_id = p.organization_id
  and lower(trim(pm.medicine_name)) = mc.normalized_name
  and lower(trim(coalesce(pm.dose_unit, regexp_replace(pm.dosage, '^\\s*\\d+\\s*', '')))) = mc.normalized_unit
  and coalesce(lower(trim(pm.strength)), '') = mc.normalized_strength
  and pm.medicine_id is null
  and trim(coalesce(pm.medicine_name, '')) <> '';

create index if not exists idx_medicine_catalog_org_name
  on medicine_catalog (organization_id, normalized_name);

create index if not exists idx_prescription_medicines_medicine_id
  on prescription_medicines (medicine_id);

create index if not exists idx_inventory_items_medicine_id
  on inventory_items (medicine_id);
