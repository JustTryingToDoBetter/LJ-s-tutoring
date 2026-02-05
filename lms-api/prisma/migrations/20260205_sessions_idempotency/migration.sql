do $$
begin
  if to_regclass('public.sessions') is not null then
    alter table sessions
      add column if not exists sync_key text;

    create unique index if not exists idx_sessions_tutor_sync_key
      on sessions (tutor_id, sync_key)
      where sync_key is not null;
  end if;
end $$;