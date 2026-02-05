do $$
begin
  if to_regclass('public.students') is not null then
    begin
      alter table students alter column first_name drop not null;
    exception when undefined_column then
      null;
    end;

    begin
      alter table students alter column last_name drop not null;
    exception when undefined_column then
      null;
    end;
  end if;
end $$;
