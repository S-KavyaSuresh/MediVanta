alter table hospital_settings
  add column if not exists total_beds integer not null default 0,
  add column if not exists occupied_beds integer not null default 0;

update hospital_settings
set total_beds = greatest(total_beds, 0),
    occupied_beds = least(greatest(occupied_beds, 0), greatest(total_beds, 0));

alter table lab_requests
  add column if not exists appointment_id text references appointments(id) on delete set null,
  add column if not exists ordered_by_user_id text references users(id) on delete set null,
  add column if not exists clinical_notes text;

create index if not exists idx_lab_requests_appointment_id
  on lab_requests (appointment_id);

create index if not exists idx_lab_requests_ordered_by_user_id
  on lab_requests (ordered_by_user_id);
