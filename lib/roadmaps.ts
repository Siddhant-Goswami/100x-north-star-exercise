import "server-only";
import {
  CtaSchema,
  IntroSchema,
  type OutputSection,
  type PublicRoadmapConfig,
  type Question,
  type RoadmapConfig,
  ScoringSchema,
} from "@/lib/config-schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/* DB row shapes (snake_case). jsonb columns arrive already parsed. */
type QuestionRow = {
  question_key: string;
  position: number | null;
  module: string | null;
  type: Question["type"];
  title: string;
  help: string | null;
  placeholder: string | null;
  max_length: number | null;
  options: unknown;
  allow_other: boolean | null;
  required: boolean | null;
  config: unknown;
};

type RoadmapRow = {
  id: string;
  slug: string;
  owner_id: string | null;
  title: string;
  description: string | null;
  status: RoadmapConfig["status"];
  provider: RoadmapConfig["provider"];
  model: string;
  system_prompt: string | null;
  enable_web_search: boolean | null;
  max_output_tokens: number | null;
  model_params: unknown;
  intro: unknown;
  modules: unknown;
  output_schema: unknown;
  cta: unknown;
  scoring: unknown;
  max_gen_per_ip_per_day: number | null;
};

function questionRowToQuestion(q: QuestionRow): Question {
  return {
    questionKey: q.question_key,
    position: q.position ?? 0,
    module: q.module ?? undefined,
    type: q.type,
    title: q.title,
    help: q.help ?? undefined,
    placeholder: q.placeholder ?? undefined,
    maxLength: q.max_length ?? undefined,
    options: Array.isArray(q.options) ? (q.options as Question["options"]) : [],
    allowOther: !!q.allow_other,
    required: q.required ?? true,
    config: (q.config as Question["config"]) ?? {},
  };
}

export function rowToRoadmapConfig(
  row: RoadmapRow,
  questionRows: QuestionRow[],
): RoadmapConfig {
  const questions = [...questionRows]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(questionRowToQuestion);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status: row.status,
    provider: row.provider,
    model: row.model,
    systemPrompt: row.system_prompt ?? "",
    enableWebSearch: !!row.enable_web_search,
    maxOutputTokens: row.max_output_tokens ?? 2200,
    modelParams: (row.model_params as Record<string, unknown>) ?? {},
    intro: IntroSchema.parse(row.intro ?? {}),
    modules: Array.isArray(row.modules)
      ? (row.modules as RoadmapConfig["modules"])
      : [],
    questions,
    outputSchema: Array.isArray(row.output_schema)
      ? (row.output_schema as OutputSection[])
      : [],
    cta: CtaSchema.parse(row.cta ?? {}),
    scoring: ScoringSchema.parse(row.scoring ?? {}),
    maxGenPerIpPerDay: row.max_gen_per_ip_per_day ?? 5,
  };
}

/** Strip generation-only hints; the browser gets render data only. */
export function toPublicConfig(cfg: RoadmapConfig): PublicRoadmapConfig {
  return {
    slug: cfg.slug,
    title: cfg.title,
    description: cfg.description ?? null,
    intro: cfg.intro,
    modules: cfg.modules,
    questions: cfg.questions,
    outputSchema: cfg.outputSchema.map((s) => ({
      key: s.key,
      label: s.label,
      kind: s.kind,
      maxChars: s.maxChars,
      min: s.min,
      max: s.max,
      itemFields: s.itemFields,
      optional: s.optional,
      echoAnswer: s.echoAnswer,
    })),
    cta: cfg.cta,
  };
}

async function loadConfigFromRow(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: RoadmapRow | null,
): Promise<RoadmapConfig | null> {
  if (!row) return null;
  const { data: questionRows } = await supabase
    .from("roadmap_questions")
    .select("*")
    .eq("roadmap_id", row.id)
    .order("position");
  return rowToRoadmapConfig(row, (questionRows ?? []) as QuestionRow[]);
}

export async function getRoadmapConfigBySlug(
  slug: string,
  opts: { publishedOnly?: boolean } = {},
): Promise<RoadmapConfig | null> {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("roadmaps").select("*").eq("slug", slug).limit(1);
  if (opts.publishedOnly) query = query.eq("status", "published");
  const { data } = await query.maybeSingle();
  return loadConfigFromRow(supabase, data as RoadmapRow | null);
}

export async function getRoadmapConfigById(
  id: string,
): Promise<RoadmapConfig | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("roadmaps")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return loadConfigFromRow(supabase, data as RoadmapRow | null);
}

export type RoadmapListItem = {
  slug: string;
  title: string;
  description: string | null;
  eyebrow: string | null;
};

export async function listPublishedRoadmaps(): Promise<RoadmapListItem[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("roadmaps")
    .select("slug, title, description, intro, display_order")
    .eq("status", "published")
    .order("display_order", { ascending: true })
    .order("published_at", { ascending: false });
  return (data ?? []).map((r) => {
    const intro = (r.intro ?? {}) as { eyebrow?: string };
    return {
      slug: r.slug as string,
      title: r.title as string,
      description: (r.description as string | null) ?? null,
      eyebrow: intro.eyebrow ?? null,
    };
  });
}
