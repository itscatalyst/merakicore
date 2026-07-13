BEGIN;

DROP TABLE IF EXISTS audit_entries;
DROP FUNCTION IF EXISTS reject_audit_mutation();
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS idempotency_receipts;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS tenants;
DROP FUNCTION IF EXISTS meraki_current_subject_id();
DROP FUNCTION IF EXISTS meraki_current_tenant_id();

REVOKE USAGE ON SCHEMA public FROM meraki_app, meraki_worker;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'meraki_worker') THEN
    DROP ROLE meraki_worker;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'meraki_app') THEN
    DROP ROLE meraki_app;
  END IF;
END
$$;

COMMIT;
