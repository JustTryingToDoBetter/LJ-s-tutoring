create extension if not exists pgcrypto;

 do $$
 begin
   if not exists (select 1 from pg_type where typname = 'pay_period_status') then
     create type pay_period_status as enum ('OPEN', 'LOCKED');
   end if;
   if not exists (select 1 from pg_type where typname = 'adjustment_type') then
     create type adjustment_type as enum ('BONUS', 'CORRECTION', 'PENALTY');
   end if;
   if not exists (select 1 from pg_type where typname = 'adjustment_status') then
     create type adjustment_status as enum ('DRAFT', 'APPROVED');
   end if;
   if not exists (select 1 from pg_type where typname = 'invoice_line_type') then
     create type invoice_line_type as enum ('SESSION', 'ADJUSTMENT');
   end if;
 end $$;

 create table if not exists pay_periods (
   id uuid primary key default gen_random_uuid(),
   period_start_date date not null,
   period_end_date date not null,
   status pay_period_status not null default 'OPEN',
   locked_at timestamptz,
   locked_by_user_id uuid references users(id) on delete set null,
   notes text
 );

 create unique index if not exists idx_pay_periods_period_start
   on pay_periods (period_start_date);

 create table if not exists adjustments (
   id uuid primary key default gen_random_uuid(),
   tutor_id uuid not null references tutor_profiles(id) on delete restrict,
   pay_period_id uuid not null references pay_periods(id) on delete restrict,
   type adjustment_type not null,
   amount numeric(10, 2) not null,
   reason text not null,
   status adjustment_status not null default 'APPROVED',
   created_by_user_id uuid not null references users(id) on delete restrict,
   approved_by_user_id uuid references users(id) on delete set null,
   created_at timestamptz not null default now(),
   approved_at timestamptz,
   related_session_id uuid references sessions(id) on delete set null
 );

 create index if not exists idx_adjustments_tutor_period
   on adjustments (tutor_id, pay_period_id);

 create index if not exists idx_adjustments_period
   on adjustments (pay_period_id);

 alter table invoice_lines
   add column if not exists line_type invoice_line_type not null default 'SESSION',
   add column if not exists adjustment_id uuid references adjustments(id) on delete set null;

 alter table invoice_lines
   alter column session_id drop not null;

 create index if not exists idx_invoice_lines_adjustment
   on invoice_lines (adjustment_id);

 do $$
 begin
   if not exists (select 1 from pg_constraint where conname = 'invoice_lines_type_ref_check') then
     alter table invoice_lines
       add constraint invoice_lines_type_ref_check
       check (
         (line_type = 'SESSION' and session_id is not null and adjustment_id is null)
         or (line_type = 'ADJUSTMENT' and adjustment_id is not null and session_id is null)
       );
   end if;
 end $$;
