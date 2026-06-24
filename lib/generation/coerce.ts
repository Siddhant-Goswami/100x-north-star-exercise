import type {
  Answers,
  GeneratedOutput,
  OutputSection,
} from "@/lib/config-schema";
import { cleanProse, cleanText } from "./text";

const VALID_PARTS = new Set(["time", "role", "thing", "scale", ""]);

function coerceString(
  section: OutputSection,
  value: unknown,
  answers: Answers,
): string {
  let str = typeof value === "string" ? cleanProse(value) : "";
  if (!str && section.echoAnswer) {
    str = cleanText(answers[section.echoAnswer], section.maxChars ?? 500);
  }
  return section.maxChars ? str.slice(0, section.maxChars) : str;
}

function coerceStringArray(section: OutputSection, value: unknown): string[] {
  const arr = (Array.isArray(value) ? value : [])
    .map((v) => {
      if (typeof v === "string") return cleanProse(v);
      if (v && typeof v === "object" && typeof (v as { text?: unknown }).text === "string") {
        return cleanProse((v as { text: string }).text);
      }
      return "";
    })
    .filter(Boolean)
    .map((v) => (section.maxChars ? v.slice(0, section.maxChars) : v));
  return section.max ? arr.slice(0, section.max) : arr;
}

function coerceSegments(value: unknown): Array<{ text: string; part: string }> {
  return (Array.isArray(value) ? value : [])
    .filter(
      (x): x is { text: string; part?: unknown } =>
        !!x && typeof x === "object" && typeof (x as { text?: unknown }).text === "string",
    )
    .slice(0, 60)
    .map((x) => {
      const part =
        typeof x.part === "string" && VALID_PARTS.has(x.part) ? x.part : "";
      return { text: String(x.text), part };
    });
}

function coerceList(
  section: OutputSection,
  value: unknown,
): Array<Record<string, string>> {
  const fields = section.itemFields ?? [];
  return (Array.isArray(value) ? value : [])
    .filter((x) => x && typeof x === "object")
    .slice(0, section.max ?? 8)
    .map((x) => {
      const row = x as Record<string, unknown>;
      const item: Record<string, string> = {};
      for (const field of fields) {
        item[field.key] = cleanProse(cleanText(row[field.key], 1400));
      }
      return item;
    })
    .filter((item) => Object.values(item).some(Boolean));
}

/**
 * Validate/clamp raw LLM output against the roadmap's output schema. Always
 * returns a value for every section so the renderer never sees undefined.
 */
export function coerceOutput(
  raw: unknown,
  sections: OutputSection[],
  answers: Answers,
): GeneratedOutput {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: GeneratedOutput = { generatedBy: "llm" };
  for (const section of sections) {
    const value = obj[section.key];
    switch (section.kind) {
      case "string":
        out[section.key] = coerceString(section, value, answers);
        break;
      case "string-array":
        out[section.key] = coerceStringArray(section, value);
        break;
      case "segments":
        out[section.key] = coerceSegments(value);
        break;
      case "list":
        out[section.key] = coerceList(section, value);
        break;
      default:
        out[section.key] = value ?? null;
    }
  }
  return out;
}
