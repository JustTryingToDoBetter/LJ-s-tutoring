-- 004_adjustments_voided.sql

alter table adjustments
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by_user_id uuid references users(id) on delete set null,
  add column if not exists void_reason text;

create index if not exists idx_adjustments_voided
  on adjustments (voided_at);
