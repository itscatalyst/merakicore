BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'meraki_app') THEN
    CREATE ROLE meraki_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'meraki_worker') THEN
    CREATE ROLE meraki_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

CREATE FUNCTION meraki_current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  RETURN NULLIF(current_setting('meraki.tenant_id', true), '')::uuid;

CREATE FUNCTION meraki_current_subject_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  RETURN NULLIF(current_setting('meraki.subject_id', true), '')::uuid;

CREATE TABLE tenants (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

CREATE TABLE subjects (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE idempotency_receipts (
  tenant_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK (state IN ('processing', 'completed', 'failed')),
  response_status integer,
  result_reference jsonb,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, subject_id, idempotency_key),
  FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id) ON DELETE CASCADE,
  CHECK ((state = 'completed') = (completed_at IS NOT NULL))
);

CREATE TABLE jobs (
  tenant_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  id uuid NOT NULL,
  job_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, subject_id, idempotency_key)
    REFERENCES idempotency_receipts(tenant_id, subject_id, idempotency_key)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE audit_entries (
  sequence_id bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  id uuid NOT NULL,
  actor_id uuid NOT NULL,
  session_id uuid NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (sequence_id),
  FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id) ON DELETE RESTRICT
);

CREATE FUNCTION reject_audit_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit entries are append-only' USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER audit_entries_immutable
  BEFORE UPDATE OR DELETE ON audit_entries
  FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE subjects FORCE ROW LEVEL SECURITY;
ALTER TABLE idempotency_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenants
  USING (id = meraki_current_tenant_id())
  WITH CHECK (id = meraki_current_tenant_id());
CREATE POLICY subject_isolation ON subjects
  USING (tenant_id = meraki_current_tenant_id())
  WITH CHECK (tenant_id = meraki_current_tenant_id());
CREATE POLICY idempotency_isolation ON idempotency_receipts
  USING (tenant_id = meraki_current_tenant_id() AND subject_id = meraki_current_subject_id())
  WITH CHECK (tenant_id = meraki_current_tenant_id() AND subject_id = meraki_current_subject_id());
CREATE POLICY job_isolation ON jobs
  USING (tenant_id = meraki_current_tenant_id() AND subject_id = meraki_current_subject_id())
  WITH CHECK (tenant_id = meraki_current_tenant_id() AND subject_id = meraki_current_subject_id());
CREATE POLICY audit_isolation ON audit_entries
  USING (tenant_id = meraki_current_tenant_id() AND subject_id = meraki_current_subject_id())
  WITH CHECK (tenant_id = meraki_current_tenant_id() AND subject_id = meraki_current_subject_id());

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO meraki_app, meraki_worker;
GRANT SELECT, INSERT, UPDATE ON tenants, subjects, idempotency_receipts, jobs TO meraki_app, meraki_worker;
GRANT SELECT, INSERT ON audit_entries TO meraki_app, meraki_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO meraki_app, meraki_worker;
GRANT EXECUTE ON FUNCTION meraki_current_tenant_id(), meraki_current_subject_id() TO meraki_app, meraki_worker;

COMMIT;
