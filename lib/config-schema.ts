import { z } from "zod";

/**
 * The single source of truth for a roadmap's configuration.
 *
 * Instructors author this shape (as data, never code) in the admin builder; the
 * participant runtime renders any roadmap generically from it; the generation
 * engine drives the LLM and validates its output against it. Keep camelCase here
 * — DB rows are snake_case and mapped at the edge (see lib/roadmaps.ts).
 */

/* ----------------------------- Questions ----------------------------- */

export const QUESTION_TYPES = ["text", "long", "single", "multi", "intro"] as const;
export const QuestionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** An answer option: [value, label]. */
export const OptionSchema = z.tuple([z.string(), z.string()]);
export type Option = z.infer<typeof OptionSchema>;

export const QuestionSchema = z.object({
  questionKey: z.string().min(1),
  position: z.number().int().nonnegative().default(0),
  module: z.string().optional(),
  type: QuestionTypeSchema,
  title: z.string().min(1),
  help: z.string().optional(),
  placeholder: z.string().optional(),
  maxLength: z.number().int().positive().optional(),
  options: z.array(OptionSchema).default([]),
  allowOther: z.boolean().default(false),
  required: z.boolean().default(true),
  /** Bespoke render/scoring metadata (e.g. North Star template + examples). */
  config: z.record(z.string(), z.any()).default({}),
});
export type Question = z.infer<typeof QuestionSchema>;

/* --------------------------- Output schema --------------------------- */

export const OUTPUT_KINDS = ["string", "string-array", "segments", "list"] as const;
export const OutputKindSchema = z.enum(OUTPUT_KINDS);
export type OutputKind = (typeof OUTPUT_KINDS)[number];

export const OutputItemFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
});

export const OutputSectionSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  kind: OutputKindSchema,
  /** Guidance handed to the model about what to put in this field. */
  instruction: z.string().optional(),
  /** Clamp for string fields. */
  maxChars: z.number().int().positive().optional(),
  /** Min/max items for string-array and list kinds. */
  min: z.number().int().nonnegative().optional(),
  max: z.number().int().nonnegative().optional(),
  /** Per-item fields for the "list" kind (e.g. milestones: window/title/detail). */
  itemFields: z.array(OutputItemFieldSchema).optional(),
  /** When set, the model may omit this; defaults to "". */
  optional: z.boolean().default(false),
  /** For an echo field (e.g. statement): default to this question's answer. */
  echoAnswer: z.string().optional(),
});
export type OutputSection = z.infer<typeof OutputSectionSchema>;

/* ----------------------------- Scoring ------------------------------ */
/**
 * Optional, instructor-authored rubric (v1: pasted). Drives the assessment
 * stored on each submission for analytics. An empty rubric is valid — scoring
 * simply produces an empty assessment.
 */

export const DimensionSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  type: z.enum(["detail", "map"]),
  question: z.string().min(1),
  /** detail: character-count thresholds [low, mid, high] → 3/4/5. */
  thresholds: z.array(z.number()).length(3).optional(),
  /** detail: bump to >=4 when the answer carries both a time and a number. */
  boostIfTimeAndScale: z.boolean().optional(),
  /** map: answer value → score. */
  map: z.record(z.string(), z.number()).optional(),
  default: z.number().optional(),
  /** map: cap the score when another answer hits a value (e.g. very low hours). */
  capIf: z
    .object({ question: z.string(), equals: z.string(), cap: z.number() })
    .optional(),
});
export type Dimension = z.infer<typeof DimensionSchema>;

export const ReadinessBandSchema = z.object({ min: z.number(), label: z.string() });

export const FlagRuleSchema = z.object({
  id: z.string().min(1),
  when: z.object({
    question: z.string().optional(),
    equals: z.string().optional(),
    includes: z.string().optional(),
    dimensionAtMost: z.object({ key: z.string(), value: z.number() }).optional(),
  }),
});

export const ScoringSchema = z
  .object({
    dimensions: z.array(DimensionSchema).default([]),
    readinessBands: z.array(ReadinessBandSchema).default([]),
    flags: z.array(FlagRuleSchema).default([]),
  })
  .default({ dimensions: [], readinessBands: [], flags: [] });
export type ScoringConfig = z.infer<typeof ScoringSchema>;

/* ------------------------- Intro / modules / CTA ------------------------- */

export const PromiseSchema = z.object({ title: z.string(), body: z.string() });

export const IntroSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    body: z.string().optional(),
    promises: z.array(PromiseSchema).default([]),
    proof: z.string().optional(),
    testimonial: z
      .object({ result: z.string(), name: z.string(), detail: z.string() })
      .partial()
      .optional(),
  })
  .default({ promises: [] });
export type Intro = z.infer<typeof IntroSchema>;

export const ModuleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  number: z.string().optional(),
});
export type Module = z.infer<typeof ModuleSchema>;

export const CtaSchema = z
  .object({
    contact: z
      .object({
        headline: z.string().optional(),
        subtitle: z.string().optional(),
        consentLabel: z.string().optional(),
        privacyNote: z.string().optional(),
        submitLabel: z.string().optional(),
      })
      .default({}),
    result: z
      .object({
        nextStepTitle: z.string().optional(),
        nextStepBody: z.string().optional(),
        buttonLabel: z.string().optional(),
        buttonUrl: z.string().optional(),
      })
      .default({}),
  })
  .default({ contact: {}, result: {} });
export type Cta = z.infer<typeof CtaSchema>;

/* ----------------------------- Provider ----------------------------- */

// Groq is the default provider for now — list it first so it's the suggested
// pick in the builder. The others stay available for instructors who need them.
export const PROVIDERS = ["groq", "openai", "openrouter", "anthropic"] as const;
export const ProviderSchema = z.enum(PROVIDERS);
export type Provider = (typeof PROVIDERS)[number];

export const ROADMAP_STATUSES = ["draft", "published", "archived"] as const;
export const RoadmapStatusSchema = z.enum(ROADMAP_STATUSES);
export type RoadmapStatus = (typeof ROADMAP_STATUSES)[number];

/* --------------------------- Roadmap config --------------------------- */

export const RoadmapConfigSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only."),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: RoadmapStatusSchema.default("draft"),
  // generation config (server-only — never sent to the browser)
  provider: ProviderSchema.default("groq"),
  model: z.string().min(1).default("llama-3.3-70b-versatile"),
  systemPrompt: z.string().default(""),
  enableWebSearch: z.boolean().default(false),
  maxOutputTokens: z.number().int().positive().default(2200),
  modelParams: z.record(z.string(), z.any()).default({}),
  // public copy + render config
  intro: IntroSchema,
  modules: z.array(ModuleSchema).default([]),
  questions: z.array(QuestionSchema).default([]),
  outputSchema: z.array(OutputSectionSchema).default([]),
  cta: CtaSchema,
  scoring: ScoringSchema,
  // limits
  maxGenPerIpPerDay: z.number().int().positive().default(5),
});
export type RoadmapConfig = z.infer<typeof RoadmapConfigSchema>;

/** The render-safe subset handed to the participant browser. */
export type PublicRoadmapConfig = {
  slug: string;
  title: string;
  description?: string | null;
  intro: Intro;
  modules: Module[];
  questions: Question[];
  outputSchema: OutputSection[];
  cta: Cta;
};

/* ----------------------------- Runtime types ----------------------------- */

export type Answers = Record<string, string | string[]>;

export type Assessment = {
  stats: Record<string, number>;
  readinessState: string;
  flags: string[];
};

/** The generated roadmap: keys come from outputSchema sections. */
export type GeneratedOutput = Record<string, unknown> & {
  generatedBy?: string;
};
