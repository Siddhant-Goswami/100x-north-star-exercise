# Admin panel

A lightweight, token-gated dashboard for the North Star exercise: submissions,
basic analytics, LLM API cost, and free-tier headroom (when to upgrade Supabase /
Vercel off the free plans).

- **Page:** `admin.html` (served from the same Vercel site — e.g. `https://100x-north-star-exercise.vercel.app/admin.html`)
- **Data API:** Supabase Edge Function `admin-data` (read-only, token-gated)
- **Aggregates:** Postgres RPC `admin_dashboard_stats()` — one round trip
- **Cost log:** table `llm_usage_events` — one row per real OpenAI call

It is `noindex` and unlinked from the public site. The only gate is the admin
token, so treat that token like a password.

## One-time setup

### 1. Set the admin token (required)

The `admin-data` function refuses to serve until `ADMIN_TOKEN` is set. Generate a
strong value and store it as a Supabase secret:

```bash
# A fresh token was generated for you during setup — rotate it any time:
supabase secrets set ADMIN_TOKEN='9nDYrAClieHNKDjkzrsXkZr-qfQRujvA98GymYqjEWo' \
  --project-ref hkgukldmktlobumabewr
```

Or set it in the dashboard: **Project → Edge Functions → Manage secrets → Add**
`ADMIN_TOKEN`. No redeploy needed; the function reads it per request.

### 2. (Optional) Tune the cost assumptions

Cost is computed from logged tokens × per-million-token prices. Defaults are
placeholders — set them to the real numbers for the deployed model:

```bash
supabase secrets set \
  OPENAI_INPUT_PRICE=0.25 \
  OPENAI_OUTPUT_PRICE=2.00 \
  OPENAI_SOFT_MONTHLY_BUDGET=50 \
  --project-ref hkgukldmktlobumabewr
```

| Secret | Meaning | Default |
| --- | --- | --- |
| `OPENAI_INPUT_PRICE` | USD per 1M input tokens | `0.25` |
| `OPENAI_OUTPUT_PRICE` | USD per 1M output tokens | `2.00` |
| `OPENAI_SOFT_MONTHLY_BUDGET` | USD line the spend meter tracks against | `50` |

### 3. (Recommended) Deploy exact token logging

`supabase/functions/submit-exercise/index.ts` has been updated to log each real
OpenAI call's token usage to `llm_usage_events`. **Until it is redeployed, the
cost panel shows an *estimate*** derived from the count of AI-generated roadmaps
(clearly labelled "estimated"). After redeploy, the panel switches to *measured*
cost automatically.

```bash
supabase functions deploy submit-exercise --project-ref hkgukldmktlobumabewr
```

(Or paste the file in the dashboard's function editor. The migration and the
`admin-data` function are already deployed.)

## Using it

1. Open `admin.html` on the deployed site.
2. Paste the admin token. It's kept in `sessionStorage` for the tab only — close
   the tab or hit **Lock** to clear it.
3. **Refresh** re-pulls; **Export CSV** downloads the currently filtered rows;
   **View** opens a submission's full answers and roadmap.

## What each panel means

- **KPIs** — totals, today/7-day, "decided yes" rate, average clarity, AI
  roadmaps, and LLM cost.
- **Submissions over 30 days** — daily volume.
- **LLM API cost** — spend this month / all-time, per-roadmap cost, token totals.
  Measured from `llm_usage_events`; estimated until `submit-exercise` is
  redeployed.
- **Scale & free-tier headroom** — usage vs the free Supabase/Vercel limits with
  a "months of headroom at the current rate" projection:
  - *Supabase database* — measured on-disk size vs 500 MB, plus bytes/submission.
  - *Supabase edge calls* — estimated from submissions vs 500k/mo (the real count
    is on the Supabase dashboard).
  - *OpenAI spend* — variable cost vs your soft budget; the usual first thing to
    grow.
  - *Vercel bandwidth* — rough estimate vs 100 GB/mo (use Vercel Analytics for the
    real figure).
  - **Upgrade signal** names the nearest binding constraint. Note: free Supabase
    projects pause after ~7 days of inactivity — keep it warm if traffic is
    sporadic.
- **Breakdowns** — by path, decision, readiness, top review flags, roadmap source.

> Free-tier limits in the UI are reference values for 2026-06. Confirm against the
> current Supabase and Vercel pricing pages before acting on a number.

## Security notes

- `admin-data` runs with `verify_jwt = false` and does its **own** token check —
  do not remove it. With no `ADMIN_TOKEN` set it returns `503` rather than
  exposing data.
- The `admin_dashboard_stats` RPC is `SECURITY DEFINER` but `EXECUTE` is granted
  only to `service_role`; it returns aggregates only, never raw PII.
- CORS allows the production origin and any `localhost` port (token-gated, so this
  is defense-in-depth).
- Rotate `ADMIN_TOKEN` by setting a new secret; old sessions stop working on their
  next request.
