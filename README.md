# Before You Decide — North Star Clarity Exercise

A guided onboarding exercise for the **100x Engineers 6-Month Applied AI Cohort**.
Before anyone enrolls, it helps them write a concrete North Star, see the gap
between where they stand and where they want to be, and get an honest read on
whether the cohort is the right vehicle to close it. The clarity is theirs to
keep either way.

It is a framework-free clone of the
[AI PM Roadmap](https://github.com/Siddhant-Goswami/ai-pm-roadmap): a static
front end with a Supabase Edge Function and table behind it.

## The five parts

1. **Where you stand today** — role, journey, code history, what you run today,
   industry, and the honest weekly (and worst-week) hours.
2. **Where you want to be** — the itch, your path (career vs. builder), the
   specific six-month outcome, the payoff underneath it, and a written North
   Star statement.
3. **The gap between** — where it stalled before, what you quietly expect to get
   stuck on, and the cost of changing nothing.
4. **Is this the right vehicle?** — the honest "built for you / not for you yet"
   read, shown against the answers just written.
5. **Where this leaves you** — a reflected-back North Star, clarity scores, and
   how the cohort would close the gap described.

## Run locally

```bash
npm run serve
npm run check
```

Open `http://localhost:4173`. On `localhost` the submission is simulated, so the
exercise runs end-to-end without a backend. Content lives in `js/data.js`;
clarity scoring, fit signals, and phone normalization live in `js/engine.js`.

## Backend (Supabase)

```bash
supabase db push                       # applies the migration
supabase functions deploy submit-exercise
supabase secrets set ALLOWED_ORIGIN="https://your-deployment.example.com"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to deployed Edge
Functions automatically. Then set `submissionEndpoint` in `js/config.js` to:

```
https://<project-ref>.supabase.co/functions/v1/submit-exercise
```

The Edge Function validates the seventeen-answer contract, recomputes all
clarity scores and fit signals server-side, and upserts by
`exercise_id + phone_e164`. The browser never receives a service-role key.

## Review

Use `public.north_star_submissions` in the Supabase dashboard. Relevant fields:

- `answers`: every part of the exercise, keyed by question id.
- `north_star_statement`, `path`, `decision`: the headline signals for a fit call.
- `assessment_stats`: seven clarity/honesty dimensions.
- `fit_signals`: the track, weekly rhythm, and stall guardrail shown to the user.
- `review_flags`: conditions that warrant a closer human read (e.g.
  `no-consistent-hours`, `north-star-vague`, `still-deciding`).

RLS is enabled with no public table policies. Writes happen only through the
Edge Function.

## Analytics (PostHog)

The full visitor journey is instrumented with [PostHog](https://posthog.com).
It is **off until configured** — paste your project API key into the `posthog`
block in `js/config.js`:

```js
posthog: {
  key: 'phc_xxx',                  // PostHog project API key
  host: 'https://us.i.posthog.com', // or https://eu.i.posthog.com
  disableOnLocalhost: true          // keep dev traffic out of your data
}
```

`js/analytics.js` lazy-loads the PostHog snippet and exposes a tiny, no-op-safe
`window.Analytics` wrapper, so an empty key (or a blocked CDN) never breaks the
exercise. No free-text answers or contact details are sent as event properties;
the only personal data is an explicit `identify(email)` on a consented submit.

Key events (all carry `exercise_id` and step/module context):

| Event | When |
| --- | --- |
| `exercise_started` / `exercise_resumed` / `exercise_revisited` | first load, depending on saved progress |
| `step_viewed` | every step a visitor lands on (deduped per position) |
| `option_selected` | a single/multi choice is picked or cleared |
| `question_answered`, `step_completed`, `step_unlocked` | advancing through the exercise |
| `step_back`, `module_opened`, `answer_review_clicked` | backward / lateral navigation |
| `north_star_refine_started` | the "refine my North Star" loop |
| `submit_attempted`, `submit_validation_failed` | the contact-form submit funnel |
| `exercise_submitted` / `submission_failed` | roadmap generated (with timing + scores) or errored |
| `roadmap_printed`, `exercise_reset` | post-result actions |

Build the funnel in PostHog from `exercise_started → step_completed (per module)
→ submit_attempted → exercise_submitted` to see exactly where people drop.

## Admin panel

`admin.html` is a token-gated dashboard for submissions, basic analytics, LLM API
cost, and free-tier (Supabase / Vercel) headroom — including when usage will force
an upgrade off the free plans. It is backed by the `admin-data` Edge Function and
the `admin_dashboard_stats` RPC. Set the `ADMIN_TOKEN` secret to enable it. See
[ADMIN.md](ADMIN.md) for setup and what each panel means.
