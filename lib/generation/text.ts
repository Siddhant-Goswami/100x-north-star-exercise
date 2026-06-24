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

/** Pull the first complete, balanced JSON object out of an LLM text response. */
export function extractJson(text: string): unknown | null {
  if (!text) return null;
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
