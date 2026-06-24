"use client";

import { useState } from "react";
import { ScoringSchema } from "@/lib/config-schema";
import type { TabProps } from "../roadmap-editor";
import { AreaField } from "./fields";

export function ScoringTab({ config, patch }: TabProps) {
  const [text, setText] = useState(JSON.stringify(config.scoring ?? {}, null, 2));
  const [err, setErr] = useState<string | null>(null);

  function onChange(t: string) {
    setText(t);
    try {
      const parsed = JSON.parse(t || "{}");
      const res = ScoringSchema.safeParse(parsed);
      if (!res.success) {
        setErr(res.error.issues[0]?.message ?? "Invalid scoring rubric.");
        return;
      }
      setErr(null);
      patch({ scoring: res.data });
    } catch {
      setErr("Invalid JSON");
    }
  }

  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-sm text-muted-foreground">
        Paste a scoring rubric (JSON). Optional — leave as{" "}
        <code className="font-mono text-xs">{"{}"}</code> to skip scoring. It
        drives the assessment (clarity scores, readiness, review flags) stored on
        each submission for analytics.
      </p>
      <AreaField
        label="Scoring rubric (JSON)"
        mono
        rows={20}
        value={text}
        error={err}
        onChange={onChange}
      />
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Shape reference</summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3">{`{
  "dimensions": [
    { "key": "clarity", "type": "detail", "question": "north_star",
      "thresholds": [40, 80, 140], "boostIfTimeAndScale": true },
    { "key": "commitment", "type": "map", "question": "decision",
      "map": { "yes": 5, "refine": 3 }, "default": 2 }
  ],
  "readinessBands": [
    { "min": 4, "label": "Ready" }, { "min": 0, "label": "In progress" }
  ],
  "flags": [
    { "id": "vague", "when": { "dimensionAtMost": { "key": "clarity", "value": 2 } } }
  ]
}`}</pre>
      </details>
    </div>
  );
}
