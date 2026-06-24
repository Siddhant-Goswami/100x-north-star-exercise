import type { GeneratedOutput, OutputSection } from "@/lib/config-schema";

const PART_CLASS: Record<string, string> = {
  time: "text-primary font-semibold",
  role: "text-foreground font-semibold",
  thing: "text-muted-foreground",
  scale: "text-emerald-600 font-semibold",
};

function labelize(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function SectionLabel({ section }: { section: OutputSection }) {
  return (
    <h3 className="font-mono text-xs uppercase tracking-wider text-primary">
      {section.label ?? labelize(section.key)}
    </h3>
  );
}

/** Renders a generated roadmap generically from its output schema. */
export function OutputRenderer({
  sections,
  output,
}: {
  sections: OutputSection[];
  output: GeneratedOutput;
}) {
  const hasSegments = sections.some(
    (s) =>
      s.kind === "segments" &&
      Array.isArray(output[s.key]) &&
      (output[s.key] as unknown[]).length > 0,
  );
  // The first eligible string section becomes the headline; derive it up front
  // rather than mutating a flag during render.
  const headlineKey = sections.find(
    (s) =>
      s.kind === "string" &&
      typeof output[s.key] === "string" &&
      (output[s.key] as string).length > 0 &&
      !(s.echoAnswer && hasSegments),
  )?.key;

  return (
    <div className="space-y-8">
      {sections.map((section) => {
        const value = output[section.key];

        if (section.kind === "segments") {
          const segs = (Array.isArray(value) ? value : []) as {
            text: string;
            part: string;
          }[];
          if (!segs.length) return null;
          return (
            <p
              key={section.key}
              className="text-2xl font-semibold leading-snug text-balance"
            >
              {segs.map((seg, i) => (
                <span key={i} className={PART_CLASS[seg.part] ?? ""}>
                  {seg.text}
                </span>
              ))}
            </p>
          );
        }

        if (section.kind === "string") {
          const str = typeof value === "string" ? value : "";
          if (!str) return null;
          if (section.echoAnswer && hasSegments) return null;
          if (section.key === headlineKey) {
            return (
              <h1
                key={section.key}
                className="text-2xl font-bold tracking-tight text-balance"
              >
                {str}
              </h1>
            );
          }
          return (
            <div key={section.key} className="space-y-2">
              <SectionLabel section={section} />
              <p className="text-[15px] leading-relaxed text-foreground/90">
                {str}
              </p>
            </div>
          );
        }

        if (section.kind === "string-array") {
          const arr = (Array.isArray(value) ? value : []) as string[];
          if (!arr.length) return null;
          return (
            <div key={section.key} className="space-y-3">
              <SectionLabel section={section} />
              <ol className="space-y-2.5">
                {arr.map((item, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                    <span className="mt-1 font-mono text-xs text-primary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        }

        if (section.kind === "list") {
          const items = (Array.isArray(value) ? value : []) as Record<
            string,
            string
          >[];
          if (!items.length) return null;
          const fields = section.itemFields ?? [];
          return (
            <div key={section.key} className="space-y-3">
              <SectionLabel section={section} />
              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((item, i) => (
                  <div
                    key={i}
                    className="space-y-1.5 rounded-lg border p-4"
                  >
                    {fields.map((field) => {
                      const v = item[field.key];
                      if (!v) return null;
                      if (field.key === "window") {
                        return (
                          <p
                            key={field.key}
                            className="font-mono text-xs uppercase tracking-wide text-primary"
                          >
                            {v}
                          </p>
                        );
                      }
                      if (field.key === "title") {
                        return (
                          <p key={field.key} className="font-semibold">
                            {v}
                          </p>
                        );
                      }
                      return (
                        <p
                          key={field.key}
                          className="text-sm leading-relaxed text-muted-foreground"
                        >
                          {v}
                        </p>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
