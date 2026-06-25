"use client";

import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RoadmapConfigSchema } from "@/lib/config-schema";
import { buildAuthoringPrompt, parseConfigJson } from "@/lib/authoring-prompt";
import type { TabProps } from "../roadmap-editor";
import { AreaField } from "./fields";

export function AiBuildTab({ config, patch }: TabProps) {
  const [brief, setBrief] = useState("");
  const [paste, setPaste] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const prompt = useMemo(() => buildAuthoringPrompt(config, brief), [config, brief]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast.success("Prompt copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy automatically — select the text and copy it.");
    }
  }

  function applyImport() {
    const parsed = parseConfigJson(paste);
    if (!parsed.ok) {
      setErr(parsed.error);
      return;
    }
    const res = RoadmapConfigSchema.safeParse(parsed.value);
    if (!res.success) {
      const issue = res.error.issues[0];
      setErr(
        issue
          ? `${issue.path.join(".") || "config"}: ${issue.message}`
          : "That JSON doesn't match the roadmap format.",
      );
      return;
    }
    setErr(null);
    // Replace every field from the imported config, but keep this record's DB id
    // (the model shouldn't reassign identity). Review tabs reflect it on switch.
    patch({ ...res.data, id: config.id });
    toast.success("Form populated from JSON. Review each tab, then click Save.");
  }

  return (
    <div className="max-w-2xl space-y-10">
      <section className="space-y-3">
        <div>
          <h3 className="font-semibold">1 · Generate an authoring prompt</h3>
          <p className="text-sm text-muted-foreground">
            Describe what you want, copy the prompt, and paste it into ChatGPT,
            Claude, or any LLM. It already includes this roadmap&apos;s current
            settings and the exact JSON format to return.
          </p>
        </div>
        <AreaField
          label="What should this roadmap do? (optional brief)"
          rows={3}
          value={brief}
          onChange={setBrief}
          placeholder="e.g. A 30-day plan that helps career switchers land a first data-analyst role."
        />
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Authoring prompt</Label>
            <Button size="sm" variant="outline" onClick={copyPrompt}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy prompt"}
            </Button>
          </div>
          <Textarea
            readOnly
            value={prompt}
            rows={12}
            className="font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="font-semibold">2 · Paste the JSON back</h3>
          <p className="text-sm text-muted-foreground">
            Paste the JSON your LLM returned (code fences are fine). It fills
            every tab in this form. Nothing is saved until you click{" "}
            <span className="font-medium">Save</span>.
          </p>
        </div>
        <AreaField
          label="Config JSON from your LLM"
          mono
          rows={12}
          value={paste}
          error={err}
          onChange={(v) => {
            setPaste(v);
            if (err) setErr(null);
          }}
          placeholder='{ "slug": "...", "title": "...", "questions": [ ... ] }'
        />
        <Button onClick={applyImport} disabled={!paste.trim()}>
          Apply JSON to form
        </Button>
      </section>
    </div>
  );
}
