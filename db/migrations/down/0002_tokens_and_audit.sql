begin;

drop trigger if exists audit_events_reject_truncate
  on meraki_private.audit_events;
drop trigger if exists audit_events_reject_update_delete
  on meraki_private.audit_events;
drop function if exists meraki_private.prevent_audit_event_mutation();

drop table if exists meraki_private.audit_events;
drop table if exists meraki_private.idempotency_records;
drop table if exists meraki_private.access_tokens;

commit;
