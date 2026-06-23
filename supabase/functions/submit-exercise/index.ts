import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const productionOrigin = Deno.env.get('ALLOWED_ORIGIN') || 'https://100x-north-star-exercise.vercel.app';
const assessmentVersion = 'north-star-v1';

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
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
  const row = {
    exercise_id: exerciseId,
    name,
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
    elapsed_seconds: elapsedSeconds,
    started_at: validIsoDate(payload.startedAt),
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('north_star_submissions')
    .upsert(row, { onConflict: 'exercise_id,phone_e164' })
    .select('id')
    .single();

  if (error) {
    console.error('north star submission failed', error);
    return json({ error: 'Your exercise could not be saved. Please retry.' }, 500);
  }

  return json({ id: data.id, assessment, fitSignals });
});
