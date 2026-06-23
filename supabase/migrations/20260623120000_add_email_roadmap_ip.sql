-- Capture email, the generated roadmap, and a hashed IP so the Edge Function
-- can (1) dedupe roadmap generation per person and (2) rate-limit per IP.
alter table public.north_star_submissions
  add column if not exists email text,
  add column if not exists roadmap jsonb,
  add column if not exists roadmap_generated_at timestamptz,
  add column if not exists ip_hash text;

-- Find a prior roadmap for the same person fast (email or phone), and count
-- recent generations from one IP for the rate limit.
create index if not exists north_star_submissions_email_idx
  on public.north_star_submissions (email);

create index if not exists north_star_submissions_ip_recent_idx
  on public.north_star_submissions (ip_hash, roadmap_generated_at desc);
