DROP TABLE IF EXISTS audit_entries;
DROP FUNCTION IF EXISTS reject_audit_mutation();
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS idempotency_receipts;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS tenants;
DROP FUNCTION IF EXISTS meraki_current_session_id();
DROP FUNCTION IF EXISTS meraki_current_actor_id();
DROP FUNCTION IF EXISTS meraki_current_subject_id();
DROP FUNCTION IF EXISTS meraki_current_tenant_id();

REVOKE USAGE ON SCHEMA public FROM meraki_app, meraki_worker;
