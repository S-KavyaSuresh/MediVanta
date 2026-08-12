alter table prescription_medicines
  add column if not exists strength text,
  add column if not exists dose_quantity integer,
  add column if not exists dose_unit text,
  add column if not exists duration_value integer,
  add column if not exists duration_unit text,
  add column if not exists total_quantity integer,
  add column if not exists instructions_notes text;
