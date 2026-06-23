import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Read-only admin data endpoint for the 100x dashboard. Gated by a shared admin
// token (Supabase secret ADMIN_TOKEN). It returns aggregates from the
// admin_dashboard_stats RPC plus a page of submissions, and the per-token price
// assumptions so the UI can render true LLM cost. verify_jwt is off (same as
// submit-exercise); the token check below is the only gate, so it MUST stay.

const productionOrigin = Deno.env.get('ALLOWED_ORIGIN') || 'https://100x-north-star-exercise.vercel.app';

// Origins allowed to call this from a browser. The admin page is served from the
// same Vercel domain in production; any localhost port is fine for running the
// panel locally. The endpoint is token-gated, so CORS is defense-in-depth only.
function isAllowedOrigin(origin: string) {
  if (origin === productionOrigin) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function corsHeadersFor(origin: string | null) {
  const allowOrigin = origin && isAllowedOrigin(origin) ? origin : productionOrigin;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin'
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(origin), 'Content-Type': 'application/json' }
  });
}

// Length-independent-ish constant-time compare so a wrong token can't be teased
// out by response timing. Both sides are short, so this is plenty.
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function presentedToken(request: Request) {
  const header = request.headers.get('x-admin-token');
  if (header) return header.trim();
  const auth = request.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(origin) });
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, origin);

  const adminToken = (Deno.env.get('ADMIN_TOKEN') || '').trim();
  if (!adminToken) {
    // Refuse to serve rather than expose data with no gate configured.
    return json({ error: 'Admin endpoint is not configured (ADMIN_TOKEN missing).' }, 503, origin);
  }
  if (!safeEqual(presentedToken(request), adminToken)) {
    return json({ error: 'Unauthorized.' }, 401, origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Service is not configured.' }, 503, origin);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const url = new URL(request.url);
  const exercise = url.searchParams.get('exercise');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 250, 1), 1000);

  // Per-million-token price assumptions. Overridable via env so finance can keep
  // them current without a redeploy; surfaced to the UI so cost is transparent.
  const pricing = {
    model: Deno.env.get('OPENAI_MODEL') || 'gpt-5.4-mini',
    inputPricePerMTok: Number(Deno.env.get('OPENAI_INPUT_PRICE') || 0.25),
    outputPricePerMTok: Number(Deno.env.get('OPENAI_OUTPUT_PRICE') || 2.0),
    // A soft monthly OpenAI budget the dashboard meters spend against. Not a hard
    // cap (the per-IP rate limit is), just the line where someone should look.
    softMonthlyBudget: Number(Deno.env.get('OPENAI_SOFT_MONTHLY_BUDGET') || 50),
    currency: 'USD'
  };

  // Aggregates (one round trip) and a page of submissions, in parallel.
  const statsPromise = supabase.rpc('admin_dashboard_stats', { p_exercise_id: exercise });
  let submissionsQuery = supabase
    .from('north_star_submissions')
    .select('id, exercise_id, name, email, phone_e164, whatsapp_consent, path, decision, readiness_state, north_star_statement, review_flags, assessment_stats, roadmap, answers, elapsed_seconds, started_at, submitted_at, updated_at')
    .order('submitted_at', { ascending: false })
    .limit(limit);
  if (exercise) submissionsQuery = submissionsQuery.eq('exercise_id', exercise);

  const [statsResult, submissionsResult] = await Promise.all([statsPromise, submissionsQuery]);

  if (statsResult.error) {
    console.error('admin stats rpc failed', statsResult.error);
    return json({ error: 'Could not load stats.' }, 500, origin);
  }
  if (submissionsResult.error) {
    console.error('admin submissions query failed', submissionsResult.error);
    return json({ error: 'Could not load submissions.' }, 500, origin);
  }

  return json({
    ok: true,
    pricing,
    stats: statsResult.data,
    submissions: submissionsResult.data || [],
    submissionsReturned: (submissionsResult.data || []).length,
    limit
  }, 200, origin);
});
