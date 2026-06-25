import type { RoadmapConfig } from "@/lib/config-schema";

/**
 * Builds a self-contained prompt an instructor can paste into any LLM (ChatGPT,
 * Claude, etc.) to author or refine a roadmap. The model is asked to return a
 * single JSON object matching {@link RoadmapConfig}; that JSON is pasted back
 * into the "AI build" tab to populate every form field. See
 * {@link parseConfigJson} for the import side of the round-trip.
 */

/** Annotated reference of the config shape, embedded in the authoring prompt. */
const SCHEMA_REFERENCE = `{
  "slug": string,                 // lowercase letters/numbers/hyphens, e.g. "ai-launch-30day" (the public URL id)
  "title": string,                // roadmap name shown to students
  "description": string | null,   // one-line summary for the roadmap picker
  "status": "draft",              // keep "draft" — publishing is a separate, deliberate step
  "provider": "groq",             // one of: "groq" (default) | "openai" | "openrouter" | "anthropic"
  "model": string,                // e.g. "llama-3.3-70b-versatile" for groq
  "systemPrompt": string,         // instructions to the generating LLM. The required output JSON
                                  // shape is appended automatically from outputSchema — don't restate it.
  "enableWebSearch": false,       // only honored on openai & anthropic
  "maxOutputTokens": 2200,
  "modelParams": {},              // advanced; leave {}
  "intro": {                      // landing copy shown before the questions (all fields optional)
    "eyebrow": string, "title": string, "subtitle": string, "body": string,
    "promises": [{ "title": string, "body": string }],
    "proof": string,
    "testimonial": { "result": string, "name": string, "detail": string }
  },
  "modules": [{ "id": string, "title": string, "number": string }],  // optional grouping for questions
  "questions": [
    {
      "questionKey": string,      // UNIQUE, snake_case, e.g. "current_role"
      "position": number,         // 0-based display order
      "module": string,           // optional: id of the module this belongs to
      "type": "text",             // "text" (short) | "long" (paragraph) | "single" (choose one)
                                  //  | "multi" (choose many) | "intro" (a copy-only section, no input)
      "title": string,            // the question text
      "help": string,             // optional helper text under the question
      "placeholder": string,      // optional
      "maxLength": number,        // optional character cap
      "options": [["value", "Label"]],  // REQUIRED for single/multi; [] otherwise
      "allowOther": false,        // adds a free-text "Other" choice to single/multi
      "required": true,
      "config": {}                // advanced; leave {}
    }
  ],
  "outputSchema": [               // the shape of the generated plan the student receives
    {
      "key": string,              // e.g. "summary"
      "label": string,
      "kind": "string",           // "string" | "string-array" (bullets) | "segments" | "list" (items with fields)
      "instruction": string,      // tells the model what to put in this field
      "maxChars": number,         // optional, for "string"
      "min": number, "max": number,           // optional item counts for "string-array"/"list"
      "itemFields": [{ "key": string, "label": string }],  // for "list" kind: fields per item
      "optional": false,          // if true the model may omit this field
      "echoAnswer": string        // optional: a questionKey whose answer becomes this field's value
    }
  ],
  "cta": {
    "contact": { "headline": string, "subtitle": string, "consentLabel": string, "privacyNote": string, "submitLabel": string },
    "result": { "nextStepTitle": string, "nextStepBody": string, "buttonLabel": string, "buttonUrl": string }
  },
  "scoring": {},                  // optional analytics rubric; {} skips scoring
  "maxGenPerIpPerDay": 5          // per-IP daily generation limit
}`;

/** The current config, minus the DB id (preserved locally, not the model's to set). */
function currentConfigForPrompt(config: RoadmapConfig): string {
  const { id: _id, ...rest } = config;
  return JSON.stringify(rest, null, 2);
}

export function buildAuthoringPrompt(config: RoadmapConfig, brief: string): string {
  const goal = brief.trim()
    ? brief.trim()
    : "Refine and complete the roadmap configuration below.";

  return `You are an expert instructional designer building a "roadmap" for the 100x Roadmap Studio platform. A roadmap is a guided form: a student answers questions, and an LLM turns their answers into a personalized plan. Your job is to output the roadmap's configuration as a single JSON object.

## What to build
${goal}

## Output contract
Return ONE JSON object and NOTHING else — no markdown code fences, no commentary before or after. It must conform to this schema (comments are explanatory; do not include them in your output):

${SCHEMA_REFERENCE}

## Rules
- Output strictly valid JSON (double-quoted keys/strings, no trailing commas, no comments).
- Keep "slug" lowercase-hyphenated; make every "questionKey" unique and snake_case.
- Give single/multi questions a non-empty "options" array of [value, label] pairs; use [] for other types.
- Every outputSchema "key" should be referenced by the systemPrompt's intent so the plan is coherent.
- Write a strong "systemPrompt": who the model is, tone, and how to use the student's answers. Do not restate the output JSON shape — it is appended automatically.
- Preserve the existing "slug" unless the brief asks to change it.

## Current configuration (edit this as your starting point)
${currentConfigForPrompt(config)}`;
}

/**
 * Tolerantly parse the JSON an instructor pastes back from their LLM. Strips
 * markdown code fences and, if the whole string isn't valid JSON, falls back to
 * the outermost {...} object. Returns the parsed value or an error message.
 */
export function parseConfigJson(
  raw: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  let text = raw.trim();
  if (!text) return { ok: false, error: "Paste the JSON your LLM returned." };

  // Strip a leading ```json / ``` fence and trailing ``` if present.
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1].trim();

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    // Fall back to the outermost object the model may have wrapped in prose.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return { ok: true, value: JSON.parse(text.slice(start, end + 1)) };
      } catch {
        /* fall through */
      }
    }
    return { ok: false, error: "That isn't valid JSON. Paste the raw object your LLM returned." };
  }
}
