# 100x Roadmap Studio

A modular platform where **instructors design many roadmaps** (questions, system prompt,
model, CTA, output format, scoring rubric) — as data, not code — and **students** pick a
roadmap, answer it, and get a personalized, LLM-generated plan.

One Next.js app, two sections, sharing one config schema:

- **Participant** (`/`, `/r/[slug]`) — a generic renderer that draws *any* roadmap from its
  config and generates a result via `/api/generate`.
- **Admin** (`/login`, `/instructor`, `/admin`) — instructors build/test/publish their own
  roadmaps; super-admins see every instructor, roadmap, submission, and cost.

There is **no per-roadmap code**. Building a roadmap writes a JSON config row; the same
renderer and generation engine handle all of them (headless-CMS model).

## Stack

- Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui
- Supabase: Postgres + Auth + RLS
- LLM providers: **OpenAI** (default), **Groq**, **OpenRouter** (one OpenAI-compatible
  client) + **Anthropic**. Web search on OpenAI (Responses API) and Anthropic.

## Architecture

| Concern | Where |
| --- | --- |
| Shared config schema (zod + types) | `lib/config-schema.ts` |
| DB ↔ config mappers, fetch helpers | `lib/roadmaps.ts` |
| Generation engine (validate/score/generate/coerce) | `lib/generation/*` |
| Participant UI | `app/page.tsx`, `app/r/[slug]`, `components/participant/*` |
| Production generation | `app/api/generate/route.ts` |
| Instructor builder + actions | `app/instructor/*`, `components/admin/*` |
| Instructor test runs (no persist) | `app/api/test-generate/route.ts` |
| Super-admin oversight | `app/admin/*`, `lib/admin-stats.ts` |
| Auth gate | `proxy.ts`, `lib/auth.ts` |
| Supabase clients (browser/server/service-role) | `lib/supabase/*` |

**Security:** `roadmaps`/`submissions` have **no anon RLS policies** — the public site reads
config through the server (service role) which strips `system_prompt`/`model`/`scoring`
before sending to the browser. Submissions are service-role-only; the admin app reads them
server-side with ownership filtering. Instructors (RLS) can only touch their own roadmaps;
super-admins see all.

## Setup

1. `npm install`
2. Copy `.env.example` → `.env.local` and fill:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (Dashboard → Project Settings → API)
   - One or more provider keys: `OPENAI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`
   - `IP_HASH_SALT`
3. Apply the Supabase migrations (in `supabase/migrations/` if exported, or already applied
   to the linked project).
4. `npm run dev`

The DB schema, RLS, the `handle_new_user` trigger, `model_pricing`, and two example
roadmaps (`north-star-cohort-8`, `data-career-30day`) are provisioned via migrations.

## Roles

- New sign-ups are **instructors** by default (via the `handle_new_user` trigger).
- Promote a super-admin:
  `update public.profiles set role='super_admin' where email='you@example.com';`

## How an instructor builds a roadmap

`/instructor` → **New roadmap** → fill the tabs:

- **Basics** — title, slug (`/r/<slug>`), status.
- **Questions** — add/reorder typed questions (text / long / single / multi), options, etc.
- **Output** — define the result fields (string / string-array / segments / list). The model
  is told to return exactly this shape.
- **Generation** — system prompt, provider + model, web search, max tokens.
- **Scoring** — optional rubric (paste JSON) → drives the assessment stored per submission.
- **Intro & CTA** — landing and contact/result copy.
- **Test** — run sample inputs (no submission saved; cost logged as `source='test'`).

Set status to **published** and it appears on the public picker at `/`.

## Notes

- `/api/generate` and `/api/test-generate` set `maxDuration = 90`. On Vercel, long
  web-search generations may need the Pro plan.
- Per-model pricing lives in `public.model_pricing` for mixed-provider cost accounting.

## Deploying to Vercel

This is now a **Next.js app**, not the old static site. On the Vercel project:

1. **Framework Preset:** set to **Next.js** (Settings → General). The old project was a static
   site with no build command — clear any Build Command / Output Directory overrides so Vercel
   runs `next build`.
2. **Environment variables** (Settings → Environment Variables), for Production & Preview:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (secret)
   - `OPENAI_API_KEY` (and/or `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`)
   - `IP_HASH_SALT`
3. **Node**: `package.json` pins `engines.node >= 20.18.1` (Vercel will use Node 22).
4. **Function duration**: `/api/generate` and `/api/test-generate` set `maxDuration = 90`.
   Hobby caps at 60s — fine for current generations (~6–16s). Use **Pro** only if web-search
   generations start exceeding 60s.
5. **Supabase Auth**: add the deployed origin to Supabase → Authentication → URL Configuration
   (Site URL + redirect URLs) so login works in production.

