"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { OUTPUT_KINDS, type OutputSection } from "@/lib/config-schema";
import type { TabProps } from "../roadmap-editor";
import { AreaField, NumberField, TextField } from "./fields";

function blankSection(): OutputSection {
  return { key: "field", kind: "string", optional: false };
}

function ItemFieldsEditor({
  fields,
  onChange,
}: {
  fields: NonNullable<OutputSection["itemFields"]>;
  onChange: (f: OutputSection["itemFields"]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Item fields (per object)</Label>
      {fields.map((f, idx) => (
        <div key={idx} className="flex gap-2">
          <Input
            className="w-1/3 font-mono text-xs"
            placeholder="key"
            value={f.key}
            onChange={(e) =>
              onChange(
                fields.map((x, i) =>
                  i === idx ? { ...x, key: e.target.value } : x,
                ),
              )
            }
          />
          <Input
            className="flex-1"
            placeholder="label"
            value={f.label ?? ""}
            onChange={(e) =>
              onChange(
                fields.map((x, i) =>
                  i === idx ? { ...x, label: e.target.value } : x,
                ),
              )
            }
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChange(fields.filter((_, i) => i !== idx))}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange([...fields, { key: "", label: "" }])}
      >
        <Plus className="size-4" /> Add field
      </Button>
    </div>
  );
}

export function OutputTab({ config, patch }: TabProps) {
  const sections = config.outputSchema;

  function setSections(next: OutputSection[]) {
    patch({ outputSchema: next });
  }
  function update(i: number, p: Partial<OutputSection>) {
    setSections(sections.map((s, idx) => (idx === i ? { ...s, ...p } : s)));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[i], next[j]] = [next[j], next[i]];
    setSections(next);
  }

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Each section is one field the model must return. The order here is the
        order shown on the result page.
      </p>

      {sections.map((s, i) => (
        <div key={i} className="space-y-4 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">
              Section {i + 1}
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={i === sections.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSections(sections.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Key"
              mono
              value={s.key}
              onChange={(v) =>
                update(i, { key: v.replace(/[^a-zA-Z0-9_]/g, "") })
              }
            />
            <div className="space-y-1.5">
              <Label>Kind</Label>
              <Select
                value={s.kind}
                onValueChange={(v) =>
                  update(i, { kind: v as OutputSection["kind"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTPUT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <TextField
            label="Label (shown on result page)"
            value={s.label ?? ""}
            onChange={(v) => update(i, { label: v })}
          />
          <AreaField
            label="Instruction to the model"
            rows={2}
            value={s.instruction ?? ""}
            onChange={(v) => update(i, { instruction: v })}
          />

          {(s.kind === "string" || s.kind === "string-array") && (
            <div className="grid grid-cols-2 gap-4">
              <NumberField
                label="Max characters"
                value={s.maxChars}
                onChange={(v) => update(i, { maxChars: v })}
              />
              {s.kind === "string" && (
                <TextField
                  label="Echo answer key (optional)"
                  mono
                  value={s.echoAnswer ?? ""}
                  onChange={(v) => update(i, { echoAnswer: v })}
                />
              )}
            </div>
          )}

          {(s.kind === "string-array" || s.kind === "list") && (
            <div className="grid grid-cols-2 gap-4">
              <NumberField
                label="Min items"
                value={s.min}
                onChange={(v) => update(i, { min: v })}
              />
              <NumberField
                label="Max items"
                value={s.max}
                onChange={(v) => update(i, { max: v })}
              />
            </div>
          )}

          {s.kind === "list" && (
            <ItemFieldsEditor
              fields={s.itemFields ?? []}
              onChange={(f) => update(i, { itemFields: f })}
            />
          )}

          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={s.optional}
              onCheckedChange={(c) => update(i, { optional: c })}
            />
            Optional (model may leave empty)
          </label>
        </div>
      ))}

      <Button
        variant="outline"
        onClick={() => setSections([...sections, blankSection()])}
      >
        <Plus className="size-4" /> Add output section
      </Button>
    </div>
  );
}
