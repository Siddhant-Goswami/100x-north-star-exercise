-- Admin panel support: a log of real LLM calls (for true cost tracking,
-- independent of roadmap dedup) and a single RPC that returns every aggregate
-- the dashboard needs in one round trip, including on-disk size for free-tier
-- capacity planning.

-- One row per actual OpenAI call. We store token counts and the model, NOT a
-- frozen cost — cost is derived in the admin function from current per-token
-- prices, so updating the price assumption recomputes history correctly.
create table if not exists public.llm_usage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  exercise_id text,
  submission_id uuid,
  source text not null default 'roadmap',
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  success boolean not null default true
);

create index if not exists llm_usage_events_created_idx
  on public.llm_usage_events (created_at desc);

alter table public.llm_usage_events enable row level security;
-- No public policies: only the service-role Edge Functions read/write this.

-- Everything the admin dashboard needs, in one call. SECURITY DEFINER so it can
-- read pg_*_size; it only ever returns aggregates, never raw PII, and the
-- Edge Function gates access with an admin token before calling it.
create or replace function public.admin_dashboard_stats(p_exercise_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  with subs as (
    select *
    from public.north_star_submissions
    where p_exercise_id is null or exercise_id = p_exercise_id
  ),
  stats_unnested as (
    select
      coalesce((assessment_stats->>'northStarClarity')::numeric, 0) as north_star_clarity,
      coalesce((assessment_stats->>'commitmentSignal')::numeric, 0) as commitment_signal,
      (
        coalesce((assessment_stats->>'northStarClarity')::numeric, 0) +
        coalesce((assessment_stats->>'outcomeClarity')::numeric, 0) +
        coalesce((assessment_stats->>'motivationDepth')::numeric, 0) +
        coalesce((assessment_stats->>'gapHonesty')::numeric, 0) +
        coalesce((assessment_stats->>'startingClarity')::numeric, 0) +
        coalesce((assessment_stats->>'timeRealism')::numeric, 0) +
        coalesce((assessment_stats->>'commitmentSignal')::numeric, 0)
      ) / 7.0 as composite
    from subs
    where assessment_stats is not null
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'exerciseId', p_exercise_id,
    'totals', jsonb_build_object(
      'all', (select count(*) from subs),
      'today', (select count(*) from subs where submitted_at >= date_trunc('day', now())),
      'last7', (select count(*) from subs where submitted_at >= now() - interval '7 days'),
      'last30', (select count(*) from subs where submitted_at >= now() - interval '30 days'),
      'thisMonth', (select count(*) from subs where submitted_at >= date_trunc('month', now())),
      'withEmail', (select count(*) from subs where email is not null),
      'consented', (select count(*) from subs where whatsapp_consent)
    ),
    'byPath', (
      select coalesce(jsonb_object_agg(key, n), '{}'::jsonb)
      from (select coalesce(path, 'unset') as key, count(*) n from subs group by 1) t
    ),
    'byDecision', (
      select coalesce(jsonb_object_agg(key, n), '{}'::jsonb)
      from (select coalesce(decision, 'unset') as key, count(*) n from subs group by 1) t
    ),
    'byReadiness', (
      select coalesce(jsonb_object_agg(key, n), '{}'::jsonb)
      from (select coalesce(readiness_state, 'unset') as key, count(*) n from subs group by 1) t
    ),
    'topFlags', (
      select coalesce(jsonb_agg(jsonb_build_object('flag', flag, 'count', n) order by n desc), '[]'::jsonb)
      from (
        select flag, count(*) n
        from subs, unnest(review_flags) as flag
        group by flag
      ) t
    ),
    'roadmapSource', (
      select coalesce(jsonb_object_agg(key, n), '{}'::jsonb)
      from (
        select coalesce(roadmap->>'generatedBy', 'none') as key, count(*) n
        from subs group by 1
      ) t
    ),
    'avgClarity', (select round(avg(north_star_clarity), 2) from stats_unnested),
    'avgComposite', (select round(avg(composite), 2) from stats_unnested),
    'avgCommitment', (select round(avg(commitment_signal), 2) from stats_unnested),
    'avgElapsedSeconds', (select round(avg(elapsed_seconds)) from subs where elapsed_seconds is not null),
    'dailySubmissions', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'count', coalesce(c.n, 0)) order by d), '[]'::jsonb)
      from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d
      left join (
        select date_trunc('day', submitted_at) bucket, count(*) n
        from subs
        where submitted_at >= now() - interval '30 days'
        group by 1
      ) c on c.bucket = d
    ),
    'llm', (
      select jsonb_build_object(
        'calls', count(*),
        'successes', count(*) filter (where success),
        'failures', count(*) filter (where not success),
        'inputTokens', coalesce(sum(input_tokens), 0),
        'outputTokens', coalesce(sum(output_tokens), 0),
        'totalTokens', coalesce(sum(total_tokens), 0),
        'callsThisMonth', count(*) filter (where created_at >= date_trunc('month', now())),
        'inputTokensThisMonth', coalesce(sum(input_tokens) filter (where created_at >= date_trunc('month', now())), 0),
        'outputTokensThisMonth', coalesce(sum(output_tokens) filter (where created_at >= date_trunc('month', now())), 0),
        'callsLast30', count(*) filter (where created_at >= now() - interval '30 days'),
        'daily', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'date', d::date,
            'calls', coalesce(c.n, 0),
            'inputTokens', coalesce(c.it, 0),
            'outputTokens', coalesce(c.ot, 0)
          ) order by d), '[]'::jsonb)
          from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d
          left join (
            select date_trunc('day', created_at) bucket, count(*) n,
                   sum(input_tokens) it, sum(output_tokens) ot
            from public.llm_usage_events
            where created_at >= now() - interval '30 days'
              and (p_exercise_id is null or exercise_id = p_exercise_id)
            group by 1
          ) c on c.bucket = d
        )
      )
      from public.llm_usage_events
      where p_exercise_id is null or exercise_id = p_exercise_id
    ),
    'storage', jsonb_build_object(
      'databaseBytes', pg_database_size(current_database()),
      'submissionsTableBytes', pg_total_relation_size('public.north_star_submissions'),
      'llmTableBytes', pg_total_relation_size('public.llm_usage_events')
    )
  )
  into result;

  return result;
end;
$$;

-- Lock the function down: only the service role (used by the Edge Function) may
-- execute it. anon/authenticated cannot reach the aggregates or size functions.
revoke all on function public.admin_dashboard_stats(text) from public, anon, authenticated;
grant execute on function public.admin_dashboard_stats(text) to service_role;
