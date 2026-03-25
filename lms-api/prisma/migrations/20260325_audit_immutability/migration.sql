-- Migration: 20260325_audit_immutability
-- Harden audit trail tamper resistance with immutable write-once semantics.
-- Deletes are blocked unless retention cleanup explicitly enables bypass.

create or replace function block_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'audit_log is immutable';
  end if;

  if tg_op = 'DELETE' then
    if coalesce(current_setting('app.retention_cleanup', true), 'off') <> 'on' then
      raise exception 'audit_log delete blocked outside retention cleanup';
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_block_audit_log_mutation on audit_log;
create trigger trg_block_audit_log_mutation
before update or delete on audit_log
for each row execute function block_audit_log_mutation();

create or replace function block_session_history_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'session_history is immutable';
  end if;

  if tg_op = 'DELETE' then
    if coalesce(current_setting('app.retention_cleanup', true), 'off') <> 'on' then
      raise exception 'session_history delete blocked outside retention cleanup';
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_block_session_history_mutation on session_history;
create trigger trg_block_session_history_mutation
before update or delete on session_history
for each row execute function block_session_history_mutation();
