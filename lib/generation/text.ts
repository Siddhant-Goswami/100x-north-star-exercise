/** Shared text helpers for generation input/output cleaning. */

export function cleanText(value: unknown, max = 4000): string {
  return String(value ?? "").trim().slice(0, max);
}

/**
 * Strip web-search citation artifacts (markdown links, bare URLs, parenthetical
 * domains, trailing source lists) so output is clean prose for a reader.
 */
export function cleanProse(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [label](url) -> label
    .replace(/\(\s*https?:\/\/[^)]*\)/g, "") // (http url)
    .replace(/https?:\/\/\S+/g, "") // bare urls
    .replace(/\s*\((?:see\s+)?(?:[a-z0-9-]+\.)+[a-z]{2,}[^)]*\)/gi, "") // (platform.openai.com)
    .replace(/\s*\n*\s*(?:sources?|references?|citations?)\s*:[\s\S]*$/i, "") // trailing source list
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Pull the first balanced-looking JSON object out of an LLM text response. */
export function extractJson(text: string): unknown | null {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}
