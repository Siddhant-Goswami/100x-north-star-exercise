"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PROVIDERS } from "@/lib/config-schema";
import type { TabProps } from "../roadmap-editor";
import { AreaField, NumberField } from "./fields";

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  openai: ["gpt-5.4-mini", "gpt-5.4"],
  groq: ["llama-3.3-70b-versatile"],
  openrouter: ["openai/gpt-5.4-mini", "anthropic/claude-sonnet-4.6"],
  anthropic: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
};

export function GenerationTab({ config, patch }: TabProps) {
  return (
    <div className="max-w-2xl space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Provider</Label>
          <Select
            value={config.provider}
            onValueChange={(v) =>
              patch({
                provider: v as (typeof config)["provider"],
                model: MODEL_SUGGESTIONS[v]?.[0] ?? config.model,
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Model</Label>
          <Input
            list="model-suggestions"
            value={config.model}
            onChange={(e) => patch({ model: e.target.value })}
            className="font-mono text-xs"
          />
          <datalist id="model-suggestions">
            {(MODEL_SUGGESTIONS[config.provider] ?? []).map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
      </div>

      <AreaField
        label="System prompt"
        rows={12}
        value={config.systemPrompt}
        onChange={(v) => patch({ systemPrompt: v })}
        hint="Instructions sent to the model. The required output JSON shape is appended automatically from your Output schema."
      />

      <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
        <div>
          <p className="font-medium">Web search</p>
          <p className="text-sm text-muted-foreground">
            Ground output in current info. Honored on OpenAI &amp; Anthropic.
          </p>
        </div>
        <Switch
          checked={config.enableWebSearch}
          onCheckedChange={(c) => patch({ enableWebSearch: c })}
        />
      </div>

      <NumberField
        label="Max output tokens"
        value={config.maxOutputTokens}
        onChange={(v) => patch({ maxOutputTokens: v ?? 2200 })}
      />
    </div>
  );
}
