import type {
  Answers,
  Assessment,
  Dimension,
  ScoringConfig,
} from "@/lib/config-schema";

const TIME_MARKERS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function textOf(value: unknown): string {
  if (Array.isArray(value)) return value.join(" ");
  return String(value ?? "");
}

function detailScore(value: unknown, thresholds: number[]): number {
  const length = textOf(value).trim().length;
  if (length >= thresholds[2]) return 5;
  if (length >= thresholds[1]) return 4;
  if (length >= thresholds[0]) return 3;
  return length ? 2 : 1;
}

function hasTimeAndScale(value: unknown): boolean {
  const normalized = textOf(value).toLowerCase();
  const hasTime =
    /\b20\d\d\b/.test(normalized) ||
    TIME_MARKERS.some((m) => normalized.includes(m));
  const hasScale = /\d/.test(normalized);
  return hasTime && hasScale;
}

function scoreDimension(dim: Dimension, answers: Answers): number {
  const answer = answers[dim.question];
  if (dim.type === "detail") {
    const thresholds = dim.thresholds ?? [40, 80, 140];
    const base = detailScore(answer, thresholds);
    if (dim.boostIfTimeAndScale && hasTimeAndScale(answer)) {
      return Math.min(5, Math.max(4, base));
    }
    return base;
  }
  // map
  const key = textOf(answer);
  let score = dim.map?.[key] ?? dim.default ?? 0;
  if (dim.capIf) {
    const capAnswer = textOf(answers[dim.capIf.question]);
    if (capAnswer === dim.capIf.equals) score = Math.min(score, dim.capIf.cap);
  }
  return score;
}

function flagMatches(
  when: ScoringConfig["flags"][number]["when"],
  answers: Answers,
  stats: Record<string, number>,
): boolean {
  if (when.dimensionAtMost) {
    const value = stats[when.dimensionAtMost.key];
    return typeof value === "number" && value <= when.dimensionAtMost.value;
  }
  if (when.question && when.equals !== undefined) {
    return textOf(answers[when.question]) === when.equals;
  }
  if (when.question && when.includes !== undefined) {
    const value = answers[when.question];
    const list = Array.isArray(value) ? value.map(String) : [String(value ?? "")];
    return list.includes(when.includes);
  }
  return false;
}

/**
 * Evaluate the instructor's scoring rubric into a stored assessment. An empty
 * rubric yields an empty assessment (scoring is optional per roadmap).
 */
export function scoreAssessment(
  answers: Answers,
  scoring: ScoringConfig,
): Assessment {
  const dimensions = scoring?.dimensions ?? [];
  if (dimensions.length === 0) {
    return { stats: {}, readinessState: "", flags: [] };
  }

  const stats: Record<string, number> = {};
  for (const dim of dimensions) stats[dim.key] = scoreDimension(dim, answers);

  const values = Object.values(stats);
  const average = values.length
    ? values.reduce((sum, v) => sum + v, 0) / values.length
    : 0;

  let readinessState = "";
  for (const band of [...(scoring.readinessBands ?? [])].sort(
    (a, b) => b.min - a.min,
  )) {
    if (average >= band.min) {
      readinessState = band.label;
      break;
    }
  }

  const flags: string[] = [];
  for (const rule of scoring.flags ?? []) {
    if (flagMatches(rule.when, answers, stats)) flags.push(rule.id);
  }

  return { stats, readinessState, flags };
}
