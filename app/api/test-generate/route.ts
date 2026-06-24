import { NextResponse, type NextRequest } from "next/server";
import { runGeneration } from "@/lib/generation/engine";
import { GenerationError } from "@/lib/generation/providers";
import { sanitizeAnswers } from "@/lib/generation/validate";
import { rowToRoadmapConfig } from "@/lib/roadmaps";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const roadmapId = String(body.roadmapId || "");
  const name = String(body.name || "Test Student").slice(0, 100);
  if (!roadmapId) {
    return NextResponse.json({ error: "Missing roadmapId." }, { status: 400 });
  }

  // RLS ensures the caller can only test their own roadmap (or any, if super_admin).
  const { data: row } = await supabase
    .from("roadmaps")
    .select("*")
    .eq("id", roadmapId)
    .maybeSingle();
  if (!row) {
    return NextResponse.json(
      { error: "Roadmap not found or not yours." },
      { status: 404 },
    );
  }
  const { data: questionRows } = await supabase
    .from("roadmap_questions")
    .select("*")
    .eq("roadmap_id", roadmapId)
    .order("position");

  const config = rowToRoadmapConfig(row, questionRows ?? []);
  const answers = sanitizeAnswers(
    (body.answers as Record<string, unknown>) ?? {},
    config.questions,
  );

  let outcome;
  try {
    outcome = await runGeneration(config, { name, answers });
  } catch (err) {
    const status = err instanceof GenerationError ? err.status ?? 502 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed." },
      { status },
    );
  }

  // Log test spend so super-admin cost views can separate test vs production.
  try {
    const admin = createSupabaseAdminClient();
    await admin.from("llm_usage_events").insert({
      roadmap_id: config.id,
      provider: config.provider,
      model: config.model,
      input_tokens: outcome.usage.inputTokens,
      output_tokens: outcome.usage.outputTokens,
      total_tokens: outcome.usage.totalTokens,
      success: true,
      source: "test",
    });
  } catch {
    /* best effort */
  }

  return NextResponse.json({
    output: outcome.output,
    assessment: outcome.assessment,
    usage: outcome.usage,
  });
}
