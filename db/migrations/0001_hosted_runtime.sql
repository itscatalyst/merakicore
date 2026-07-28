begin;

do $meraki_role$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'meraki_runtime'
  ) then
    create role meraki_runtime
      nologin
      noinherit
      nosuperuser
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls;
  end if;
end
$meraki_role$;

alter role meraki_runtime
  nologin
  noinherit
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  nobypassrls;

comment on role meraki_runtime is
  'Least-privileged group role for the hosted Meraki application.';

create schema if not exists meraki_private;

comment on schema meraki_private is
  'Private Meraki runtime state. This schema must not be exposed through the Data API.';

revoke all on schema meraki_private from public;
revoke all on schema meraki_private from anon, authenticated, service_role;

alter default privileges in schema meraki_private
  revoke all on tables from public;
alter default privileges in schema meraki_private
  revoke all on sequences from public;
alter default privileges in schema meraki_private
  revoke all on functions from public;

create table meraki_private.runtime_snapshots (
  tenant_id text not null,
  subject_id text not null,
  revision bigint not null default 0,
  snapshot jsonb not null,
  snapshot_hash text not null,
  updated_at timestamptz not null default now(),
  constraint runtime_snapshots_pkey primary key (tenant_id, subject_id),
  constraint runtime_snapshots_tenant_id_nonblank
    check (tenant_id = btrim(tenant_id) and tenant_id <> ''),
  constraint runtime_snapshots_subject_id_nonblank
    check (subject_id = btrim(subject_id) and subject_id <> ''),
  constraint runtime_snapshots_revision_nonnegative
    check (revision >= 0),
  constraint runtime_snapshots_snapshot_object
    check (jsonb_typeof(snapshot) = 'object'),
  constraint runtime_snapshots_snapshot_hash_sha256
    check (snapshot_hash ~ '^sha256:[0-9a-f]{64}$')
);

comment on table meraki_private.runtime_snapshots is
  'One validated, canonical runtime snapshot per Meraki tenant and subject.';
comment on column meraki_private.runtime_snapshots.revision is
  'Monotonic optimistic-concurrency revision incremented once per committed mutation.';
comment on column meraki_private.runtime_snapshots.snapshot_hash is
  'SHA-256 digest of the RFC 8785 canonical snapshot, formatted as sha256:<lowercase hex>.';

revoke all on table meraki_private.runtime_snapshots from public;
revoke all on table meraki_private.runtime_snapshots from anon, authenticated, service_role;

grant usage on schema meraki_private to meraki_runtime;
grant select, insert, update
  on table meraki_private.runtime_snapshots
  to meraki_runtime;

commit;
