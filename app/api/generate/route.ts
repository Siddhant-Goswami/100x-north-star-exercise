import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runGeneration } from "@/lib/generation/engine";
import { GenerationError } from "@/lib/generation/providers";
import { sanitizeAnswers, validateAnswers } from "@/lib/generation/validate";
import { getRoadmapConfigBySlug } from "@/lib/roadmaps";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 90;

const PHONE_RE = /^\+[1-9]\d{9,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cleanText(value: unknown, max = 2000): string {
  return String(value ?? "").trim().slice(0, max);
}
function validPhone(value: unknown): string | null {
  const phone = cleanText(value, 20);
  return PHONE_RE.test(phone) ? phone : null;
}
function validEmail(value: unknown): string | null {
  const email = cleanText(value, 160).toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "";
}
function hashIp(ip: string): string | null {
  if (!ip) return null;
  // Require a deployment-specific salt. A shared default would make ip_hash
  // values deterministic across environments and trivially reversible.
  const salt = process.env.IP_HASH_SALT;
  if (!salt) throw new Error("IP_HASH_SALT is not configured.");
  return createHash("sha256").update(`${ip}:${salt}`).digest("hex");
}

export async function POST(req: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot + minimum-time anti-bot guards.
  if (cleanText(payload.website)) {
    return NextResponse.json({ error: "Submission rejected." }, { status: 400 });
  }
  const elapsed = Number(payload.elapsedSeconds);
  if (!Number.isFinite(elapsed) || elapsed < 15) {
    return NextResponse.json(
      { error: "Please take enough time to complete the exercise." },
      { status: 400 },
    );
  }

  const slug = cleanText(payload.slug, 120);
  const name = cleanText(payload.name, 100);
  const email = validEmail(payload.email);
  const phone = validPhone(payload.phone);
  const consent = payload.consent === true;
  if (!slug || name.length < 2 || !phone || !consent) {
    return NextResponse.json(
      { error: "Required fields are missing or invalid." },
      { status: 400 },
    );
  }

  const config = await getRoadmapConfigBySlug(slug, { publishedOnly: true });
  if (!config?.id) {
    return NextResponse.json(
      { error: "This roadmap is not available." },
      { status: 404 },
    );
  }

  const answers = sanitizeAnswers(
    (payload.answers as Record<string, unknown>) ?? {},
    config.questions,
  );
  const { ok, missing } = validateAnswers(answers, config.questions);
  if (!ok) {
    return NextResponse.json(
      { error: "Some required answers are missing.", missing },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const ipHash = hashIp(clientIp(req));

  // 1) Dedup: one roadmap per person (per roadmap + phone). Re-submissions
  //    just see the roadmap they already generated — one human, one LLM call.
  const { data: prior } = await supabase
    .from("submissions")
    .select("id, output, assessment")
    .eq("roadmap_id", config.id)
    .eq("phone_e164", phone)
    .not("output", "is", null)
    .limit(1)
    .maybeSingle();
  if (prior?.output) {
    return NextResponse.json({
      id: prior.id,
      output: prior.output,
      assessment: prior.assessment ?? null,
      reused: true,
    });
  }

  // 2) Per-IP daily rate limit.
  if (ipHash) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("output_generated_at", since);
    if (typeof count === "number" && count >= config.maxGenPerIpPerDay) {
      return NextResponse.json(
        {
          error:
            "You have reached today's limit for new roadmaps. Please try again tomorrow.",
        },
        { status: 429 },
      );
    }
  }

  // 3) Generate via the configured provider.
  let outcome;
  try {
    outcome = await runGeneration(config, { name, answers });
  } catch (err) {
    console.error("generation failed", err);
    try {
      await supabase.from("llm_usage_events").insert({
        roadmap_id: config.id,
        provider: config.provider,
        model: config.model,
        success: false,
        source: "production",
      });
    } catch {
      /* best effort */
    }
    const status = err instanceof GenerationError ? err.status ?? 502 : 500;
    return NextResponse.json(
      {
        error:
          "We could not generate your roadmap right now. Please try again in a moment.",
      },
      { status },
    );
  }

  // 4) Persist the submission.
  const nowIso = new Date().toISOString();
  const { data: row, error } = await supabase
    .from("submissions")
    .upsert(
      {
        roadmap_id: config.id,
        answers,
        output: outcome.output,
        assessment: outcome.assessment,
        name,
        email,
        phone_e164: phone,
        whatsapp_consent: consent,
        ip_hash: ipHash,
        elapsed_seconds: Math.round(elapsed),
        source: "production",
        output_generated_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "roadmap_id,phone_e164" },
    )
    .select("id")
    .single();
  if (error || !row) {
    console.error("submission save failed", error);
    return NextResponse.json(
      { error: "Could not save your submission. Please retry." },
      { status: 500 },
    );
  }

  // 5) Best-effort cost log.
  try {
    await supabase.from("llm_usage_events").insert({
      roadmap_id: config.id,
      submission_id: row.id,
      provider: config.provider,
      model: config.model,
      input_tokens: outcome.usage.inputTokens,
      output_tokens: outcome.usage.outputTokens,
      total_tokens: outcome.usage.totalTokens,
      success: true,
      source: "production",
    });
  } catch (logErr) {
    console.error("usage log failed", logErr);
  }

  return NextResponse.json({
    id: row.id,
    output: outcome.output,
    assessment: outcome.assessment,
  });
}
