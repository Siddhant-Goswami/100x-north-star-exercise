"use server";

import { revalidatePath } from "next/cache";
import { RoadmapConfigSchema, type RoadmapConfig } from "@/lib/config-schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SaveResult = { ok: boolean; id?: string; error?: string };

function configToRoadmapRow(cfg: RoadmapConfig, ownerId: string) {
  return {
    slug: cfg.slug,
    owner_id: ownerId,
    title: cfg.title,
    description: cfg.description ?? null,
    status: cfg.status,
    provider: cfg.provider,
    model: cfg.model,
    system_prompt: cfg.systemPrompt,
    enable_web_search: cfg.enableWebSearch,
    max_output_tokens: cfg.maxOutputTokens,
    model_params: cfg.modelParams,
    intro: cfg.intro,
    modules: cfg.modules,
    output_schema: cfg.outputSchema,
    cta: cfg.cta,
    scoring: cfg.scoring,
    max_gen_per_ip_per_day: cfg.maxGenPerIpPerDay,
    published_at: cfg.status === "published" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

/** Create or update a roadmap + its questions. RLS enforces ownership. */
export async function saveRoadmap(raw: unknown): Promise<SaveResult> {
  const parsed = RoadmapConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid config.",
    };
  }
  const cfg = parsed.data;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const row = configToRoadmapRow(cfg, user.id);
  let roadmapId = cfg.id;

  if (roadmapId) {
    const updateRow: Record<string, unknown> = { ...row };
    delete updateRow.owner_id; // never reassign ownership on edit
    const { error } = await supabase
      .from("roadmaps")
      .update(updateRow)
      .eq("id", roadmapId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase
      .from("roadmaps")
      .insert(row)
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    roadmapId = data.id as string;
  }

  // Replace the question set.
  await supabase.from("roadmap_questions").delete().eq("roadmap_id", roadmapId);
  if (cfg.questions.length) {
    const questionRows = cfg.questions.map((q, i) => ({
      roadmap_id: roadmapId,
      question_key: q.questionKey,
      position: q.position ?? i,
      module: q.module ?? null,
      type: q.type,
      title: q.title,
      help: q.help ?? null,
      placeholder: q.placeholder ?? null,
      max_length: q.maxLength ?? null,
      options: q.options,
      allow_other: q.allowOther,
      required: q.required,
      config: q.config,
    }));
    const { error: qErr } = await supabase
      .from("roadmap_questions")
      .insert(questionRows);
    if (qErr) return { ok: false, error: qErr.message };
  }

  revalidatePath("/instructor");
  revalidatePath("/admin");
  return { ok: true, id: roadmapId };
}

export async function deleteRoadmap(id: string): Promise<SaveResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("roadmaps").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/instructor");
  revalidatePath("/admin");
  return { ok: true };
}

export async function setRoadmapStatus(
  id: string,
  status: RoadmapConfig["status"],
): Promise<SaveResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("roadmaps")
    .update({
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/instructor");
  revalidatePath("/admin");
  return { ok: true };
}
