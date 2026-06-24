import type { Answers, Question } from "@/lib/config-schema";

/** A required answer is present if it's a non-empty string or a non-empty array. */
function isAnswered(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return String(value ?? "").trim().length > 0;
}

export function validateAnswers(
  answers: Answers,
  questions: Question[],
): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const q of questions) {
    if (q.type === "intro" || !q.required) continue;
    if (!isAnswered(answers[q.questionKey])) missing.push(q.questionKey);
  }
  return { ok: missing.length === 0, missing };
}

/** Keep only known question keys; coerce values to string | string[]. */
export function sanitizeAnswers(
  answers: Record<string, unknown>,
  questions: Question[],
): Answers {
  const allowed = new Map(questions.map((q) => [q.questionKey, q]));
  const clean: Answers = {};
  for (const [key, q] of allowed) {
    const value = answers[key];
    if (value === undefined || value === null) continue;
    if (q.type === "multi") {
      const arr = Array.isArray(value) ? value : [value];
      clean[key] = arr
        .map((v) => String(v).trim())
        .filter((v) => v.length > 0)
        .slice(0, 50);
    } else {
      clean[key] = Array.isArray(value)
        ? value.map((v) => String(v)).join(", ")
        : String(value).slice(0, q.maxLength ?? 4000);
    }
  }
  return clean;
}
