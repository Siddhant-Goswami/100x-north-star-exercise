import "server-only";
import type { Provider } from "@/lib/config-schema";

export type GenerateParams = {
  provider: Provider;
  model: string;
  systemPrompt: string;
  userContent: string;
  maxOutputTokens: number;
  enableWebSearch: boolean;
  modelParams: Record<string, unknown>;
};

export type GenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type GenResult = { text: string; usage: GenUsage };

export class GenerationError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GenerationError";
    this.status = status;
  }
}

const KEY_ENV: Record<Provider, string> = {
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

const BASE_URL: Record<"openai" | "groq" | "openrouter", string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

const TIMEOUT_MS = 90_000;

function providerKey(provider: Provider): string {
  return (process.env[KEY_ENV[provider]] || "").replace(/\s+/g, "");
}

function normUsage(input: unknown, output: unknown, total?: unknown): GenUsage {
  const i = Number(input) || 0;
  const o = Number(output) || 0;
  return { inputTokens: i, outputTokens: o, totalTokens: Number(total) || i + o };
}

async function fetchJson(
  url: string,
  init: RequestInit,
  provider: Provider,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GenerationError(
        `${provider} request failed (${res.status}): ${body.slice(0, 300)}`,
        res.status,
      );
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof GenerationError) throw err;
    throw new GenerationError(
      `${provider} request errored: ${err instanceof Error ? err.message : String(err)}`,
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** OpenAI / Groq / OpenRouter — one OpenAI-compatible chat-completions client. */
async function openaiCompatibleChat(
  key: string,
  baseUrl: string,
  params: GenerateParams,
): Promise<GenResult> {
  // OpenAI's newer models require `max_completion_tokens`; Groq/OpenRouter use `max_tokens`.
  const tokenParam =
    params.provider === "openai" ? "max_completion_tokens" : "max_tokens";
  const body: Record<string, unknown> = {
    model: params.model,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userContent },
    ],
    [tokenParam]: params.maxOutputTokens,
    ...params.modelParams,
  };
  // OpenAI and Groq honor JSON mode; OpenRouter forwards to varied models.
  if (params.provider !== "openrouter") {
    body.response_format = { type: "json_object" };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (params.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://100xengineers.com";
    headers["X-Title"] = "100x Roadmap Studio";
  }

  const data = await fetchJson(
    `${baseUrl}/chat/completions`,
    { method: "POST", headers, body: JSON.stringify(body) },
    params.provider,
  );
  const choices = (data.choices as Array<Record<string, unknown>>) ?? [];
  const message = (choices[0]?.message as Record<string, unknown>) ?? {};
  const text = typeof message.content === "string" ? message.content : "";
  const usage = (data.usage as Record<string, unknown>) ?? {};
  return {
    text,
    usage: normUsage(usage.prompt_tokens, usage.completion_tokens, usage.total_tokens),
  };
}

/** OpenAI Responses API — used when web search is enabled. */
async function openaiResponses(
  key: string,
  params: GenerateParams,
): Promise<GenResult> {
  const body: Record<string, unknown> = {
    model: params.model,
    tools: [{ type: "web_search" }],
    input: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userContent },
    ],
    max_output_tokens: params.maxOutputTokens,
    ...params.modelParams,
  };
  const data = await fetchJson(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    "openai",
  );
  const usage = (data.usage as Record<string, unknown>) ?? {};
  return {
    text: extractResponsesText(data),
    usage: normUsage(usage.input_tokens, usage.output_tokens, usage.total_tokens),
  };
}

function extractResponsesText(data: Record<string, unknown>): string {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }
  const output = Array.isArray(data.output) ? data.output : [];
  const chunks: string[] = [];
  for (const item of output as Array<Record<string, unknown>>) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content as Array<Record<string, unknown>>) {
      if (
        (part.type === "output_text" || part.type === "text") &&
        typeof part.text === "string"
      ) {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join("\n");
}

/** Anthropic Messages API. */
async function anthropicMessages(
  key: string,
  params: GenerateParams,
): Promise<GenResult> {
  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxOutputTokens,
    system: params.systemPrompt,
    messages: [{ role: "user", content: params.userContent }],
    ...params.modelParams,
  };
  if (params.enableWebSearch) {
    body.tools = [
      { type: "web_search_20250305", name: "web_search", max_uses: 3 },
    ];
  }
  const data = await fetchJson(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    "anthropic",
  );
  const content = Array.isArray(data.content) ? data.content : [];
  const text = (content as Array<Record<string, unknown>>)
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
  const usage = (data.usage as Record<string, unknown>) ?? {};
  return { text, usage: normUsage(usage.input_tokens, usage.output_tokens) };
}

export async function generate(params: GenerateParams): Promise<GenResult> {
  const key = providerKey(params.provider);
  if (!key) {
    throw new GenerationError(
      `No API key configured for provider "${params.provider}".`,
      503,
    );
  }
  if (params.provider === "anthropic") return anthropicMessages(key, params);
  if (params.provider === "openai" && params.enableWebSearch) {
    return openaiResponses(key, params);
  }
  return openaiCompatibleChat(key, BASE_URL[params.provider], params);
}
