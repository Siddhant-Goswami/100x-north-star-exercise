import type { RoadmapConfig } from "@/lib/config-schema";

/** A blank roadmap with a minimal starter output schema, for the "new" editor. */
export function makeBlankRoadmap(): RoadmapConfig {
  return {
    slug: "",
    title: "",
    description: "",
    status: "draft",
    provider: "openai",
    model: "gpt-5.4-mini",
    systemPrompt:
      "You are a helpful mentor. Using the student's answers, write a personalized, honest plan toward their goal. Reference their actual words; never generic.",
    enableWebSearch: false,
    maxOutputTokens: 2200,
    modelParams: {},
    intro: { promises: [] },
    modules: [],
    questions: [],
    outputSchema: [
      {
        key: "headline",
        kind: "string",
        maxChars: 200,
        optional: false,
        instruction: "A warm one-line headline addressed to the reader.",
      },
      {
        key: "summary",
        kind: "string",
        maxChars: 1200,
        optional: false,
        instruction: "An honest, personalized summary of their plan.",
      },
    ],
    cta: { contact: {}, result: {} },
    scoring: { dimensions: [], readinessBands: [], flags: [] },
    maxGenPerIpPerDay: 5,
  };
}
