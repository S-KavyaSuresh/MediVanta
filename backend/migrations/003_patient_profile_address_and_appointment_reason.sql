alter table patient_profiles
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text;

update patient_profiles
set address_line_1 = coalesce(address_line_1, address)
where address is not null
  and coalesce(trim(address_line_1), '') = '';

alter table appointments
  add column if not exists reason_for_appointment text;
