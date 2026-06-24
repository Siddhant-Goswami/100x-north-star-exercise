-- Modular multi-roadmap platform schema (profiles, roadmaps, roadmap_questions,
-- submissions, llm_usage_events, model_pricing) + RLS + auth trigger.

create extension if not exists pgcrypto;

-- ========================= profiles =========================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text,
  role text not null default 'instructor' check (role in ('instructor','super_admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ========================= roadmaps =========================
create table public.roadmaps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  provider text not null default 'openai' check (provider in ('openai','groq','openrouter','anthropic')),
  model text not null default 'gpt-5.4-mini',
  system_prompt text not null default '',
  enable_web_search boolean not null default false,
  max_output_tokens int not null default 2200,
  model_params jsonb not null default '{}'::jsonb,
  intro jsonb not null default '{}'::jsonb,
  modules jsonb not null default '[]'::jsonb,
  output_schema jsonb not null default '[]'::jsonb,
  cta jsonb not null default '{}'::jsonb,
  scoring jsonb not null default '{}'::jsonb,
  max_gen_per_ip_per_day int not null default 5,
  display_order int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.roadmaps enable row level security;
create index roadmaps_status_idx on public.roadmaps (status, display_order);
create index roadmaps_owner_idx on public.roadmaps (owner_id);

-- ===================== roadmap_questions =====================
create table public.roadmap_questions (
  id uuid primary key default gen_random_uuid(),
  roadmap_id uuid not null references public.roadmaps(id) on delete cascade,
  question_key text not null,
  position int not null default 0,
  module text,
  type text not null check (type in ('text','long','single','multi','intro')),
  title text not null,
  help text,
  placeholder text,
  max_length int,
  options jsonb not null default '[]'::jsonb,
  allow_other boolean not null default false,
  required boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  unique (roadmap_id, question_key)
);
alter table public.roadmap_questions enable row level security;
create index roadmap_questions_roadmap_idx on public.roadmap_questions (roadmap_id, position);

-- ========================= submissions =========================
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  roadmap_id uuid not null references public.roadmaps(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  output jsonb,
  assessment jsonb,
  name text,
  email text,
  phone_e164 text,
  whatsapp_consent boolean not null default false,
  ip_hash text,
  elapsed_seconds int,
  source text not null default 'production' check (source in ('production','test')),
  output_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (roadmap_id, phone_e164)
);
alter table public.submissions enable row level security;
create index submissions_roadmap_recent_idx on public.submissions (roadmap_id, created_at desc);
create index submissions_ip_idx on public.submissions (ip_hash, output_generated_at);

-- ====================== llm_usage_events ======================
create table public.llm_usage_events (
  id uuid primary key default gen_random_uuid(),
  roadmap_id uuid references public.roadmaps(id) on delete set null,
  submission_id uuid references public.submissions(id) on delete set null,
  provider text,
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  total_tokens int not null default 0,
  success boolean not null default true,
  source text not null default 'production' check (source in ('production','test')),
  created_at timestamptz not null default now()
);
alter table public.llm_usage_events enable row level security;
create index llm_usage_roadmap_idx on public.llm_usage_events (roadmap_id, created_at desc);

-- ======================== model_pricing ========================
create table public.model_pricing (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  input_price_per_mtok numeric not null default 0,
  output_price_per_mtok numeric not null default 0,
  effective_from timestamptz not null default now(),
  unique (provider, model, effective_from)
);
alter table public.model_pricing enable row level security;

-- ============================ RLS ============================
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.current_app_role() = 'super_admin');
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "roadmaps_owner_all" on public.roadmaps for all to authenticated
  using (owner_id = auth.uid() or public.current_app_role() = 'super_admin')
  with check (owner_id = auth.uid() or public.current_app_role() = 'super_admin');
create policy "questions_owner_all" on public.roadmap_questions for all to authenticated
  using (exists (select 1 from public.roadmaps r where r.id = roadmap_id
    and (r.owner_id = auth.uid() or public.current_app_role() = 'super_admin')))
  with check (exists (select 1 from public.roadmaps r where r.id = roadmap_id
    and (r.owner_id = auth.uid() or public.current_app_role() = 'super_admin')));

-- submissions, llm_usage_events, model_pricing: service-role only (no policies).
-- Seed model pricing (USD per million tokens).
insert into public.model_pricing (provider, model, input_price_per_mtok, output_price_per_mtok) values
  ('openai','gpt-5.4-mini', 0.75, 4.50),
  ('openai','gpt-5.4', 2.50, 10.00),
  ('anthropic','claude-opus-4-8', 5.00, 25.00),
  ('anthropic','claude-sonnet-4-6', 3.00, 15.00),
  ('anthropic','claude-haiku-4-5-20251001', 1.00, 5.00),
  ('groq','llama-3.3-70b-versatile', 0.59, 0.79),
  ('openrouter','openai/gpt-5.4-mini', 0.75, 4.50)
on conflict (provider, model, effective_from) do nothing;
