"use client";

import type { Question } from "@/lib/config-schema";

const PART_CLASS: Record<string, string> = {
  time: "text-primary font-medium",
  role: "text-foreground font-semibold",
  thing: "text-muted-foreground",
  scale: "text-emerald-600 font-medium",
};

type TemplateSeg = { text: string; part?: string };
type Example = { time?: string; role?: string; thing?: string; scale?: string };

/** Renders the North Star fill-in template + a colour-coded example. */
export function NorthStarGuide({ config }: { config: Question["config"] }) {
  const template = (Array.isArray(config?.template) ? config.template : []) as TemplateSeg[];
  const examples = (Array.isArray(config?.examples) ? config.examples : []) as Example[];
  const example = examples[0];

  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
      <p className="font-mono text-[13px] leading-relaxed">
        {template.map((seg, i) =>
          seg.part ? (
            <span key={i} className={PART_CLASS[seg.part] ?? ""}>
              {seg.text}
            </span>
          ) : (
            <span key={i} className="text-muted-foreground">
              {seg.text}
            </span>
          ),
        )}
      </p>
      {example && (
        <p className="leading-relaxed text-muted-foreground">
          <span className="text-foreground/70">e.g. </span>
          <span className={PART_CLASS.time}>By {example.time}</span>, I am{" "}
          <span className={PART_CLASS.role}>{example.role}</span> doing{" "}
          <span>{example.thing}</span> at{" "}
          <span className={PART_CLASS.scale}>{example.scale}</span>.
        </p>
      )}
    </div>
  );
}
