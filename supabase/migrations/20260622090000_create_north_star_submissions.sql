create extension if not exists pgcrypto;

create table if not exists public.north_star_submissions (
  id uuid primary key default gen_random_uuid(),
  exercise_id text not null,
  name text not null,
  phone_e164 text not null,
  whatsapp_consent boolean not null default false,
  answers jsonb not null,
  path text,
  decision text,
  north_star_statement text,
  readiness_state text not null,
  assessment_version text,
  assessment_stats jsonb,
  fit_signals jsonb,
  review_flags text[] not null default '{}',
  elapsed_seconds integer,
  started_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exercise_id, phone_e164)
);

create index if not exists north_star_submissions_recent_idx
  on public.north_star_submissions (exercise_id, submitted_at desc);

create index if not exists north_star_submissions_flags_idx
  on public.north_star_submissions using gin (review_flags);

alter table public.north_star_submissions
  add constraint north_star_submissions_fit_signals_array
  check (fit_signals is null or jsonb_typeof(fit_signals) = 'array');

alter table public.north_star_submissions enable row level security;

-- No public policies are intentional. The Edge Function writes with the service
-- role, while review and CSV export happen through the authenticated dashboard.
