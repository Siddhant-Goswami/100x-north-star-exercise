import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const productionOrigin = Deno.env.get('ALLOWED_ORIGIN') || 'https://100x-north-star-exercise.vercel.app';
const assessmentVersion = 'north-star-v1';

// Roadmap generation (OpenAI). The key lives only as a Supabase secret; the
// model and limits are overridable via env so they can be tuned without a deploy.
// Read the key per-request (not at module load) so a freshly-set secret is
// picked up by every isolate, including ones that booted before it existed.
// Strip ALL whitespace: a pasted key often gets line-wrapped, and a stray
// newline makes an invalid HTTP header value (fetch throws). Keys never
// contain whitespace, so this is safe and saves a re-paste.
const getOpenAiKey = () => (Deno.env.get('OPENAI_API_KEY') || '').replace(/\s+/g, '');
const openAiModel = Deno.env.get('OPENAI_MODEL') || 'gpt-5.4-mini';
const maxRoadmapsPerIpPerDay = Number(Deno.env.get('MAX_ROADMAPS_PER_IP') || 5);
const ipHashSalt = Deno.env.get('IP_HASH_SALT') || 'north-star-cohort-8';

const corsHeaders = {
  'Access-Control-Allow-Origin': productionOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const requiredAnswerIds = [
  'role_experience', 'journey', 'code_history', 'building_now',
  'weekly_hours', 'worst_week_hours', 'worst_week_cause',
  'itch', 'path', 'north_star',
  'stall_point', 'stuck_on', 'decision'
];

const timeMarkers = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
];

