import "server-only";
import type {
  Answers,
  Assessment,
  GeneratedOutput,
  OutputSection,
  RoadmapConfig,
} from "@/lib/config-schema";
import { coerceOutput } from "./coerce";
import { generate, GenerationError, type GenUsage } from "./providers";
import { scoreAssessment } from "./scoring";
import { extractJson } from "./text";

export type GenerationOutcome = {
  output: GeneratedOutput;
  assessment: Assessment;
  usage: GenUsage;
};

function describeSection(section: OutputSection): string {
  let shape: string;
  switch (section.kind) {
    case "string":
      shape = "a string";
      break;
    case "string-array":
      shape = `an array of ${section.min ?? 2}-${section.max ?? 4} short strings`;
      break;
    case "segments":
      shape =
        'an array of {text, part} objects (part is "time"|"role"|"thing"|"scale"|"")';
      break;
    case "list":
      shape = `an array of ${section.min ?? 1}-${section.max ?? 6} objects, each with keys: ${(section.itemFields ?? [])
        .map((f) => `"${f.key}"`)
        .join(", ")}`;
      break;
    default:
      shape = "a value";
  }
  let line = `- "${section.key}": ${shape}`;
  if (section.instruction) line += ` — ${section.instruction}`;
  if (section.optional) line += " (optional; use an empty value if nothing solid)";
  return line;
}

export function buildSystemPrompt(config: RoadmapConfig): string {
  const schema = config.outputSchema.map(describeSection).join("\n");
  return [
    config.systemPrompt.trim(),
    "",
    "Return ONLY a single JSON object (no markdown fences, no prose outside the JSON) with exactly these fields:",
    schema,
  ]
    .join("\n")
    .trim();
}

function buildUserContent(input: { name: string; answers: Answers }): string {
  return [
    "The completed exercise (JSON):",
    "",
    JSON.stringify({ name: input.name, answers: input.answers }, null, 2),
    "",
    "Return ONLY the JSON object described in your instructions.",
  ].join("\n");
}

/**
 * The single generation path shared by production submissions and instructor
 * test runs: score → call the configured provider → coerce to the output schema.
 */
export async function runGeneration(
  config: RoadmapConfig,
  input: { name: string; answers: Answers },
): Promise<GenerationOutcome> {
  const assessment = scoreAssessment(input.answers, config.scoring);
  const result = await generate({
    provider: config.provider,
    model: config.model,
    systemPrompt: buildSystemPrompt(config),
    userContent: buildUserContent(input),
    maxOutputTokens: config.maxOutputTokens,
    enableWebSearch: config.enableWebSearch,
    modelParams: config.modelParams,
  });
  const parsed = extractJson(result.text);
  // Reject unparseable output rather than coercing it into blank defaults that
  // would be persisted and served as if generation had succeeded.
  if (parsed === null) {
    throw new GenerationError("The model did not return usable JSON output.", 502);
  }
  const output = coerceOutput(parsed, config.outputSchema, input.answers);
  return { output, assessment, usage: result.usage };
}
