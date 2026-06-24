"use client";

import { useState } from "react";
import { toast } from "sonner";
import { OutputRenderer } from "@/components/participant/output-renderer";
import { QuestionField } from "@/components/participant/question-field";
import { Button } from "@/components/ui/button";
import type { Answers, GeneratedOutput, RoadmapConfig } from "@/lib/config-schema";
import { TextField } from "./fields";

type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

function isOther(v: string) {
  return v === "else" || v === "other";
}

export function TestTab({
  config,
  isNew,
}: {
  config: RoadmapConfig;
  isNew: boolean;
}) {
  const questions = config.questions.filter((q) => q.type !== "intro");
  const [name, setName] = useState("Test Student");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<
    Array<{ output: GeneratedOutput; usage: Usage }>
  >([]);

  if (isNew || !config.id) {
    return (
      <p className="text-sm text-muted-foreground">
        Save the roadmap first, then come back here to test it with sample
        inputs.
      </p>
    );
  }

  function buildAnswers(): Answers {
    const result: Answers = {};
    for (const q of questions) {
      let v = answers[q.questionKey];
      if (v === undefined) continue;
      const other = otherTexts[q.questionKey]?.trim();
      if (q.allowOther && other) {
        if (typeof v === "string" && isOther(v)) v = other;
        else if (Array.isArray(v)) v = v.map((x) => (isOther(x) ? other : x));
      }
      result[q.questionKey] = v;
    }
    return result;
  }

  async function run() {
    setRunning(true);
    try {
      const res = await fetch("/api/test-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roadmapId: config.id,
          name,
          answers: buildAnswers(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Test failed.");
        return;
      }
      setResults((r) => [{ output: data.output, usage: data.usage ?? {} }, ...r]);
      toast.success("Generated.");
    } catch {
      toast.error("Network error.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Sample input</h3>
          <Button onClick={run} disabled={running}>
            {running ? "Generating…" : "Run test"}
          </Button>
        </div>
        <TextField label="Student name" value={name} onChange={setName} />
        {questions.map((q) => (
          <QuestionField
            key={q.questionKey}
            question={q}
            value={answers[q.questionKey]}
            otherText={otherTexts[q.questionKey] ?? ""}
            onChange={(v) =>
              setAnswers((a) => ({ ...a, [q.questionKey]: v }))
            }
            onOtherChange={(t) =>
              setOtherTexts((o) => ({ ...o, [q.questionKey]: t }))
            }
          />
        ))}
      </div>

      <div className="space-y-6">
        <h3 className="font-semibold">Results</h3>
        {results.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Run a test to see the generated output. Tests don&apos;t create
            submissions, but their cost is logged for the admin.
          </p>
        )}
        {results.map((r, i) => (
          <div key={i} className="space-y-4 rounded-xl border p-5">
            <p className="font-mono text-xs text-muted-foreground">
              tokens in {r.usage.inputTokens ?? 0} · out{" "}
              {r.usage.outputTokens ?? 0}
            </p>
            <OutputRenderer sections={config.outputSchema} output={r.output} />
          </div>
        ))}
      </div>
    </div>
  );
}