const weeklyHours: Record<string, { value: number; label: string }> = {
  under2: { value: 1, label: 'under 2 hours a week' },
  '2-4': { value: 3, label: '2–4 hours a week' },
  '5-7': { value: 6, label: '5–7 hours a week' },
  '8-12': { value: 10, label: '8–12 hours a week' },
  '12plus': { value: 14, label: 'more than 12 hours a week' }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function cleanText(value: unknown, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function validPhone(value: unknown) {
  const phone = cleanText(value, 20);
  return /^\+[1-9]\d{9,14}$/.test(phone) ? phone : null;
}

function validEmail(value: unknown) {
  const email = cleanText(value, 160).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

function validIsoDate(value: unknown) {
  const candidate = cleanText(value, 40);
  if (!candidate) return null;
  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function hasRequiredAnswers(answers: Record<string, unknown>) {
  return requiredAnswerIds.every((id) => cleanText(answers[id]).length > 0);
}

function detailScore(value: unknown, thresholds: [number, number, number]) {
  const length = cleanText(value).length;
  if (length >= thresholds[2]) return 5;
  if (length >= thresholds[1]) return 4;
  if (length >= thresholds[0]) return 3;
  return length ? 2 : 1;
}

function hasTimeAndScale(value: unknown) {
  const normalized = cleanText(value).toLowerCase();
  const hasTime = /\b20\d\d\b/.test(normalized) || timeMarkers.some((month) => normalized.includes(month));
  const hasScale = /\d/.test(normalized);
  return hasTime && hasScale;
}

function scoreAssessment(answers: Record<string, unknown>) {
  const northStarBase = detailScore(answers.north_star, [40, 80, 140]);
  const northStarClarity = hasTimeAndScale(answers.north_star)
    ? Math.min(5, Math.max(4, northStarBase))
    : northStarBase;

  const timeRealism = answers.worst_week_hours === '5plus' ? 5
    : answers.worst_week_hours === '3-5' ? 4
    : answers.worst_week_hours === '1-2' ? 3
    : 1;

  let commitmentSignal = answers.decision === 'yes' ? 5 : answers.decision === 'refine' ? 3 : 2;
  if (answers.weekly_hours === 'under2') commitmentSignal = Math.min(commitmentSignal, 2);

  const stats = {
    northStarClarity,
    outcomeClarity: detailScore(answers.north_star, [60, 120, 200]),
    motivationDepth: detailScore(answers.itch, [40, 80, 150]),
    gapHonesty: detailScore(answers.stall_point, [50, 110, 200]),
    startingClarity: detailScore(answers.journey, [50, 110, 200]),
    timeRealism,
    commitmentSignal
  };

  const flags: string[] = [];
  if (answers.weekly_hours === 'under2') flags.push('low-weekly-hours');
  if (answers.worst_week_hours === 'none') flags.push('no-worst-week-buffer');
  if (answers.weekly_hours === 'under2' && answers.worst_week_hours === 'none') flags.push('no-consistent-hours');
  if (stats.northStarClarity <= 2) flags.push('north-star-vague');
  const stuckList = Array.isArray(answers.stuck_on) ? answers.stuck_on : (answers.stuck_on ? [answers.stuck_on] : []);
  if (stuckList.includes('time')) flags.push('stuck-on-time');
  if (answers.decision === 'unsure') flags.push('still-deciding');
  if (answers.decision === 'refine') flags.push('wants-to-refine');

  const values = Object.values(stats);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  let readinessState = 'Clarity in progress';
  if (average >= 4) readinessState = 'Ready for a fit conversation';
  else if (average >= 3) readinessState = 'Clear North Star forming';

  return { stats, readinessState, flags };
}

function rankFitSignals(answers: Record<string, unknown>) {
  const track = answers.path === 'build'
    ? {
        id: 'track', label: 'Builder track',
        description: 'Built around shipping and running your own thing — a product, tool, service, or first paying client.'
      }
    : {
        id: 'track', label: 'Career track',
        description: 'Built around getting hired, promoted, or raised, with AI as the lever that gets you there.'
      };

  const hours = weeklyHours[String(answers.weekly_hours)] || weeklyHours['2-4'];
  const rhythm = {
    id: 'rhythm', label: 'A weekly rhythm that fits',
    description: `Your goals are sized to the ${hours.label} you reported, so finishing is the normal case and not a heroic one.`
  };

  const guardrails: Record<string, string> = {
    time: 'Your weekly goals are sized to the hours you actually have, so consistency beats intensity here.',
    confidence: 'You build from the first module with a mentor, so you confirm you are technical enough by doing, not by guessing today.',
    clarity: 'A mentor checks the thread when you lose it — the exact failure mode most people name when they try this alone.',
    momentum: 'You ship something rough early and improve it, so results stay visible instead of feeling slow or invisible.',
    accountability: 'A mentor checks in on you, the kind of support most people miss when they go it alone.',
    else: 'A mentor checks the thread when you lose it, the exact failure mode most people name when they have tried this alone.'
  };
  const stuckList = Array.isArray(answers.stuck_on) ? answers.stuck_on : (answers.stuck_on ? [answers.stuck_on] : []);
  const keys = stuckList.length ? stuckList : ['else'];
  const points: string[] = [];
  keys.forEach((key) => {
    const description = guardrails[String(key)] || guardrails.else;
    if (!points.includes(description)) points.push(description);
  });
  const guardrail = {
    id: 'guardrail',
    label: points.length > 1 ? 'Guardrails for where you stall' : 'A guardrail for where you stall',
    description: points[0],
    points
  };

  return [track, rhythm, guardrail];
}

type Roadmap = {
  generatedBy: string;
  headline: string;
  statement: string;
  reality: string;
  insight?: string;
  milestones: Array<{ window: string; title: string; detail: string }>;
  whatItTakes: string;
  why100x: Array<{ title: string; detail: string }>;
};

// Deterministic fallback, mirrors engine.buildRoadmap on the client so the
// experience is whole whenever the LLM is unavailable, rate-limited, or fails.
function buildRoadmap(answers: Record<string, unknown>, name: string): Roadmap {
  const first = cleanText(name, 100).split(/\s+/)[0];
  const statement = cleanText(answers.north_star, 500);
  const isBuild = answers.path === 'build';
  const hours = weeklyHours[String(answers.weekly_hours)] || weeklyHours['2-4'];
  const stuckList = Array.isArray(answers.stuck_on)
    ? answers.stuck_on.map(String)
    : (answers.stuck_on ? [String(answers.stuck_on)] : []);

  const headline = first
    ? `${first}, here is the shortest honest path to your North Star.`
    : 'Here is the shortest honest path to your North Star.';

  const reality = isBuild
    ? 'You do not need a bigger idea — you need one small thing shipped in front of one real user, then improved every week. The gap is not talent or tools; it is reps. This plan turns six months into a stack of small, finished reps instead of one heroic project you never launch.'
    : 'You do not need another certificate — you need proof. A few real things you built with AI, explained well, move you further than any course logo on a profile. This plan is built to produce that proof, one shipped piece at a time, sized to the time you actually have.';

  const milestones = isBuild
    ? [
        { window: 'Weeks 1–4', title: 'Ship the smallest real version', detail: `Pick the narrowest slice of your idea and get a working version in front of one real person. Sized to ${hours.label}, so finishing is normal, not heroic.` },
        { window: 'Weeks 5–10', title: 'Put it in front of users and listen', detail: 'Get five to ten people using it. Their friction — not your roadmap — tells you what to build next. You learn to read signal instead of guessing.' },
        { window: 'Weeks 11–18', title: 'Earn the first signal of demand', detail: 'Turn use into a waitlist, a first payment, or a committed pilot. The goal is one undeniable proof that someone wants this enough to act.' },
        { window: 'Weeks 19–26', title: 'Make it repeatable', detail: 'Tighten the loop from idea to shipped feature so you can keep moving after the program ends — running your thing, not just having built it once.' }
      ]
    : [
        { window: 'Weeks 1–4', title: 'Build your first AI proof piece', detail: `Ship one small, real project that uses AI to solve an actual problem at work or in your field. Sized to ${hours.label}, so it gets finished.` },
        { window: 'Weeks 5–10', title: 'Make it visible and useful', detail: 'Put your work where the right people see it — a demo for your team, a post, a portfolio piece — so the value is obvious without you explaining it twice.' },
        { window: 'Weeks 11–18', title: 'Stack two or three undeniable wins', detail: 'Repeat the loop until you have a small body of work that proves you can apply AI, not just talk about it. This is what changes the conversation about a job, raise, or role.' },
        { window: 'Weeks 19–26', title: 'Turn proof into the ask', detail: 'Use the evidence you built to make the move — the pitch, the internal project, the interview — backed by things you actually shipped.' }
      ];

  const whatItTakes = `Honestly? About ${hours.label}, protected and consistent. Not bursts of motivation — a rhythm that survives your worst weeks. Six months of small finished reps beats two months of heroics followed by a stall. If you can guard those hours, this is very doable.`;

  const whyMap: Record<string, { title: string; detail: string }> = {
    time: { title: 'Sized to your real hours', detail: `Your weekly goals are built around the ${hours.label} you reported, so consistency beats intensity and finishing stays the normal case.` },
    confidence: { title: 'You build from day one, with a mentor', detail: 'You prove you are technical enough by doing — not by guessing today. A mentor is there for the hard parts so you do not stall on them alone.' },
    clarity: { title: 'A mentor keeps the thread', detail: 'The moment you lose the plot — the exact failure mode you named — someone is there to point you back at the next concrete step.' },
    momentum: { title: 'Visible wins, early and often', detail: 'You ship something rough early and improve it, so progress stays visible instead of feeling slow or invisible.' },
    accountability: { title: 'Someone is actually checking in', detail: 'The weekly check-in is the support most people miss when they try this alone — and the reason they finish here.' }
  };
  const seen = new Set<string>();
  const why100x = [isBuild
    ? { title: 'Built around shipping your own thing', detail: 'The whole program is structured to get you running a product, tool, or first paying client — exactly the outcome you chose.' }
    : { title: 'Built around real, hireable proof', detail: 'The program is structured to produce work that gets you hired, promoted, or raised — with AI as the lever, exactly the outcome you chose.' }];
  seen.add(why100x[0].title);
  (stuckList.length ? stuckList : ['time']).forEach((key) => {
    const item = whyMap[key];
    if (item && !seen.has(item.title)) { seen.add(item.title); why100x.push(item); }
  });
  while (why100x.length < 3) {
    const fill = whyMap.accountability;
    if (seen.has(fill.title)) break;
    seen.add(fill.title); why100x.push(fill);
  }

  return {
    generatedBy: 'fallback',
    headline,
    statement,
    reality,
    milestones,
    whatItTakes,
    why100x: why100x.slice(0, 3)
  };
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function clientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || request.headers.get('cf-connecting-ip') || '';
}

const ROADMAP_SYSTEM_PROMPT = [
  'You are a senior mentor at 100x Engineers, a hands-on 6-month Applied AI program.',
  'A prospective student just finished a clarity exercise. Using their answers — and a quick web search to ground what their specific goal really takes in today\'s market — write a hyper-personalized roadmap to their North Star.',
  'Rules:',
  '- Speak directly to them, warm but honest. Never hype, never generic. Reference their actual words.',
  '- Do NOT mention scores, ratings, or readiness levels.',
  '- Milestones must be simple, concrete, and sized to the weekly hours they reported.',
  '- "why100x" must tie 100x specifically to what they said they get stuck on and the path they chose.',
  '- Use web search to find one grounded, specific insight about their target role/goal/market (e.g. what the role actually requires now, realistic timelines, demand). Put it in "insight" in one or two sentences. If you cannot find anything solid, set insight to an empty string.',
  '- Write every field as plain prose. Do NOT include citations, URLs, markdown, brackets, or source links in any field.',
  'Return ONLY a JSON object, no prose, in exactly this shape:',
  '{"headline": string, "statement": string (echo their North Star), "reality": string (an honest read of where they are vs the goal and what it really takes), "insight": string, "milestones": [{"window": string e.g. "Weeks 1–4", "title": string, "detail": string}] (exactly 4, spanning ~6 months), "whatItTakes": string, "why100x": [{"title": string, "detail": string}] (exactly 3)}'
].join('\n');

function extractOutputText(data: Record<string, unknown>): string {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  const chunks: string[] = [];
  for (const item of output as Array<Record<string, unknown>>) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content as Array<Record<string, unknown>>) {
      if ((part.type === 'output_text' || part.type === 'text') && typeof part.text === 'string') {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join('\n');
}

// Web-search responses tend to append markdown link citations like
// "([ycombinator.com](https://…))". The result page renders plain text, so
// strip link markup and bare URLs back down to readable prose.
function cleanProse(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\(\s*https?:\/\/[^)]*\)/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+([.,;:])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function coerceRoadmap(raw: unknown, answers: Record<string, unknown>, name: string): Roadmap | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const fb = buildRoadmap(answers, name);
  const str = (value: unknown, alt: string) =>
    (typeof value === 'string' && value.trim() ? cleanProse(value).slice(0, 1400) : alt);

  const milestones = (Array.isArray(obj.milestones) ? obj.milestones : [])
    .filter((m) => m && typeof m === 'object')
    .slice(0, 6)
    .map((m) => {
      const item = m as Record<string, unknown>;
      return { window: str(item.window, ''), title: str(item.title, ''), detail: str(item.detail, '') };
    })
    .filter((m) => m.title || m.detail);

  const why100x = (Array.isArray(obj.why100x) ? obj.why100x : [])
    .filter((w) => w && typeof w === 'object')
    .slice(0, 4)
    .map((w) => {
      const item = w as Record<string, unknown>;
      return { title: str(item.title, ''), detail: str(item.detail, '') };
    })
    .filter((w) => w.title || w.detail);

  return {
    generatedBy: 'openai',
    headline: str(obj.headline, fb.headline),
    statement: str(obj.statement, fb.statement),
    reality: str(obj.reality, fb.reality),
    insight: str(obj.insight, ''),
    milestones: milestones.length >= 3 ? milestones : fb.milestones,
    whatItTakes: str(obj.whatItTakes, fb.whatItTakes),
    why100x: why100x.length >= 2 ? why100x.slice(0, 3) : fb.why100x
  };
}

async function generateRoadmapWithOpenAI(answers: Record<string, unknown>, name: string): Promise<Roadmap | null> {
  const openAiKey = getOpenAiKey();
  if (!openAiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const body = {
      model: openAiModel,
      reasoning: { effort: 'low' },
      tools: [{ type: 'web_search' }],
      input: [
        { role: 'system', content: ROADMAP_SYSTEM_PROMPT },
        { role: 'user', content: `The completed clarity exercise (JSON):\n\n${JSON.stringify({ name, answers })}\n\nReturn ONLY the roadmap JSON described in your instructions.` }
      ],
      max_output_tokens: 2200
    };
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) {
      console.error('openai roadmap request failed', response.status, await response.text().catch(() => ''));
      return null;
    }
    const data = await response.json();
    const text = extractOutputText(data);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
    return coerceRoadmap(parsed, answers, name);
  } catch (error) {
    console.error('openai roadmap call errored', error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  // Safe health check: reports only whether config is wired, never any secret value.
  // ?check=openai also pings OpenAI auth and returns the HTTP status (no secret).
  if (request.method === 'GET') {
    const key = getOpenAiKey();
    const url = new URL(request.url);
    let openAiCheck: unknown = 'skipped';
    if (url.searchParams.get('check') === 'openai' && key) {
      try {
        const ping = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` }
        });
        const redact = (s: string) => s.replace(/sk-[A-Za-z0-9_\-]+/g, 'sk-***');
        const bodyText = ping.ok ? '' : redact((await ping.text().catch(() => '')).slice(0, 300));
        openAiCheck = { status: ping.status, ok: ping.ok, error: bodyText };
      } catch (error) {
        openAiCheck = { status: 0, ok: false, error: String(error).replace(/sk-[A-Za-z0-9_\-]+/g, 'sk-***').slice(0, 200) };
      }
    }
    return json({ ok: true, hasOpenAiKey: Boolean(key), keyLength: key.length, model: openAiModel, maxRoadmapsPerIp: maxRoadmapsPerIpPerDay, openAiCheck });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const requestOrigin = request.headers.get('origin');
  if (productionOrigin !== '*' && requestOrigin && requestOrigin !== productionOrigin) {
    return json({ error: 'Origin not allowed.' }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 80_000) return json({ error: 'Submission is too large.' }, 413);
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  if (cleanText(payload.website)) return json({ error: 'Submission rejected.' }, 400);
  const elapsedSeconds = Number(payload.elapsedSeconds);
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 20) {
    return json({ error: 'Please take enough time to complete the exercise.' }, 400);
  }

  const exerciseId = cleanText(payload.exerciseId, 120);
  const name = cleanText(payload.name, 100);
  const email = validEmail(payload.email);
  const phone = validPhone(payload.phone);
  const consent = payload.consent === true;
  const answers = payload.answers && typeof payload.answers === 'object'
    ? payload.answers as Record<string, unknown>
    : {};

  if (!exerciseId || name.length < 2 || !phone || !consent || !hasRequiredAnswers(answers)) {
    return json({ error: 'Required fields are missing or invalid.' }, 400);
  }

  const assessment = scoreAssessment(answers);
  const fitSignals = rankFitSignals(answers);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Submission service is not configured.' }, 503);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const ip = clientIp(request);
  const ipHash = ip ? await sha256Hex(`${ip}:${ipHashSalt}`) : null;

  // 1) Reuse a roadmap this person already generated (same phone or email):
  //    one human, one LLM call. Re-submissions just see their existing plan.
  let roadmap: Roadmap | null = null;
  try {
    const { data: priorByPhone } = await supabase
      .from('north_star_submissions')
      .select('roadmap')
      .eq('exercise_id', exerciseId)
      .eq('phone_e164', phone)
      .not('roadmap', 'is', null)
      .limit(1)
      .maybeSingle();
    if (priorByPhone?.roadmap) roadmap = priorByPhone.roadmap as Roadmap;
    if (!roadmap && email) {
      const { data: priorByEmail } = await supabase
        .from('north_star_submissions')
        .select('roadmap')
        .eq('exercise_id', exerciseId)
        .eq('email', email)
        .not('roadmap', 'is', null)
        .limit(1)
        .maybeSingle();
      if (priorByEmail?.roadmap) roadmap = priorByEmail.roadmap as Roadmap;
    }
  } catch (error) {
    console.error('roadmap dedup lookup failed', error);
  }

  // 2) Per-IP rate limit: cap how many fresh generations one IP can trigger
  //    per day. Over the cap we still return a (deterministic) roadmap.
  let rateLimited = false;
  if (!roadmap && ipHash) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    try {
      const { count } = await supabase
        .from('north_star_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash)
        .gte('roadmap_generated_at', since);
      if (typeof count === 'number' && count >= maxRoadmapsPerIpPerDay) rateLimited = true;
    } catch (error) {
      console.error('rate limit check failed', error);
    }
  }

  // 3) Generate. LLM when allowed and configured, deterministic otherwise.
  let freshlyGenerated = false;
  if (!roadmap) {
    if (!rateLimited && getOpenAiKey()) {
      roadmap = await generateRoadmapWithOpenAI(answers, name);
    }
    if (!roadmap) roadmap = buildRoadmap(answers, name);
    freshlyGenerated = true;
  }

  const nowIso = new Date().toISOString();
  const row: Record<string, unknown> = {
    exercise_id: exerciseId,
    name,
    email,
    phone_e164: phone,
    whatsapp_consent: consent,
    answers,
    path: cleanText(answers.path, 20) || null,
    decision: cleanText(answers.decision, 20) || null,
    north_star_statement: cleanText(answers.north_star, 500) || null,
    readiness_state: assessment.readinessState,
    assessment_version: assessmentVersion,
    assessment_stats: assessment.stats,
    fit_signals: fitSignals,
    review_flags: assessment.flags,
    roadmap,
    ip_hash: ipHash,
    elapsed_seconds: elapsedSeconds,
    started_at: validIsoDate(payload.startedAt),
    submitted_at: nowIso,
    updated_at: nowIso
  };
  // Only stamp generation time when we actually produced a new roadmap, so the
  // per-IP rate-limit window measures real generations, not cached re-reads.
  if (freshlyGenerated) row.roadmap_generated_at = nowIso;

  const { data, error } = await supabase
    .from('north_star_submissions')
    .upsert(row, { onConflict: 'exercise_id,phone_e164' })
    .select('id')
    .single();

  if (error) {
    console.error('north star submission failed', error);
    return json({ error: 'Your exercise could not be saved. Please retry.' }, 500);
  }

  return json({ id: data.id, assessment, fitSignals, roadmap });
});
