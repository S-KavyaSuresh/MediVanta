alter table users
  add column if not exists reset_token_hash text,
  add column if not exists reset_otp_hash text,
  add column if not exists reset_expires_at timestamptz,
  add column if not exists email_verified boolean not null default true,
  add column if not exists verification_token_hash text,
  add column if not exists verification_otp_hash text,
  add column if not exists verification_expires_at timestamptz,
  add column if not exists password_reset_required boolean not null default false;

alter table sessions
  add column if not exists refresh_token_hash text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists last_used_at timestamptz not null default now(),
  add column if not exists revoked_at timestamptz,
  add column if not exists user_agent text,
  add column if not exists device_label text;

create table if not exists audit_logs (
  id text primary key,
  organization_id text references organizations(id) on delete cascade,
  actor_user_id text references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata_json text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_organization_id on audit_logs(organization_id);
create index if not exists idx_audit_logs_actor_user_id on audit_logs(actor_user_id);
create index if not exists idx_audit_logs_created_at on audit_logs(created_at desc);
