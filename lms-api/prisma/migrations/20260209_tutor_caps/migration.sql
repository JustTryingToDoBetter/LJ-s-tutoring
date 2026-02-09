alter table tutor_profiles
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists qualification_band text,
  add column if not exists qualified_subjects_json jsonb;
