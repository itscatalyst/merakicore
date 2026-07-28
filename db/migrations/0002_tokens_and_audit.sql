begin;

create table meraki_private.access_tokens (
  id uuid not null,
  token_digest text not null,
  tenant_id text not null,
  subject_id text not null,
  actor_id text not null,
  scopes text[] not null,
  label text not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint access_tokens_pkey primary key (id),
  constraint access_tokens_token_digest_key unique (token_digest),
  constraint access_tokens_token_digest_shape
    check (token_digest ~ '^hmac-sha256:[0-9a-f]{64}$'),
  constraint access_tokens_tenant_id_nonblank
    check (tenant_id = btrim(tenant_id) and tenant_id <> ''),
  constraint access_tokens_subject_id_nonblank
    check (subject_id = btrim(subject_id) and subject_id <> ''),
  constraint access_tokens_actor_id_nonblank
    check (actor_id = btrim(actor_id) and actor_id <> ''),
  constraint access_tokens_scopes_one_dimensional
    check (array_ndims(scopes) = 1),
  constraint access_tokens_scopes_nonempty
    check (cardinality(scopes) > 0),
  constraint access_tokens_scopes_no_nulls
    check (array_position(scopes, null) is null),
  constraint access_tokens_scopes_no_empty_values
    check (array_position(scopes, '') is null),
  constraint access_tokens_label_nonblank
    check (label = btrim(label) and label <> '')
);

comment on table meraki_private.access_tokens is
  'Revocable Meraki bearer-token authorities. Only a server-keyed digest is stored.';
comment on column meraki_private.access_tokens.token_digest is
  'Keyed token digest; never store or log the plaintext bearer token.';

create index access_tokens_active_subject_idx
  on meraki_private.access_tokens (tenant_id, subject_id, created_at desc, id)
  where revoked_at is null;

create table meraki_private.idempotency_records (
  tenant_id text not null,
  subject_id text not null,
  idempotency_key text not null,
  request_hash text not null,
  response_status integer not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  constraint idempotency_records_pkey
    primary key (tenant_id, subject_id, idempotency_key),
  constraint idempotency_records_tenant_id_nonblank
    check (tenant_id = btrim(tenant_id) and tenant_id <> ''),
  constraint idempotency_records_subject_id_nonblank
    check (subject_id = btrim(subject_id) and subject_id <> ''),
  constraint idempotency_records_key_shape
    check (
      idempotency_key = btrim(idempotency_key)
      and char_length(idempotency_key) between 1 and 255
    ),
  constraint idempotency_records_request_hash_sha256
    check (request_hash ~ '^sha256:[0-9a-f]{64}$'),
  constraint idempotency_records_response_status_http
    check (response_status between 100 and 599),
  constraint idempotency_records_response_body_object
    check (jsonb_typeof(response_body) = 'object')
);

comment on table meraki_private.idempotency_records is
  'Committed mutation responses keyed within one tenant and subject authority boundary.';

create table meraki_private.audit_events (
  id bigint generated always as identity,
  request_id text not null,
  token_id uuid,
  tenant_id text not null,
  subject_id text not null,
  actor_id text not null,
  action text not null,
  target text,
  outcome text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_pkey primary key (id),
  constraint audit_events_token_id_fkey
    foreign key (token_id)
    references meraki_private.access_tokens (id)
    on update restrict
    on delete restrict,
  constraint audit_events_request_id_nonblank
    check (request_id = btrim(request_id) and request_id <> ''),
  constraint audit_events_tenant_id_nonblank
    check (tenant_id = btrim(tenant_id) and tenant_id <> ''),
  constraint audit_events_subject_id_nonblank
    check (subject_id = btrim(subject_id) and subject_id <> ''),
  constraint audit_events_actor_id_nonblank
    check (actor_id = btrim(actor_id) and actor_id <> ''),
  constraint audit_events_action_nonblank
    check (action = btrim(action) and action <> ''),
  constraint audit_events_target_nonblank
    check (target is null or (target = btrim(target) and target <> '')),
  constraint audit_events_outcome_nonblank
    check (outcome = btrim(outcome) and outcome <> ''),
  constraint audit_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

comment on table meraki_private.audit_events is
  'Append-only history of authenticated Meraki requests and their outcomes.';

create index audit_events_subject_timeline_idx
  on meraki_private.audit_events (tenant_id, subject_id, created_at desc, id desc);
create index audit_events_subject_request_idx
  on meraki_private.audit_events (tenant_id, subject_id, request_id);
create index audit_events_token_id_idx
  on meraki_private.audit_events (token_id)
  where token_id is not null;

create function meraki_private.prevent_audit_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'MERAKI_AUDIT_EVENTS_APPEND_ONLY';
end;
$$;

comment on function meraki_private.prevent_audit_event_mutation() is
  'Rejects UPDATE, DELETE, and TRUNCATE so Meraki audit history remains append-only.';

revoke all on function meraki_private.prevent_audit_event_mutation() from public;

create trigger audit_events_reject_update_delete
before update or delete on meraki_private.audit_events
for each row
execute function meraki_private.prevent_audit_event_mutation();

create trigger audit_events_reject_truncate
before truncate on meraki_private.audit_events
for each statement
execute function meraki_private.prevent_audit_event_mutation();

revoke all on table meraki_private.access_tokens from public;
revoke all on table meraki_private.idempotency_records from public;
revoke all on table meraki_private.audit_events from public;
revoke all on sequence meraki_private.audit_events_id_seq from public;
revoke all on table meraki_private.access_tokens from anon, authenticated, service_role;
revoke all on table meraki_private.idempotency_records from anon, authenticated, service_role;
revoke all on table meraki_private.audit_events from anon, authenticated, service_role;
revoke all on sequence meraki_private.audit_events_id_seq from anon, authenticated, service_role;

grant select
  on table meraki_private.access_tokens
  to meraki_runtime;
grant select, insert
  on table meraki_private.idempotency_records
  to meraki_runtime;
grant select, insert
  on table meraki_private.audit_events
  to meraki_runtime;
grant usage, select
  on sequence meraki_private.audit_events_id_seq
  to meraki_runtime;

commit;
